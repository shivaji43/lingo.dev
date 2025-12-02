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
 * 1. Dev server with translation server for on-demand translation generation
 * 2. Babel transformation of JSX
 */

import { createUnplugin } from "unplugin";
import path from "path";
import { transformComponent } from "./transform";
import type { LoaderConfig } from "../types";
import {
  startTranslationServer,
  type TranslationServer,
} from "../translation-server";
import { loadMetadata, saveMetadataWithEntries } from "../metadata/manager";
import { createLoaderConfig } from "../utils/config-factory";
import { logger } from "../utils/logger";

export interface LingoPluginOptions extends LoaderConfig {
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

      // Start translation server on build start
      async buildStart() {
        // Start translation server if not already running
        if (!globalServer) {
          globalServer = await startTranslationServer({
            startPort: 60000,
            onError: (err) => {
              logger.error("Translation server error:", err);
            },
            config,
          });
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
        // Stop translation server
        if (globalServer) {
          await globalServer.stop();
        }
      },
    };
  },
);
