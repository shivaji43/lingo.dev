/**
 * Translation Queue System
 *
 * Manages queuing and batch processing of translations during build time.
 * This allows us to:
 * 1. Collect translation hashes as they're discovered during transformation
 * 2. Batch process all translations at the end of the build
 * 3. Wait for all translations to complete before finishing the build
 * 4. Generate static translation files for production deployment
 */

import type { LoaderConfig, TranslationEntry } from "../types";
import { EventEmitter } from "events";

export interface QueuedTranslation {
  hash: string;
  sourceText: string;
  context: TranslationEntry["context"];
  discoveredAt: Date;
}

export interface TranslationProgress {
  locale: string;
  total: number;
  completed: number;
  failed: number;
  percentage: number;
}

export interface QueueOptions {
  /**
   * Locales to generate translations for
   */
  locales: string[];

  /**
   * Maximum number of hashes to process in a single batch
   * @default 50
   */
  batchSize?: number;

  /**
   * Whether to wait for all translations to complete
   * @default true in production, false in development
   */
  waitForCompletion?: boolean;

  /**
   * Output path for static translation files
   * @default undefined (no static files generated)
   */
  publicOutputPath?: string;

  /**
   * Config for translation generation
   */
  config: LoaderConfig;
}

/**
 * Global singleton translation queue
 * This persists across all file transformations during a build
 */
export class TranslationQueue extends EventEmitter {
  private static instance: TranslationQueue | null = null;

  private queue: Map<string, QueuedTranslation> = new Map();
  private processing: boolean = false;
  private completed: Set<string> = new Set();
  private failed: Map<string, Error> = new Map();
  private options: QueueOptions | null = null;

  private constructor() {
    super();
  }

  /**
   * Get the global singleton instance
   */
  public static getInstance(): TranslationQueue {
    if (!TranslationQueue.instance) {
      TranslationQueue.instance = new TranslationQueue();
    }
    return TranslationQueue.instance;
  }

  /**
   * Reset the queue (useful for testing or new builds)
   */
  public static reset(): void {
    if (TranslationQueue.instance) {
      TranslationQueue.instance.queue.clear();
      TranslationQueue.instance.completed.clear();
      TranslationQueue.instance.failed.clear();
      TranslationQueue.instance.processing = false;
      TranslationQueue.instance.options = null;
    }
  }

  /**
   * Initialize the queue with options
   */
  public initialize(options: QueueOptions): void {
    this.options = options;
    this.emit("initialized", options);
  }

  /**
   * Add a translation to the queue
   */
  public add(translation: QueuedTranslation): void {
    if (!this.queue.has(translation.hash)) {
      this.queue.set(translation.hash, translation);
      this.emit("added", translation);
    }
  }

  /**
   * Add multiple translations to the queue
   */
  public addBatch(translations: QueuedTranslation[]): void {
    for (const translation of translations) {
      this.add(translation);
    }
  }

  /**
   * Get all queued translations
   */
  public getAll(): QueuedTranslation[] {
    return Array.from(this.queue.values());
  }

  /**
   * Get queue statistics
   */
  public getStats() {
    return {
      queued: this.queue.size,
      completed: this.completed.size,
      failed: this.failed.size,
      processing: this.processing,
    };
  }

  /**
   * Get progress for a specific locale
   */
  public getProgress(locale: string): TranslationProgress {
    const total = this.queue.size;
    const completed = this.completed.size;
    const failed = this.failed.size;

    return {
      locale,
      total,
      completed,
      failed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  /**
   * Check if the queue is empty
   */
  public isEmpty(): boolean {
    return this.queue.size === 0;
  }

  /**
   * Check if processing is in progress
   */
  public isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Process all queued translations
   * Returns a promise that resolves when all translations are complete
   */
  public async process(): Promise<void> {
    if (!this.options) {
      throw new Error(
        "TranslationQueue not initialized. Call initialize() first.",
      );
    }

    if (this.processing) {
      throw new Error("Translation processing already in progress");
    }

    if (this.isEmpty()) {
      console.log("[lingo.dev] Translation queue is empty, nothing to process");
      return;
    }

    this.processing = true;
    this.emit("processing-started");

    try {
      const { locales, batchSize = 50 } = this.options;
      const hashes = Array.from(this.queue.keys());

      console.log(
        `[lingo.dev] Processing ${hashes.length} translations for ${locales.length} locale(s)...`,
      );

      // Process each locale in parallel
      const localePromises = locales.map((locale) =>
        this.processLocale(locale, hashes, batchSize),
      );

      await Promise.all(localePromises);

      // Generate static files if configured
      if (this.options.publicOutputPath) {
        await this.generateStaticFiles();
      }

      this.emit("processing-completed");
      console.log("[lingo.dev] Translation processing completed successfully");
    } catch (error) {
      this.emit("processing-failed", error);
      console.error("[lingo.dev] Translation processing failed:", error);
      throw error;
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process translations for a single locale
   */
  private async processLocale(
    locale: string,
    hashes: string[],
    batchSize: number,
  ): Promise<void> {
    const { config } = this.options!;

    // Import here to avoid circular dependencies
    const { handleHashTranslationRequest } = await import(
      "./shared-middleware"
    );

    console.log(
      `[lingo.dev] Processing ${hashes.length} translations for locale: ${locale}`,
    );

    // Process in batches
    const batches = this.createBatches(hashes, batchSize);
    let completed = 0;

    for (const batch of batches) {
      try {
        const response = await handleHashTranslationRequest(locale, batch, {
          sourceRoot: config.sourceRoot,
          lingoDir: config.lingoDir,
          sourceLocale: config.sourceLocale,
          translator: config.translator,
          allowProductionGeneration: true,
        });

        if (response.status === 200) {
          // Mark batch as completed
          for (const hash of batch) {
            this.completed.add(hash);
          }
          completed += batch.length;

          // Emit progress event
          this.emit("progress", this.getProgress(locale));

          console.log(
            `[lingo.dev] ${locale}: ${completed}/${hashes.length} (${Math.round((completed / hashes.length) * 100)}%)`,
          );
        } else {
          throw new Error(`Translation request failed: ${response.body}`);
        }
      } catch (error) {
        // Mark batch as failed
        for (const hash of batch) {
          this.failed.set(hash, error as Error);
        }
        console.error(
          `[lingo.dev] Failed to translate batch for ${locale}:`,
          error,
        );
        // Continue with next batch instead of failing entirely
      }
    }
  }

  /**
   * Split an array into batches
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Generate static translation files for deployment
   */
  private async generateStaticFiles(): Promise<void> {
    if (!this.options?.publicOutputPath) {
      return;
    }

    const fs = await import("fs/promises");
    const path = await import("path");

    const { locales, config, publicOutputPath } = this.options;

    console.log(
      `[lingo.dev] Generating static translation files in ${publicOutputPath}`,
    );

    // Ensure output directory exists
    await fs.mkdir(publicOutputPath, { recursive: true });

    // Copy cache files to public directory
    for (const locale of locales) {
      const cacheFilePath = path.join(
        config.sourceRoot,
        config.lingoDir,
        "cache",
        `${locale}.json`,
      );
      const publicFilePath = path.join(publicOutputPath, `${locale}.json`);

      try {
        // Check if cache file exists
        await fs.access(cacheFilePath);

        // Copy to public directory
        await fs.copyFile(cacheFilePath, publicFilePath);

        console.log(`[lingo.dev] ✓ Generated ${locale}.json`);
      } catch (error) {
        console.error(`[lingo.dev] Failed to copy ${locale}.json:`, error);
      }
    }
  }

  /**
   * Wait for all translations to complete
   * Returns a promise that resolves when processing is done
   */
  public async waitForCompletion(): Promise<void> {
    if (!this.processing) {
      return;
    }

    return new Promise((resolve, reject) => {
      const onComplete = () => {
        this.off("processing-completed", onComplete);
        this.off("processing-failed", onFailed);
        resolve();
      };

      const onFailed = (error: Error) => {
        this.off("processing-completed", onComplete);
        this.off("processing-failed", onFailed);
        reject(error);
      };

      this.once("processing-completed", onComplete);
      this.once("processing-failed", onFailed);
    });
  }
}

/**
 * Helper function to get the global queue instance
 */
export function getTranslationQueue(): TranslationQueue {
  return TranslationQueue.getInstance();
}

/**
 * Helper function to create queued translations from metadata entries
 */
export function createQueuedTranslations(
  entries: Record<string, TranslationEntry>,
): QueuedTranslation[] {
  return Object.values(entries).map((entry) => ({
    hash: entry.hash,
    sourceText: entry.sourceText,
    context: entry.context,
    discoveredAt: new Date(),
  }));
}
