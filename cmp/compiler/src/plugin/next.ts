/**
 * Next.js Plugin for Lingo.dev Compiler
 *
 * Properly handles:
 * - Turbopack config merging (Next.js 16+ and legacy)
 * - Compiler options preservation
 * - Webpack config chaining
 *
 * Usage in next.config.js:
 * ```js
 * const { withLingo } = require('@lingo.dev/_compiler/next');
 *
 * // Simple usage
 * module.exports = withLingo({
 *   // Your Next.js config
 * }, {
 *   // Lingo options
 *   sourceLocale: 'en',
 *   targetLocales: ['es', 'fr'],
 *   useDirective: false,
 * });
 *
 * // With Next.js phase support
 * module.exports = async (phase, { defaultConfig }) =>
 *   withLingo({
 *     ...defaultConfig,
 *     reactStrictMode: phase === 'phase-production-build',
 *   }, {
 *     sourceLocale: 'en',
 *     targetLocales: ['es', 'fr'],
 *   });
 * ```
 */
import type { NextConfig } from "next";

import path from "path";
import { loadMetadata } from "../metadata/manager";
import fs from "fs/promises";
import { getCachePath, getConfigPath } from "../utils/path-helpers";
import { createLoaderConfig } from "../utils/config-factory";
import { logger } from "../utils/logger";
import { startTranslationServer } from "../translation-server";
import { LocaleCode } from "lingo.dev/spec";
import { CookieConfig } from "../types";
import { TurbopackOptions } from "next/dist/server/config-shared";

export interface LingoNextPluginOptions {
  /**
   * Root directory containing source files
   * @default process.cwd()
   */
  sourceRoot?: string;

  /**
   * Directory for Lingo metadata and translations
   * @default '.lingo'
   */
  lingoDir?: string;

  /**
   * The locale to translate from.
   *
   * This must match one of the following formats:
   *
   * - [ISO 639-1 language code](https://en.wikipedia.org/wiki/ISO_639-1) (e.g., `"en"`)
   * - [IETF BCP 47 language tag](https://en.wikipedia.org/wiki/IETF_language_tag) (e.g., `"en-US"`)
   *
   * @default "en"
   */
  sourceLocale: LocaleCode;

  /**
   * The locale(s) to translate to.
   *
   * Each locale must match one of the following formats:
   *
   * - [ISO 639-1 language code](https://en.wikipedia.org/wiki/ISO_639-1) (e.g., `"en"`)
   * - [IETF BCP 47 language tag](https://en.wikipedia.org/wiki/IETF_language_tag) (e.g., `"en-US"`)
   *
   * @default ["es"]
   */
  targetLocales: LocaleCode[];

  /**
   * Only transform files with 'use i18n' directive
   * @default false
   */
  useDirective?: boolean;

  /**
   * File patterns to skip during transformation
   * @default [/node_modules/, /\.spec\./, /\.test\./]
   */
  skipPatterns?: RegExp[];

  /**
   * Model configuration translator
   * @default "lingo.dev"
   */
  models?: "lingo.dev" | Record<string, string>;

  /**
   * Custom translation prompt for LCP translator
   */
  prompt?: string;

  /**
   * Maximum number of translations to process in a single batch
   * Lower values = more API calls but better for rate limits
   * Higher values = fewer API calls but may hit rate limits
   * @default 50
   */
  batchSize?: number;

  /**
   * Cookie configuration for locale persistence
   * Shared between client-side LocaleSwitcher and server-side locale resolver
   * @default { name: 'locale', maxAge: 31536000 }
   */
  cookieConfig?: CookieConfig;
}

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
  newRule: { pattern: string; config: any },
): Record<string, any> {
  // Create a shallow copy to avoid mutation
  const mergedRules = { ...existingRules };

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

  return mergedRules;
}

/**
 * Build the complete Lingo config object
 */
function buildLingoConfig(
  userNextConfig: NextConfig,
  lingoOptions: LingoNextPluginOptions,
): NextConfig {
  const lingoConfig = createLoaderConfig({
    ...lingoOptions,
    framework: "next",
  });

  // Prepare Turbopack loader configuration
  const loaderConfig = {
    loader: "@lingo.dev/_compiler/turbopack-loader",
    options: {
      sourceRoot: lingoConfig.sourceRoot,
      lingoDir: lingoConfig.lingoDir,
      sourceLocale: lingoConfig.sourceLocale,
      useDirective: lingoConfig.useDirective,
      framework: lingoConfig.framework,
    },
  };

  const existingTurbopackConfig = getTurbopackConfig(userNextConfig);
  const mergedRules = mergeTurbopackRules(existingTurbopackConfig.rules ?? {}, {
    pattern: "*.{tsx,jsx}",
    config: { loaders: [loaderConfig] },
  });

  const existingResolveAlias = existingTurbopackConfig.resolveAlias;
  const mergedResolveAlias = {
    ...existingResolveAlias,
    "@lingo.dev/_compiler/config": getConfigPath(lingoConfig),
  };

  // Build Turbopack config (handles Next.js 16+ vs <16)
  let turbopackConfig: Partial<NextConfig>;
  if (hasStableTurboConfig()) {
    turbopackConfig = {
      turbopack: {
        ...userNextConfig.turbopack, // Preserve existing turbopack options
        rules: mergedRules,
        resolveAlias: mergedResolveAlias,
      },
    };
  } else {
    turbopackConfig = {
      experimental: {
        ...userNextConfig.experimental, // Preserve ALL experimental options
        // @ts-expect-error - turbo for Next.js <16
        turbo: {
          // @ts-expect-error - turbo for Next.js <16
          ...userNextConfig.experimental?.turbo, // Preserve existing turbo options
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
    // Call user's hook first if it exists
    if (
      typeof userNextConfig.compiler?.runAfterProductionCompile === "function"
    ) {
      await userNextConfig.compiler.runAfterProductionCompile({
        distDir,
        projectDir,
      });
    }

    logger.info("Running post-build translation generation...");
    let translationServer:
      | Awaited<ReturnType<typeof startTranslationServer>>
      | undefined;
    try {
      translationServer = await startTranslationServer({
        startPort: 60000,
        onError: (err) => {
          logger.error("Translation server error:", err);
        },
        config: lingoConfig,
      });

      const metadata = await loadMetadata(lingoConfig);
      const hashes = Object.keys(metadata.entries);

      if (hashes.length === 0) {
        logger.info("No translations found, skipping");
        return;
      }

      logger.info(
        `Processing ${hashes.length} translations for ${lingoConfig.targetLocales.length} locale(s)...`,
      );

      const batchSize = lingoOptions.batchSize ?? 50;

      const localePromises = lingoConfig.targetLocales.map(async (locale) => {
        logger.info(`Translating to ${locale}...`);

        const batches: string[][] = [];
        for (let i = 0; i < hashes.length; i += batchSize) {
          batches.push(hashes.slice(i, i + batchSize));
        }

        let completed = 0;

        for (const batch of batches) {
          const result = await translationServer!.translateHashes(
            locale,
            batch,
          );

          if (result.errors.length > 0) {
            logger.warn(
              `Translation completed with ${result.errors.length} errors for ${locale}`,
            );
          }

          completed += batch.length;
          const percentage = Math.round((completed / hashes.length) * 100);
          logger.info(
            `${locale}: ${completed}/${hashes.length} (${percentage}%)`,
          );
        }

        logger.info(`${locale} completed`);
      });

      await Promise.all(localePromises);

      const publicPath = distDir;
      logger.info(`Generating static translation files in ${distDir}`);

      await fs.mkdir(publicPath, { recursive: true });

      for (const locale of lingoOptions.targetLocales) {
        const cacheFilePath = getCachePath(lingoConfig, locale);
        const publicFilePath = path.join(publicPath, `${locale}.json`);

        try {
          await fs.copyFile(cacheFilePath, publicFilePath);
          logger.info(`✓ Generated ${locale}.json`);
        } catch (error) {
          logger.error(`Failed to copy ${locale}.json:`, error);
        }
      }

      logger.info("Translation generation completed successfully");
    } catch (error) {
      logger.error("Translation generation failed:", error);
      throw error;
    } finally {
      translationServer?.stop();
      logger.info("Shutting down translation server...");
    }
  };

  // Build webpack function that chains user's webpack
  const webpack = (config: any, options: any) => {
    // Apply user's webpack config first if it exists
    let modifiedConfig = config;
    if (typeof userNextConfig.webpack === "function") {
      modifiedConfig = userNextConfig.webpack(config, options);
    }

    // Add the Lingo loader
    modifiedConfig.module.rules.push({
      test: /\.(tsx|jsx)$/,
      exclude: /node_modules/,
      use: [
        {
          loader: "@lingo.dev/_compiler/turbopack-loader",
          options: {
            sourceRoot: lingoConfig.sourceRoot,
            lingoDir: lingoConfig.lingoDir,
            sourceLocale: lingoConfig.sourceLocale,
            useDirective: lingoConfig.useDirective,
            skipPatterns: lingoConfig.skipPatterns,
            framework: lingoConfig.framework,
          },
        },
      ],
    });

    return modifiedConfig;
  };

  return {
    ...userNextConfig,
    ...turbopackConfig,
    compiler: {
      ...userNextConfig.compiler,
      runAfterProductionCompile,
    },
    webpack,
  };
}

/**
 * Next.js plugin that automatically adds the Lingo loader
 *
 * @example
 * // Simple usage
 * module.exports = withLingo({ reactStrictMode: true }, lingoOptions);
 *
 * @example
 * // With Next.js phase
 * module.exports = async (phase, { defaultConfig }) =>
 *   withLingo({ ...defaultConfig, custom: phase }, lingoOptions);
 *
 * @example
 * // Chained with other plugins
 * module.exports = withOtherPlugin(withLingo(baseConfig, lingoOptions));
 */
export function withLingo(
  nextConfig: NextConfig = {},
  lingoOptions: LingoNextPluginOptions,
): NextConfig {
  return buildLingoConfig(nextConfig, lingoOptions);
}

// Also export TypeScript types
export type { NextConfig };
