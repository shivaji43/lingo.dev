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
import {
  getUniqueMetadataFileName,
  getMetadataPath,
} from "../utils/path-helpers";
import { processBuildTranslations } from "./build-translator";
import { cleanup } from "./cleanup";
import {
  startTranslationServer,
  TranslationServer,
} from "../translation-server";

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
  newRules: { pattern: string; config: any }[],
): Record<string, any> {
  const mergedRules = { ...existingRules };

  for (const newRule of newRules) {
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
// and ~ twice in the buil workers which cannot get the config otherwise, because it's not serializable.
// Workers start in separate processed by get most of the env form the main loader
function isMainRunner() {
  return !process.env.NEXT_PRIVATE_BUILD_WORKER && !process.env.IS_NEXT_WORKER;
}

export async function withLingo(
  nextConfig: NextConfig = {},
  lingoOptions: LingoNextPluginOptions,
): Promise<NextConfig> {
  const lingoConfig = createLingoConfig(lingoOptions);
  let metadataFilePath = process.env.LINGO_BUILD_METADATA_FILE_NAME;
  const isDev = process.env.NODE_ENV === "development";
  let translationServer: TranslationServer | undefined;

  logger.info(
    `Initializing Lingo.dev compiler. Is dev mode: ${isDev}. Is main runner: ${isMainRunner()}`,
  );

  if (isMainRunner()) {
    metadataFilePath = getMetadataPath(
      lingoConfig,
      getUniqueMetadataFileName(),
    );
    if (isDev && !lingoConfig.dev.translationServerUrl) {
      translationServer = await startTranslationServer({
        startPort: lingoConfig.dev.translationServerStartPort,
        onError: (err) => {
          logger.error("Translation server error:", err);
        },
        config: { ...lingoConfig, metadataFilePath },
      });
    }
    // Setup cleanup handlers for various exit scenarios
    let isCleaningUp = false;
    const doCleanup = async () => {
      if (isCleaningUp) return;
      isCleaningUp = true;
      logger.info("🛑 Shutting down Lingo.dev compiler...");
      try {
        await cleanup(translationServer, metadataFilePath!);
        logger.info("✅ Cleanup completed successfully");
      } catch (error) {
        logger.error("❌ Cleanup failed:", error);
      }
    };

    // Handle graceful shutdown signals (Ctrl+C, kill)
    // IMPORTANT: Don't call process.exit() immediately - wait for cleanup!
    process.on("SIGINT", () => {
      logger.info("Received SIGINT (Ctrl+C)");
      doCleanup().then(() => process.exit(0));
    });

    process.on("SIGTERM", () => {
      logger.info("Received SIGTERM");
      doCleanup().then(() => process.exit(0));
    });

    // Windows-specific: Ctrl+Break
    process.on("SIGBREAK", () => {
      logger.info("Received SIGBREAK (Ctrl+Break)");
      doCleanup().then(() => process.exit(0));
    });
    process.env.LINGO_BUILD_METADATA_FILE_NAME = metadataFilePath;
  }

  if (!metadataFilePath) {
    logger.error("Failed to create metadata file");
    process.exit(1);
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
    {
      pattern: "**/dev-config.mjs",
      config: {
        loaders: [
          {
            loader: "@lingo.dev/compiler/dev-server-loader",
            options: {
              sourceRoot: lingoConfig.sourceRoot,
              lingoDir: lingoConfig.lingoDir,
              dev: {
                translationServerUrl: translationServer?.getUrl(),
                ...lingoConfig.dev,
              },
              sourceLocale: lingoConfig.sourceLocale,
              metadataFilePath,
            },
          },
        ],
      },
    },
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

      await cleanup(undefined, metadataFilePath);
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
          translationServerUrl: translationServer?.getUrl(),
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
