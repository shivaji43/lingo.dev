/**
 * Universal Plugin for Lingo.dev Compiler
 *
 * Built with unplugin to support:
 * - Vite
 * - Webpack
 *
 * Provides:
 * 1. Dev server with translation server for on-demand translation generation
 * 2. Babel transformation of JSX
 */
import { createUnplugin } from "unplugin";
import { transformComponent } from "./transform";
import type {
  LingoConfig,
  LingoInternalFields,
  PartialLingoConfig,
} from "../types";
import {
  startTranslationServer,
  type TranslationServer,
} from "../translation-server";
import {
  cleanupExistingMetadata,
  getMetadataPath as rawGetMetadataPath,
  MetadataManager,
} from "../metadata/manager";
import { createLingoConfig } from "../utils/config-factory";
import { logger } from "../utils/logger";
import { useI18nRegex } from "./transform/use-i18n";
import {
  generateClientLocaleModule,
  generateDevConfigModule,
  generateServerLocaleModule,
} from "./locale-code-generator";
import { processBuildTranslations } from "./build-translator";
import { registerCleanupOnCurrentProcess } from "./cleanup";
import path from "path";
import fs from "fs";

export type LingoPluginOptions = PartialLingoConfig;

let translationServer: TranslationServer;

const PLUGIN_NAME = "lingo-compiler";

function tryLocalOrReturnVirtual(
  config: LingoConfig,
  fileName: string,
  virtualName: string,
) {
  const customPath = path.join(config.sourceRoot, config.lingoDir, fileName);
  if (fs.existsSync(customPath)) {
    return customPath;
  }
  return virtualName;
}

// TODO (AleksandrSl 14/12/2025): Could we type this so we are sure we match the virtual model names
const virtualModulesResolvers = {
  "@lingo.dev/compiler/dev-config": (config: LingoConfig) =>
    "\0virtual:lingo-dev-config",
  "@lingo.dev/compiler/locale/server": (config: LingoConfig) =>
    tryLocalOrReturnVirtual(
      config,
      "locale-resolver.server.ts",
      "\0virtual:locale-resolver.server",
    ),
  "@lingo.dev/compiler/locale/client": (config: LingoConfig) =>
    tryLocalOrReturnVirtual(
      config,
      "locale-resolver.client.ts",
      "\0virtual:locale-resolver.client",
    ),
} satisfies Record<string, (config: LingoConfig) => string>;

const virtualModulesLoaders = {
  "\0virtual:lingo-dev-config": (config: LingoConfig) =>
    generateDevConfigModule(config),
  "\0virtual:locale-resolver.server": (config: LingoConfig) =>
    generateServerLocaleModule(config),
  "\0virtual:locale-resolver.client": (config: LingoConfig) =>
    generateClientLocaleModule(config),
} satisfies Record<string, (config: LingoConfig) => string>;

/**
 * Universal plugin for Lingo.dev compiler
 * Supports Vite, Webpack, Rollup, and esbuild
 */
export const lingoUnplugin = createUnplugin<
  LingoPluginOptions & Partial<Pick<LingoConfig, LingoInternalFields>>
>((options) => {
  const config = createLingoConfig(options);

  // Won't work for webpack most likely. Use mode there to set correct environment in configs.
  const isDev = config.environment === "development";
  const startPort = config.dev.translationServerStartPort;

  // For webpack: store the actual mode and use it to compute the correct metadata path
  let webpackMode: "development" | "production" | undefined;
  // Should be dynamic, because webpack only tells us the mode inside the plugin, not inside the config.
  const getMetadataPath = () => {
    return rawGetMetadataPath(
      webpackMode ? { ...config, environment: webpackMode } : config,
    );
  };

  return {
    name: PLUGIN_NAME,
    enforce: "pre", // Run before other plugins (especially before React plugin)

    vite: {
      async buildStart() {
        const metadataFilePath = getMetadataPath();

        cleanupExistingMetadata(metadataFilePath);

        registerCleanupOnCurrentProcess({
          cleanup: () => cleanupExistingMetadata(metadataFilePath),
        });
        if (isDev && !translationServer) {
          translationServer = await startTranslationServer({
            startPort,
            onError: (err) => {
              logger.error("Translation server error:", err);
            },
            onReady: (port) => {
              logger.info(
                `Translation server started successfully on port: ${port}`,
              );
            },
            config,
          });

          registerCleanupOnCurrentProcess({
            asyncCleanup: async () => {
              await translationServer.stop();
            },
          });
        }
      },

      async buildEnd() {
        const metadataFilePath = getMetadataPath();
        if (!isDev) {
          try {
            await processBuildTranslations({
              config,
              publicOutputPath: "public/translations",
              metadataFilePath,
            });
          } catch (error) {
            logger.error("Build-time translation processing failed:", error);
          }
        }
      },
    },

    webpack(compiler) {
      webpackMode =
        compiler.options.mode === "development" ? "development" : "production";
      const metadataFilePath = getMetadataPath();
      // Yes, this is dirty play, but webpack runs only for this plugin, and this way we save people from using wrong config
      config.environment = webpackMode;

      compiler.hooks.initialize.tap(PLUGIN_NAME, () => {
        cleanupExistingMetadata(metadataFilePath);
        registerCleanupOnCurrentProcess({
          cleanup: () => cleanupExistingMetadata(metadataFilePath),
        });
      });

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
        if (webpackMode === "development" && !translationServer) {
          translationServer = await startTranslationServer({
            startPort,
            onError: (err) => {
              logger.error("Translation server error:", err);
            },
            onReady: (port) => {
              logger.info(
                `Translation server started successfully on port: ${port}`,
              );
            },
            config,
          });
          registerCleanupOnCurrentProcess({
            asyncCleanup: async () => {
              await translationServer.stop();
            },
          });
        }
      });

      compiler.hooks.additionalPass.tapPromise(PLUGIN_NAME, async () => {
        if (webpackMode === "production") {
          try {
            await processBuildTranslations({
              config,
              publicOutputPath: "public/translations",
              metadataFilePath,
            });
          } catch (error) {
            logger.error("Build-time translation processing failed:", error);
            throw error;
          }
        }
      });

      // Duplicates the cleanup process handlers does, but won't hurt since cleanup is idempotent.
      compiler.hooks.shutdown.tapPromise(PLUGIN_NAME, async () => {
        cleanupExistingMetadata(metadataFilePath);
        await translationServer?.stop();
      });
    },

    resolveId(id) {
      const handler = virtualModulesResolvers[id];
      if (handler) {
        return handler(config);
      }
      return null;
    },

    load: {
      filter: {
        // Without the filter webpack goes mad
        id: /virtual:/,
      },
      handler(id: string) {
        const handler = virtualModulesLoaders[id];
        if (handler) {
          return handler(config);
        }
        return null;
      },
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
        // TODO (AleksandrSl 13/12/2025): It's weird we don't have any this.getOptions() here
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
          const metadataManager = new MetadataManager(getMetadataPath());

          // Update metadata with new entries (thread-safe)
          if (result.newEntries && result.newEntries.length > 0) {
            logger.debug(
              `Updating metadata with ${result.newEntries.length} new entries`,
            );

            await metadataManager.saveMetadataWithEntries(result.newEntries);

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
  };
});
