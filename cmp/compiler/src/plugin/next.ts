/**
 * Next.js Plugin for Lingo.dev Compiler
 *
 * Usage in next.config.js:
 * ```js
 * const { withLingo } = require('@lingo.dev/_compiler/next');
 *
 * module.exports = withLingo({
 *   // Your Next.js config
 * }, {
 *   // Lingo options (optional)
 *   sourceLocale: 'en',
 *   useDirective: false,
 * });
 * ```
 */
import type { NextConfig } from "next";

import path from "path";
import { loadMetadata } from "../metadata/manager";
import { handleHashTranslationRequest } from "./shared-middleware";
import fs from "fs/promises";
import type { TranslatorConfig } from "../translate";
import { getCachePath } from "../utils/path-helpers";
import { createLoaderConfig } from "../utils/config-factory";
import { logger } from "../utils/logger";
import { startTranslationServer } from "../server";
import { LocaleCode } from "lingo.dev/spec";

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
   * Translation service configuration
   */
  translator?: TranslatorConfig;

  /**
   * Maximum number of translations to process in a single batch
   * Lower values = more API calls but better for rate limits
   * Higher values = fewer API calls but may hit rate limits
   * @default 50
   */
  batchSize?: number;
}

// TODO (AleksandrSl 24/11/2025):
// 1. Detect if trubopack is used.
// 2. Merge configs correctly.
//  See
//  https://github.com/getsentry/sentry-javascript/blob/develop/packages/nextjs/src/config/util.ts#L172
//  https://github.com/amannn/next-intl/blob/main/packages/next-intl/src/plugin/getNextConfig.tsx
/**
 * Next.js plugin that automatically adds the Lingo loader
 */
export function withLingo(
  nextConfig: NextConfig = {},
  lingoOptions: LingoNextPluginOptions,
): NextConfig {
  const lingoConfig = createLoaderConfig({
    ...lingoOptions,
    isDev: process.env.NODE_ENV !== "production",
    framework: "next",
  });

  return {
    ...nextConfig,
    compiler: {
      runAfterProductionCompile: async ({ distDir, projectDir }) => {
        // Call user's hook first if it exists
        if (
          typeof nextConfig.compiler?.runAfterProductionCompile === "function"
        ) {
          await nextConfig.compiler.runAfterProductionCompile({
            distDir,
            projectDir,
          });
        }

        logger.info("Running post-build translation generation...");
        let translationServer;
        try {
          translationServer = await startTranslationServer({
            startPort: 60000,
            onError: (err) => {
              logger.error("Translation server error:", err);
            },
            onReady: () => {
              logger.info("Translation server started");
            },
            config: lingoConfig,
          });

          // Load all translation hashes from metadata
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

          // Process all locales in parallel
          const localePromises = lingoConfig.targetLocales.map(
            async (locale) => {
              logger.info(`Translating to ${locale}...`);

              // Split into batches
              const batches: string[][] = [];
              for (let i = 0; i < hashes.length; i += batchSize) {
                batches.push(hashes.slice(i, i + batchSize));
              }

              let completed = 0;

              // Process batches sequentially for this locale
              for (const batch of batches) {
                const response = await handleHashTranslationRequest(
                  locale,
                  batch,
                  {
                    ...lingoConfig,
                    allowProductionGeneration: true,
                  },
                );

                if (response.status !== 200) {
                  throw new Error(
                    `Translation failed for ${locale}: ${response.body}`,
                  );
                }

                completed += batch.length;
                const percentage = Math.round(
                  (completed / hashes.length) * 100,
                );
                logger.info(
                  `${locale}: ${completed}/${hashes.length} (${percentage}%)`,
                );
              }

              logger.info(`${locale} completed`);
            },
          );

          // Wait for all locales to complete
          await Promise.all(localePromises);

          // Generate static files if configured
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
          // This prevents the process from hanging after build completion
          translationServer?.stop();
          logger.info("Shutting down translation server...");
        }
      },
    },

    turbopack: {
      rules: {
        "*.{tsx,jsx}": {
          loaders: [
            {
              loader: "@lingo.dev/_compiler/turbopack-loader",
              options: {
                sourceRoot: lingoConfig.sourceRoot,
                lingoDir: lingoConfig.lingoDir,
                sourceLocale: lingoConfig.sourceLocale,
                useDirective: lingoConfig.useDirective,
                translator: lingoConfig.translator
                  ? JSON.stringify(lingoConfig.translator)
                  : "null",
                isDev: lingoConfig.isDev,
                // TODO (AleksandrSl 24/11/2025): This one should be serialized properly.
                // skipPatterns: lingoConfig.skipPatterns,
                framework: lingoConfig.framework,
              } as any,
            },
          ],
        },
      },
    },
    webpack(config: any, options: any) {
      // Apply user's webpack config first if it exists
      if (typeof nextConfig.webpack === "function") {
        config = nextConfig.webpack(config, options);
      }

      // Add the Lingo loader
      config.module.rules.push({
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
              translator: lingoConfig.translator,
              framework: lingoConfig.framework,
            },
          },
        ],
      });

      return config;
    },
  };
}

// Also export TypeScript types
export type { NextConfig };
