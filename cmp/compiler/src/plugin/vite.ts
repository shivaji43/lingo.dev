/**
 * Vite Plugin for Lingo.dev Compiler
 *
 * Usage:
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { lingoCompilerPlugin } from '@lingo.dev/compiler/vite';
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

export function lingoCompilerPlugin(options: LingoPluginOptions) {
  const plugin = lingoUnplugin.vite(options);

  // Attach Lingo config for CLI extraction
  // @ts-expect-error - Internal property for CLI access
  plugin._lingoConfig = options;

  return plugin;
}

export type { LingoPluginOptions };
