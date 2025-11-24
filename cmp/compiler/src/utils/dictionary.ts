/**
 * Dictionary utility functions
 * Centralizes common dictionary manipulation logic
 */

import type { DictionarySchema } from "../react/server";
import type { MetadataSchema } from "../types";

/**
 * Create a dictionary from a set of translation entries
 *
 * @param entries - Hash-to-translation mapping
 * @param locale - Target locale code
 * @param version - Schema version (defaults to 0.1)
 * @returns Complete DictionarySchema
 *
 * @example
 * ```typescript
 * const dict = createDictionary(
 *   { "abc123": "Hello" },
 *   "en",
 *   0.1
 * );
 * ```
 */
export function createDictionary(
  entries: Record<string, string>,
  locale: string,
  version: number = 0.1,
): DictionarySchema {
  return {
    version,
    locale,
    entries,
  };
}

/**
 * Create a dictionary from metadata entries
 * Extracts sourceText from each translation entry
 *
 * @param metadata - Metadata containing translation entries
 * @param locale - Target locale code
 * @returns DictionarySchema with source texts
 *
 * @example
 * ```typescript
 * const metadata = await loadMetadata(config);
 * const sourceDict = createDictionaryFromMetadata(metadata, "en");
 * ```
 */
export function createDictionaryFromMetadata(
  metadata: MetadataSchema,
  locale: string,
): DictionarySchema {
  const entries = Object.entries(metadata.entries || {}).reduce(
    (acc, [hash, entry]) => {
      acc[hash] = entry.sourceText;
      return acc;
    },
    {} as Record<string, string>,
  );

  return createDictionary(entries, locale);
}

/**
 * Merge multiple dictionaries into one
 * Later dictionaries override earlier ones for duplicate keys
 *
 * @param dictionaries - Dictionaries to merge (in order of precedence)
 * @returns Merged dictionary with combined entries
 *
 * @example
 * ```typescript
 * const merged = mergeDictionaries(
 *   baseDict,
 *   overrideDict
 * );
 * ```
 */
export function mergeDictionaries(
  ...dictionaries: DictionarySchema[]
): DictionarySchema {
  if (dictionaries.length === 0) {
    throw new Error("At least one dictionary is required");
  }

  const [first, ...rest] = dictionaries;
  const mergedEntries = { ...first.entries };

  for (const dict of rest) {
    Object.assign(mergedEntries, dict.entries);
  }

  return {
    version: first.version,
    locale: first.locale,
    entries: mergedEntries,
  };
}
