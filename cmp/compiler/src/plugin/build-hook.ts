/**
 * Build Hook for Translation Queue Processing
 *
 * This module provides a process exit handler that ensures
 * the translation queue is processed before the build completes.
 *
 * For Next.js/Turbopack builds where we don't have direct access
 * to buildEnd hooks, we register a process exit handler that will
 * wait for the translation queue to complete.
 */

import {
  getTranslationQueue,
  createQueuedTranslations,
} from "./translation-queue";
import { loadMetadata } from "../metadata/manager";
import type { LoaderConfig } from "../types";

let exitHandlerRegistered = false;

export interface BuildHookOptions {
  config: LoaderConfig;
  preGenerateLocales: string[];
  waitForTranslations?: boolean;
}

/**
 * Register a process exit handler to process the translation queue
 * This ensures translations are generated even when buildEnd hooks don't fire
 */
export function registerBuildExitHandler(options: BuildHookOptions): void {
  if (exitHandlerRegistered) {
    return; // Already registered
  }

  exitHandlerRegistered = true;

  // Register beforeExit handler for graceful shutdown
  process.on("beforeExit", async () => {
    try {
      await processBuildQueue(options);
    } catch (error) {
      console.error(
        "[lingo.dev] Failed to process translation queue on exit:",
        error,
      );
      process.exit(1);
    }
  });

  // Also register on SIGINT and SIGTERM for interrupted builds
  const gracefulShutdown = async (signal: string) => {
    console.log(
      `\n[lingo.dev] Received ${signal}, processing translation queue...`,
    );
    try {
      await processBuildQueue(options);
      process.exit(0);
    } catch (error) {
      console.error("[lingo.dev] Failed to process translation queue:", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  console.log("[lingo.dev] Build exit handler registered");
}

/**
 * Process the translation queue at the end of the build
 */
async function processBuildQueue(options: BuildHookOptions): Promise<void> {
  const queue = getTranslationQueue();

  // Skip if queue is already processing or empty
  if (queue.isProcessing()) {
    console.log("[lingo.dev] Queue already processing, waiting...");
    await queue.waitForCompletion();
    return;
  }

  const stats = queue.getStats();
  if (stats.queued === 0) {
    // Queue is empty, load from metadata instead
    console.log(
      "[lingo.dev] Queue is empty, loading translations from metadata...",
    );

    try {
      const metadata = await loadMetadata({
        sourceRoot: options.config.sourceRoot,
        lingoDir: options.config.lingoDir,
      });

      if (Object.keys(metadata.entries).length === 0) {
        console.log(
          "[lingo.dev] No translations found, skipping queue processing",
        );
        return;
      }

      console.log(
        `[lingo.dev] Adding ${Object.keys(metadata.entries).length} translations from metadata to queue`,
      );
      const queuedTranslations = createQueuedTranslations(metadata.entries);
      queue.addBatch(queuedTranslations);
    } catch (error) {
      console.error("[lingo.dev] Failed to load metadata:", error);
      throw error;
    }
  }

  // Process the queue
  console.log(`[lingo.dev] Processing ${stats.queued} queued translations...`);

  try {
    await queue.process();

    if (options.waitForTranslations !== false) {
      await queue.waitForCompletion();
    }

    const finalStats = queue.getStats();
    console.log(
      "[lingo.dev] ✓ Translation queue processing completed:",
      finalStats,
    );
  } catch (error) {
    console.error("[lingo.dev] Translation queue processing failed:", error);
    throw error;
  }
}

/**
 * Manually trigger queue processing
 * Useful for testing or custom build scripts
 */
export async function triggerQueueProcessing(
  options: BuildHookOptions,
): Promise<void> {
  await processBuildQueue(options);
}
