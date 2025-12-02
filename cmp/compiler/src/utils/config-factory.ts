/**
 * Config factory for creating LoaderConfig instances
 * Centralizes default values and reduces duplication
 */

import type { LoaderConfig } from "../types";
import type { Framework } from "../types/framework";

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  sourceRoot: process.cwd(),
  lingoDir: ".lingo",
  sourceLocale: "en",
  useDirective: false,
  framework: "unknown" as Framework,
  skipPatterns: [/node_modules/, /\.spec\./, /\.test\./] as RegExp[],
};

/**
 * Create a LoaderConfig with defaults applied
 *
 * @param options - Partial config to override defaults
 * @returns Complete LoaderConfig with all defaults applied
 *
 * @example
 * ```typescript
 * const config = createLoaderConfig({
 *   sourceRoot: "src",
 *   framework: "vite"
 * });
 * ```
 */
export function createLoaderConfig(
  options: Partial<Omit<LoaderConfig, "targetLocales">> &
    Pick<LoaderConfig, "targetLocales">,
): LoaderConfig {
  return {
    sourceRoot: options.sourceRoot ?? DEFAULT_CONFIG.sourceRoot,
    lingoDir: options.lingoDir ?? DEFAULT_CONFIG.lingoDir,
    sourceLocale: options.sourceLocale ?? DEFAULT_CONFIG.sourceLocale,
    useDirective: options.useDirective ?? DEFAULT_CONFIG.useDirective,
    framework: options.framework ?? DEFAULT_CONFIG.framework,
    skipPatterns: options.skipPatterns ?? DEFAULT_CONFIG.skipPatterns,
    models: options.models,
    prompt: options.prompt,
    dev: options.dev,
    targetLocales: options.targetLocales,
  };
}
