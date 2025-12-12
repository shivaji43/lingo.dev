import type { NextConfig } from "next";
import type {
  NextJsWebpackConfig,
  TurbopackOptions,
  WebpackConfigContext,
} from "next/dist/server/config-shared";
import { createLingoConfig } from "../utils/config-factory";
import { logger } from "../utils/logger";
import type { PartialLingoConfig } from "../types";
import { lingoUnplugin } from "./unplugin";
import { useI18nRegex } from "./transform/use-i18n";
import { processBuildTranslations } from "./build-translator";
import { startOrGetTranslationServer } from "../translation-server/translation-server";
import { cleanupExistingMetadata, getMetadataPath } from "../metadata/manager";
import { registerCleanupOnCurrentProcess } from "./cleanup";

export type LingoNextPluginOptions = PartialLingoConfig;

/**
 * Check if Next.js supports stable turbopack config (Next.js 16+)
 */
function hasStableTurboConfig(): boolean {
  try {
    const nextPackage = require("next/package.json");
    const majorVersion = parseInt(nextPackage.version.split(".")[0], 10);
    return majorVersion >= 16;
  } catch {
    return false;
  }
}

function getTurbopackConfig(userConfig: NextConfig): TurbopackOptions {
  return (
    (hasStableTurboConfig()
      ? userConfig?.turbopack?.rules
      : // @ts-expect-error - experimental.turbo for Next.js <16
        userConfig?.experimental?.turbo) || {}
  );
}

/**
 * Merge Turbopack rules without mutating original
 */
function mergeTurbopackRules(
  existingRules: Record<string, any>,
  newRules: ({ pattern: string; config: any } | undefined)[],
): Record<string, any> {
  const mergedRules = { ...existingRules };

  for (const newRule of newRules) {
    if (!newRule) continue;
    const { pattern, config } = newRule;

    if (mergedRules[pattern]) {
      if (Array.isArray(mergedRules[pattern])) {
        mergedRules[pattern] = [...mergedRules[pattern], config];
      } else {
        mergedRules[pattern] = [mergedRules[pattern], config];
      }
    } else {
      mergedRules[pattern] = config;
    }
  }

  return mergedRules;
}

// Next read config several times. Once in the main runner,
// and ~ twice in the build workers which cannot get the config otherwise, because it's not serializable.
// Workers start in separate processed by get most of the env from the main loader
function isMainRunner() {
  return (
    !process.env.NEXT_PRIVATE_BUILD_WORKER &&
    !process.env.IS_NEXT_WORKER &&
    !process.env.NEXT_PRIVATE_WORKER
  );
}

export async function withLingo(
  nextConfig: NextConfig = {},
  lingoOptions: LingoNextPluginOptions,
): Promise<NextConfig> {
  const lingoConfig = createLingoConfig(lingoOptions);
  let metadataFilePath = getMetadataPath(lingoConfig);
  const isDev = process.env.NODE_ENV === "development";

  logger.debug(
    `Initializing Lingo.dev compiler. Is dev mode: ${isDev}. Is main runner: ${isMainRunner()}`,
  );

  // TODO (AleksandrSl 12/12/2025): Add API keys validation too, so we can log it nicely.

  // Try to start up the translation server once.
  // We have two barriers, a simple one here and a more complex one inside the startTranslationServer which doesn't start the server if it can find one running.
  // We do not use isMainRunner here, because we need to start the server as early as possible, so the loaders get the translation server url. The main runner in dev mode runs after a dev server process is started.
  if (isDev && !process.env.LINGO_TRANSLATION_SERVER_URL) {
    const translationServer = await startOrGetTranslationServer({
      startPort: lingoConfig.dev.translationServerStartPort,
      onError: (err) => {
        logger.error("Translation server error:", err);
      },
      onReady: (port) => {
        logger.info(`Translation server started successfully on port: ${port}`);
      },
      config: lingoConfig,
    });
    process.env.LINGO_TRANSLATION_SERVER_URL = translationServer.url;
    if (translationServer.server) {
      // We start the server in the same process, so we should be fine without any sync cleanup. Server should be killed with the process.
      registerCleanupOnCurrentProcess({
        asyncCleanup: async () => {
          await translationServer.server.stop();
        },
      });
    }
  }

  const translationServerUrl = process.env.LINGO_TRANSLATION_SERVER_URL;

  if (isMainRunner()) {
    // We need to cleaup the file only once, to avoid having extra translation introduced into the build, or old translation to pile up.
    cleanupExistingMetadata(metadataFilePath);

    registerCleanupOnCurrentProcess({
      cleanup: () => {
        cleanupExistingMetadata(metadataFilePath);
      },
    });
  }

  const existingTurbopackConfig = getTurbopackConfig(nextConfig);
  let mergedRules = mergeTurbopackRules(existingTurbopackConfig.rules ?? {}, [
    {
      pattern: "*.{tsx,jsx}",
      config: {
        condition: {
          content: lingoConfig.useDirective ? useI18nRegex : undefined,
        },
        loaders: [
          {
            loader: "@lingo.dev/compiler/turbopack-loader",
            options: {
              sourceRoot: lingoConfig.sourceRoot,
              lingoDir: lingoConfig.lingoDir,
              sourceLocale: lingoConfig.sourceLocale,
              useDirective: lingoConfig.useDirective,
              metadataFilePath,
            },
          },
        ],
      },
    },
    translationServerUrl
      ? {
          pattern: "**/dev-config.mjs",
          config: {
            loaders: [
              {
                loader: "@lingo.dev/compiler/dev-server-loader",
                options: {
                  sourceRoot: lingoConfig.sourceRoot,
                  lingoDir: lingoConfig.lingoDir,
                  dev: {
                    translationServerUrl,
                    ...lingoConfig.dev,
                  },
                  sourceLocale: lingoConfig.sourceLocale,
                },
              },
            ],
          },
        }
      : undefined,
    {
      pattern: "**/locale/server.mjs",
      config: {
        loaders: [
          {
            loader: "@lingo.dev/compiler/turbopack-locale-server-loader",
            options: {
              sourceRoot: lingoConfig.sourceRoot,
              lingoDir: lingoConfig.lingoDir,
              sourceLocale: lingoConfig.sourceLocale,
              cookieConfig: lingoConfig.cookieConfig,
            },
          },
        ],
      },
    },
    {
      pattern: "**/locale/client.mjs",
      config: {
        loaders: [
          {
            loader: "@lingo.dev/compiler/turbopack-locale-client-loader",
            options: {
              sourceRoot: lingoConfig.sourceRoot,
              lingoDir: lingoConfig.lingoDir,
              sourceLocale: lingoConfig.sourceLocale,
              cookieConfig: lingoConfig.cookieConfig,
            },
          },
        ],
      },
    },
  ]);

  const existingResolveAlias = existingTurbopackConfig.resolveAlias;
  const mergedResolveAlias = {
    ...existingResolveAlias,
    // TODO (AleksandrSl 08/12/2025): Describe what have to be done to support custom resolvers
  };

  let turbopackConfig: Partial<NextConfig>;
  if (hasStableTurboConfig()) {
    turbopackConfig = {
      turbopack: {
        ...nextConfig.turbopack, // Preserve existing turbopack options
        rules: mergedRules,
        resolveAlias: mergedResolveAlias,
      },
    };
  } else {
    turbopackConfig = {
      experimental: {
        ...nextConfig.experimental, // Preserve ALL experimental options
        // @ts-expect-error - turbo for Next.js <16
        turbo: {
          // @ts-expect-error - turbo for Next.js <16
          ...nextConfig.experimental?.turbo, // Preserve existing turbo options
          rules: mergedRules,
          resolveAlias: mergedResolveAlias,
        },
      },
    };
  }

  const runAfterProductionCompile = async ({
    distDir,
    projectDir,
  }: {
    distDir: string;
    projectDir: string;
  }) => {
    if (typeof nextConfig.compiler?.runAfterProductionCompile === "function") {
      await nextConfig.compiler.runAfterProductionCompile({
        distDir,
        projectDir,
      });
    }

    logger.info("Running post-build translation generation...");
    logger.info(`Build mode: Using metadata file: ${metadataFilePath}`);

    try {
      await processBuildTranslations({
        config: lingoConfig,
        publicOutputPath: distDir,
        metadataFilePath,
      });
    } catch (error) {
      logger.error("Translation generation failed:", error);
      throw error;
    }
  };

  const webpack: NextJsWebpackConfig = (
    config: any,
    options: WebpackConfigContext,
  ) => {
    // Apply user's webpack config first if it exists
    let modifiedConfig = config;
    if (typeof nextConfig.webpack === "function") {
      modifiedConfig = nextConfig.webpack(config, options);
    }

    modifiedConfig.plugins ??= [];
    modifiedConfig.plugins.unshift(
      lingoUnplugin.webpack({
        ...lingoConfig,
        dev: {
          translationServerUrl,
          ...lingoConfig.dev,
        },
      }),
    );

    logger.info("Adding Lingo.dev loader rules to webpack config");

    return modifiedConfig;
  };

  return {
    ...nextConfig,
    ...turbopackConfig,
    compiler: {
      ...nextConfig.compiler,
      runAfterProductionCompile,
    },
    webpack,
  };
}

// Also export TypeScript types
export type { NextConfig };
