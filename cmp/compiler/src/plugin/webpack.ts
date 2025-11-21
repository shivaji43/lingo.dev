/**
 * Webpack Plugin for Lingo.dev Compiler
 *
 * Usage:
 * ```js
 * // webpack.config.js
 * import { lingoCompilerPlugin } from '@lingo.dev/_compiler/webpack';
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
 * Webpack plugin with framework automatically set
 */
export function lingoCompilerPlugin(options: Partial<LingoPluginOptions> = {}) {
  return lingoUnplugin.webpack({
    ...options,
    framework: "webpack",
  } as LingoPluginOptions);
}

export type { LingoPluginOptions };
