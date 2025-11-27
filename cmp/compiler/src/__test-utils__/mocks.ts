/**
 * Shared test utilities and mock factories
 * Prevents duplication of test helper functions across test files
 */

import type {
  LoaderConfig,
  MetadataSchema,
  TranslationEntry,
  TranslationContext,
} from "../types";
import type { DictionarySchema } from "../react/server";
import { createLoaderConfig } from "../utils/config-factory";

/**
 * Create a mock metadata schema for testing
 *
 * @param overrides - Partial metadata to override defaults
 * @returns Complete MetadataSchema
 *
 * @example
 * ```typescript
 * const metadata = createMockMetadata({
 *   entries: {
 *     "abc123": createMockTranslationEntry({ sourceText: "Hello" })
 *   }
 * });
 * ```
 */
export function createMockMetadata(
  overrides?: Partial<MetadataSchema>,
): MetadataSchema {
  return {
    version: "0.1",
    entries: {},
    stats: {
      totalEntries: 0,
      lastUpdated: new Date().toISOString(),
    },
    ...overrides,
  };
}

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
 *   isDev: false
 * });
 * ```
 */
export function createMockConfig(
  overrides?: Partial<LoaderConfig>,
): LoaderConfig {
  return createLoaderConfig({
    sourceRoot: "src",
    isDev: true,
    framework: "vite", // Default to vite (all client components)
    targetLocales: ["en", "de"],
    ...overrides,
  });
}

/**
 * Create a mock translation entry for testing
 *
 * @param overrides - Partial entry to override defaults
 * @returns Complete TranslationEntry
 *
 * @example
 * ```typescript
 * const entry = createMockTranslationEntry({
 *   sourceText: "Welcome",
 *   context: { componentName: "HomePage" }
 * });
 * ```
 */
export function createMockTranslationEntry(
  overrides?: Partial<TranslationEntry>,
): TranslationEntry {
  const defaultContext: TranslationContext = {
    componentName: "TestComponent",
    filePath: "test/component.tsx",
    line: 1,
    column: 0,
  };

  const sourceText = overrides?.sourceText || "Test text";
  const context = overrides?.context || defaultContext;

  // Simple hash for testing (not cryptographic)
  const hash =
    overrides?.hash ||
    `test-${sourceText.length}-${context.componentName}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    sourceText,
    context,
    hash,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  };
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
 * @param locale - Target locale
 * @returns Mock translator object
 *
 * @example
 * ```typescript
 * const translator = createMockTranslator("de");
 * const result = await translator.translate("Hello"); // -> "[de] Hello"
 * ```
 */
export function createMockTranslator(locale: string = "en") {
  return {
    translate: async (text: string) => `[${locale}] ${text}`,
    batchTranslate: async (
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
