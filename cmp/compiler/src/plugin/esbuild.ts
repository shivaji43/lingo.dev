/**
 * esbuild Plugin for Lingo.dev Compiler
 *
 * Usage:
 * ```js
 * // build.js
 * import { build } from 'esbuild';
 * import { lingoCompilerPlugin } from '@lingo.dev/_compiler/esbuild';
 *
 * await build({
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
 * esbuild plugin with framework automatically set
 */
export function lingoCompilerPlugin(options: Partial<LingoPluginOptions> = {}) {
  return lingoUnplugin.esbuild({
    ...options,
    framework: "esbuild",
  } as LingoPluginOptions);
}

export type { LingoPluginOptions };
