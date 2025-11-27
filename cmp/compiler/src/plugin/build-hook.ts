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
import { logger } from "../utils/logger";

let exitHandlerRegistered = false;

export interface BuildHookOptions {
  config: LoaderConfig;
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
      logger.error("Failed to process translation queue on exit:", error);
      process.exit(1);
    }
  });

  // Also register on SIGINT and SIGTERM for interrupted builds
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, processing translation queue...`);
    try {
      await processBuildQueue(options);
      process.exit(0);
    } catch (error) {
      logger.error("Failed to process translation queue:", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  logger.info("Build exit handler registered");
}

/**
 * Process the translation queue at the end of the build
 */
async function processBuildQueue(options: BuildHookOptions): Promise<void> {
  const queue = getTranslationQueue();

  // Skip if queue is already processing or empty
  if (queue.isProcessing()) {
    logger.info("Queue already processing, waiting...");
    await queue.waitForCompletion();
    return;
  }

  const stats = queue.getStats();
  if (stats.queued === 0) {
    // Queue is empty, load from metadata instead
    logger.info("Queue is empty, loading translations from metadata...");

    try {
      const metadata = await loadMetadata({
        sourceRoot: options.config.sourceRoot,
        lingoDir: options.config.lingoDir,
      });

      if (Object.keys(metadata.entries).length === 0) {
        logger.info("No translations found, skipping queue processing");
        return;
      }

      logger.info(
        `Adding ${Object.keys(metadata.entries).length} translations from metadata to queue`,
      );
      const queuedTranslations = createQueuedTranslations(metadata.entries);
      queue.addBatch(queuedTranslations);
    } catch (error) {
      logger.error("Failed to load metadata:", error);
      throw error;
    }
  }

  // Process the queue
  logger.info(`Processing ${stats.queued} queued translations...`);

  try {
    await queue.process();

    if (options.waitForTranslations !== false) {
      await queue.waitForCompletion();
    }

    const finalStats = queue.getStats();
    logger.info("Translation queue processing completed:", finalStats);
  } catch (error) {
    logger.error("Translation queue processing failed:", error);
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
