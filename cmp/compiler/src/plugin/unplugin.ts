/**
 * Universal Plugin for Lingo.dev Compiler
 *
 * Built with unplugin to support:
 * - Vite
 * - Webpack
 * - Rollup
 * - esbuild
 *
 * Provides:
 * 1. Dev server middleware for on-demand translation generation
 * 2. Build-time pre-generation of translations
 * 3. Babel transformation of JSX
 */

import { createUnplugin } from "unplugin";
import path from "path";
import { transformComponent } from "./transform";
import type { LoaderConfig } from "../types";
import { handleTranslationRequest } from "./shared-middleware";
import {
  startTranslationServer,
  type TranslationServer,
} from "../translation-server";
import { loadMetadata, saveMetadataWithEntries } from "../metadata/manager";
import {
  createQueuedTranslations,
  getTranslationQueue,
} from "./translation-queue";
import { createLoaderConfig } from "../utils/config-factory";
import { logger } from "../utils/logger";

export interface LingoPluginOptions extends LoaderConfig {
  /**
   * Build strategy for translations
   * - 'queue': Queue translations during build, process at end (recommended for production)
   * - 'immediate': Generate translations immediately (legacy behavior)
   * @default 'queue' in production, 'immediate' in development
   */
  buildStrategy?: "queue" | "immediate";

  /**
   * Maximum number of translations to process in a single batch
   * @default 50
   */
  batchSize?: number;

  /**
   * Output path for static translation files (relative to project root)
   * If specified, translations will be copied to this directory for static serving
   * @default undefined (no static files generated)
   * @example 'public/translations'
   */
  publicOutputPath?: string;

  /**
   * Whether to wait for all translations to complete before finishing the build
   * @default true in production, false in development
   */
  waitForTranslations?: boolean;

  /**
   * Cookie configuration for locale persistence
   * Shared between client-side LocaleSwitcher and server-side locale resolver
   * @default { name: 'locale', maxAge: 31536000 }
   */
  cookieConfig?: {
    /**
     * Name of the cookie to store the locale
     * @default 'locale'
     */
    name: string;
    /**
     * Maximum age of the cookie in seconds
     * @default 31536000 (1 year)
     */
    maxAge: number;
  };
}

let globalServer: TranslationServer;

/**
 * Universal plugin for Lingo.dev compiler
 * Supports Vite, Webpack, Rollup, and esbuild
 */
export const lingoUnplugin = createUnplugin<LingoPluginOptions>(
  (options = {} as LingoPluginOptions, meta) => {
    const config: LoaderConfig = createLoaderConfig({
      ...options,
      sourceRoot: options.sourceRoot ?? "src",
    });

    const isDev = process.env.NODE_ENV === "development";

    return {
      name: "lingo-compiler",
      enforce: "pre", // Run before other plugins (especially before React plugin)

      // esbuild-specific hooks
      async buildStart() {
        // Start translation server if not already running
        if (!globalServer) {
          globalServer = await startTranslationServer({
            startPort: 60000,
            onError: (err) => {
              logger.error("Translation server error:", err);
            },
            onReady: () => {
              logger.info("Translation server started");
            },
            config,
          });
        }

        // Initialize translation queue for production builds
        if (!isDev && options.targetLocales?.length) {
          const buildStrategy = options.buildStrategy ?? "queue";

          if (buildStrategy === "queue") {
            logger.info("Initializing translation queue for build...");

            const queue = getTranslationQueue();
            queue.initialize({
              locales: options.targetLocales,
              batchSize: options.batchSize ?? 50,
              waitForCompletion: options.waitForTranslations ?? true,
              publicOutputPath: options.publicOutputPath
                ? path.join(process.cwd(), options.publicOutputPath)
                : undefined,
              config,
            });
          }
        }
      },

      transform: {
        filter: {
          id: {
            include: [/\.[tj]sx$/],
            exclude: /node_modules/,
          },
        },
        handler: async (code, id) => {
          try {
            logger.debug(`transform() called for: ${id}`);
            logger.debug(
              `Code length: ${code.length}, First 100 chars: ${code.substring(0, 100)}`,
            );

            // Get relative path from sourceRoot
            const relativePath = path
              .relative(path.join(process.cwd(), config.sourceRoot), id)
              .split(path.sep)
              .join("/"); // Normalize for cross-platform consistency

            logger.debug(`Relative path: ${relativePath}`);
            logger.debug(`Config:`, {
              sourceRoot: config.sourceRoot,
              lingoDir: config.lingoDir,
            });

            // Load current metadata
            const metadata = await loadMetadata({
              sourceRoot: config.sourceRoot,
              lingoDir: config.lingoDir,
            });

            logger.debug(
              `Metadata loaded, entries:`,
              Object.keys(metadata.entries).length,
            );

            // Transform the component
            const result = transformComponent({
              code,
              filePath: id,
              config,
              metadata,
              serverUrl: globalServer?.getUrl(),
            });

            logger.debug(`Transform result:`, {
              transformed: result.transformed,
              newEntriesCount: result.newEntries?.length || 0,
            });

            // console.debug(result.code);
            // If no transformation occurred, return original code
            if (!result.transformed) {
              logger.debug(`No transformation needed for ${id}`);
              return null;
            }

            // Update metadata with new entries (thread-safe)
            if (result.newEntries && result.newEntries.length > 0) {
              logger.debug(
                `Updating metadata with ${result.newEntries.length} new entries`,
              );

              // TODO (AleksandrSl 30/11/2025): Could make async in the future, so we don't pause the main transform, translation server should be able to know if the metadata is finished writing then.
              // Thread-safe atomic update
              await saveMetadataWithEntries(config, result.newEntries);

              // Queue translations if using queue strategy in production
              const buildStrategy = options.buildStrategy ?? "queue";
              if (
                !isDev &&
                buildStrategy === "queue" &&
                options.targetLocales?.length
              ) {
                const queue = getTranslationQueue();
                const queuedTranslations = createQueuedTranslations(
                  result.newEntries.reduce(
                    (acc, entry) => {
                      acc[entry.hash] = entry;
                      return acc;
                    },
                    {} as Record<string, (typeof result.newEntries)[0]>,
                  ),
                );
                queue.addBatch(queuedTranslations);
              }

              // Log new translations discovered (in dev mode)
              if (isDev) {
                logger.info(
                  `Found ${result.newEntries.length} translatable text(s) in ${id}`,
                );
              }
            }

            logger.debug(`Returning transformed code for ${id}`);
            return {
              code: result.code,
              map: result.map,
            };
          } catch (error) {
            logger.error(`Transform error in ${id}:`, error);
            return null;
          }
        },
      },

      async buildEnd() {
        // Pre-generate translations for specified locales during build
        try {
          if (!isDev && options.targetLocales?.length) {
            const buildStrategy = options.buildStrategy ?? "queue";

            if (buildStrategy === "queue") {
              // Use new queue-based approach
              logger.info("Processing translation queue...");

              const queue = getTranslationQueue();

              // Add all existing metadata entries to queue if not already queued
              const metadata = await loadMetadata({
                sourceRoot: config.sourceRoot,
                lingoDir: config.lingoDir,
              });

              if (queue.isEmpty() && Object.keys(metadata.entries).length > 0) {
                logger.info(
                  `Adding ${Object.keys(metadata.entries).length} existing translations to queue`,
                );
                const queuedTranslations = createQueuedTranslations(
                  metadata.entries,
                );
                queue.addBatch(queuedTranslations);
              }

              // Process the queue
              try {
                await queue.process();

                // Wait for completion if configured
                if (options.waitForTranslations !== false) {
                  await queue.waitForCompletion();
                }

                const stats = queue.getStats();
                logger.info(`Translation queue completed:`, stats);
              } catch (error) {
                logger.error("Failed to process translation queue:", error);
                throw error;
              }
            } else {
              // Legacy immediate approach
              logger.info(
                "Pre-generating translations for build (immediate mode)...",
              );

              for (const locale of options.targetLocales) {
                try {
                  const response = await handleTranslationRequest(locale, {
                    sourceRoot: config.sourceRoot,
                    lingoDir: config.lingoDir,
                    sourceLocale: config.sourceLocale,
                    translator: config.translator,
                    useCache: config.useCache,
                  });

                  if (response.status !== 200) {
                    logger.error(
                      `Failed to pre-generate ${locale}: ${response.body}`,
                    );
                  }
                } catch (error) {
                  logger.error(`Failed to pre-generate ${locale}:`, error);
                }
              }
            }
          }
        } finally {
          globalServer?.stop();
        }
      },
    };
  },
);
