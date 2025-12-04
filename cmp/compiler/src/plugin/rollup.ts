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
 *       targetLocales: ['es', 'fr'],
 *     }),
 *   ],
 * };
 * ```
 */

import { lingoUnplugin, type LingoPluginOptions } from "./unplugin";

export function lingoCompilerPlugin(options: LingoPluginOptions) {
  return lingoUnplugin.rollup(options);
}

export type { LingoPluginOptions };
