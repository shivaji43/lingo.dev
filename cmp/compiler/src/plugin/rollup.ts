/**
 * Rollup Plugin for Lingo.dev Compiler
 *
 * Usage:
 * ```js
 * // rollup.config.js
 * import { lingoCompilerPlugin } from '@lingo.dev/_compiler/rollup';
 *
 * export default {
 *   plugins: [
 *     lingoCompilerPlugin({
 *       sourceLocale: 'en',
 *       preGenerateLocales: ['es', 'fr'],
 *     }),
 *   ],
 * };
 * ```
 */

import { lingoUnplugin, type LingoPluginOptions } from "./unplugin";

/**
 * Rollup plugin with framework automatically set
 */
export function lingoCompilerPlugin(options: Partial<LingoPluginOptions> = {}) {
  return lingoUnplugin.rollup({
    ...options,
    framework: "rollup",
  } as LingoPluginOptions);
}

export type { LingoPluginOptions };
