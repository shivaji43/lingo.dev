/**
 * Shared test utilities and mock factories
 * Prevents duplication of test helper functions across test files
 */

import type { LingoConfig } from "../types";
import { createLingoConfig } from "../utils/config-factory";
import type { DictionarySchema } from "../translators";

/**
 * Create a mock loader config for testing
 *
 * @param overrides - Partial config to override defaults
 * @returns Complete LoaderConfig
 *
 * @example
 * ```typescript
 * const config = createMockConfig({
 *   sourceLocale: "de",
 * });
 * ```
 */
export function createMockConfig(
  overrides?: Partial<LingoConfig>,
): LingoConfig {
  return createLingoConfig({
    sourceLocale: "en",
    sourceRoot: "src",
    targetLocales: ["en", "de"],
    ...overrides,
  });
}

/**
 * Create a mock dictionary for testing
 *
 * @param entries - Hash-to-translation mapping
 * @param locale - Target locale (default: "en")
 * @param version - Schema version (default: 0.1)
 * @returns Complete DictionarySchema
 *
 * @example
 * ```typescript
 * const dict = createMockDictionary({
 *   "abc123": "Hello",
 *   "def456": "World"
 * }, "de");
 * ```
 */
export function createMockDictionary(
  entries: Record<string, string> = {},
  locale: string = "en",
  version: number = 0.1,
): DictionarySchema {
  return {
    version,
    locale,
    entries,
  };
}

/**
 * Create a mock translator for testing
 * Returns a simple translator that prefixes all translations with the locale
 *
 * @param locale - Default locale (unused, kept for backward compatibility)
 * @returns Mock translator object
 *
 * @example
 * ```typescript
 * const translator = createMockTranslator();
 * const result = await translator.translate("de", {
 *   hash1: { text: "Hello", context: {} }
 * });
 * // -> { hash1: "[de] Hello" }
 * ```
 */
export function createMockTranslator(locale: string = "en") {
  return {
    translate: async (
      targetLocale: string,
      entries: Record<string, { text: string; context: Record<string, any> }>,
    ) => {
      const result: Record<string, string> = {};
      for (const [hash, { text }] of Object.entries(entries)) {
        result[hash] = `[${targetLocale}] ${text}`;
      }
      return result;
    },
  };
}
