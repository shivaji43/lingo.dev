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
import { transformComponent } from "./transform";
import type { PartialLingoConfig } from "../types";
import {
  startTranslationServer,
  type TranslationServer,
} from "../translation-server";
import { saveMetadataWithEntries } from "../metadata/manager";
import { createLingoConfig } from "../utils/config-factory";
import { logger } from "../utils/logger";
import { getCacheDir } from "../utils/path-helpers";

export type LingoPluginOptions = PartialLingoConfig;

let globalServer: TranslationServer;

/**
 * Universal plugin for Lingo.dev compiler
 * Supports Vite, Webpack, Rollup, and esbuild
 */
export const lingoUnplugin = createUnplugin<LingoPluginOptions>((options) => {
  const config = createLingoConfig(options);

  const isDev = process.env.NODE_ENV === "development";
  const startPort = config.dev.serverStartPort;

  return {
    name: "lingo-compiler",
    enforce: "pre", // Run before other plugins (especially before React plugin)

    // Start translation server on build start
    async buildStart() {
      // Start translation server if not already running
      if (!globalServer) {
        globalServer = await startTranslationServer({
          startPort,
          onError: (err) => {
            logger.error("Translation server error:", err);
          },
          config,
        });
      }
    },

    resolveId(id) {
      if (id === "@lingo.dev/_compiler/dev-config") {
        // Return a virtual module ID (prefix with \0 to mark it as virtual)
        return "\0virtual:lingo-dev-config";
      }
      return null;
    },

    load(id) {
      if (id === "\0virtual:lingo-dev-config") {
        const serverUrl =
          globalServer?.getUrl() || `http://127.0.0.1:${startPort}`;
        const cacheDir = getCacheDir(config);

        return `export const serverUrl = ${JSON.stringify(serverUrl)};
export const cacheDir = ${JSON.stringify(cacheDir)};`;
      }
      return null;
    },

    transform: {
      filter: {
        id: {
          include: [/\.[tj]sx$/],
          exclude: /node_modules/,
        },
        // If useDirective is enabled, only process files with "use i18n"
        // This is more efficient than checking in the handler
        code: config.useDirective
          ? /^\s*(?:["']use (?:strict|client|server)["']\s*;?\s*)*["']use i18n["']\s*;?/m
          : undefined,
      },
      handler: async (code, id) => {
        try {
          // Transform the component
          const result = transformComponent({
            code,
            filePath: id,
            config,
          });

          logger.debug(`Transforming ${result.code}`);

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
      // Process build-time translations (only in production)
      if (!isDev) {
        try {
          const { processBuildTranslations } = await import(
            "./build-translator"
          );

          await processBuildTranslations({
            config,
            // Note: publicOutputPath can be set by users in their config
            // For Vite, this might be dist/public or public/translations
            // For now, we don't set it here - users can handle it in their pipeline
          });
        } catch (error) {
          logger.error("Build-time translation processing failed:", error);
          throw error;
        }
      }

      // Stop translation server
      if (globalServer) {
        await globalServer.stop();
      }
    },
  };
});
