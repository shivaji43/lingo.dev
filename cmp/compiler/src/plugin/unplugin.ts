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
import { useI18nRegex } from "./transform/use-i18n";
import {
  generateClientLocaleCode,
  generateServerLocaleCode,
} from "./locale-code-generator";
import * as path from "path";
import * as fs from "fs";

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

    // Start translation server on build start (dev mode only)
    async buildStart() {
      // Only start translation server in development mode
      if (isDev && !globalServer) {
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
      if (id === "@lingo.dev/compiler/dev-config") {
        // Return a virtual module ID (prefix with \0 to mark it as virtual)
        return "\0virtual:lingo-dev-config";
      }

      // Check for custom user implementation files first
      // Locale modules resolve to virtual modules for dynamic generation
      // The stub files are only used for Turbopack (via loaders)
      if (id === "@lingo.dev/compiler/locale/server") {
        const customPath = path.join(
          config.sourceRoot,
          config.lingoDir,
          "locale-resolver.server.ts",
        );
        if (fs.existsSync(customPath)) {
          return customPath;
        }
        return "\0virtual:locale-server";
      }

      if (id === "@lingo.dev/compiler/locale/client") {
        const customPath = path.join(
          config.sourceRoot,
          config.lingoDir,
          "locale-resolver.client.ts",
        );
        if (fs.existsSync(customPath)) {
          return customPath;
        }
        return "\0virtual:locale-client";
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

      // Server locale resolver - default implementation
      if (id === "\0virtual:locale-server") {
        // For Next.js, generate server-side locale resolver using cookies
        const implementation = generateServerLocaleCode(config);
        return `
export async function getServerLocale() {${implementation}
}
`;
      }

      // Client locale resolver - default implementation
      // Includes both getClientLocale() and persistLocale()
      if (id === "\0virtual:locale-client") {
        const { getClientLocale, persistLocale } =
          generateClientLocaleCode(config);
        return `
export function getClientLocale() {
  ${getClientLocale}
}

export function persistLocale(locale) {
  ${persistLocale}
}`;
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
        code: config.useDirective ? useI18nRegex : undefined,
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
            publicOutputPath: "public/translations",
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
