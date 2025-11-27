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
  return lingoUnplugin.vite({
    ...options,
    framework: "vite",
  } as LingoPluginOptions);
}

export type { LingoPluginOptions };
