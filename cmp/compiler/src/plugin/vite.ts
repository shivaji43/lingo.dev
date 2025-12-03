/**
 * Vite Plugin for Lingo.dev Compiler
 *
 * Usage:
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { lingoCompilerPlugin } from '@lingo.dev/_compiler/vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     lingoCompilerPlugin({
 *       sourceLocale: 'en',
 *       targetLocales: ['es', 'fr'],
 *     }),
 *   ],
 * });
 * ```
 */

import { lingoUnplugin, type LingoPluginOptions } from "./unplugin";

/**
 * Vite plugin with framework automatically set
 */
export function lingoCompilerPlugin(options: Partial<LingoPluginOptions> = {}) {
  const fullOptions = {
    ...options,
    framework: "vite",
  } as LingoPluginOptions;

  const plugin = lingoUnplugin.vite(fullOptions);

  // Attach Lingo config for CLI extraction
  // @ts-expect-error - Internal property for CLI access
  plugin._lingoConfig = fullOptions;

  return plugin;
}

export type { LingoPluginOptions };
