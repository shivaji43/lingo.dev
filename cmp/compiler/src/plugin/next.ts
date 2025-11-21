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
   * Source locale (default language)
   * @default 'en'
   */
  sourceLocale?: string;

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
  translator?: {
    type: "pseudo" | "openai" | "anthropic";
    apiKey?: string;
  };
}

/**
 * Next.js plugin that automatically adds the Lingo loader
 */
export function withLingo(
  nextConfig: NextConfig = {},
  lingoOptions: LingoNextPluginOptions = {},
): NextConfig {
  return {
    ...nextConfig,
    turbopack: {
      rules: {
        "*.{tsx,jsx}": {
          loaders: [
            {
              loader: "@lingo.dev/_compiler/turbopack-loader",
              options: {
                sourceRoot: lingoOptions.sourceRoot || process.cwd(),
                lingoDir: lingoOptions.lingoDir || ".lingo",
                sourceLocale: lingoOptions.sourceLocale || "en",
                useDirective: lingoOptions.useDirective ?? false,
                translator: lingoOptions.translator ?? "null",
              },
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
              sourceRoot: lingoOptions.sourceRoot || process.cwd(),
              lingoDir: lingoOptions.lingoDir || ".lingo",
              sourceLocale: lingoOptions.sourceLocale || "en",
              useDirective: lingoOptions.useDirective ?? false,
              skipPatterns: lingoOptions.skipPatterns || [
                /node_modules/,
                /\.spec\./,
                /\.test\./,
              ],
              translator: lingoOptions.translator,
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
