/**
 * Translation cache abstraction
 *
 * Cache stores hash -> translated text mappings for each locale.
 * It doesn't need to know about metadata structure or context -
 * it's purely an optimization layer.
 */

/**
 * Translation cache interface
 * Implementations can be local disk, remote server, memory, etc.
 */
export interface TranslationCache {
  /**
   * Get cached translations for a locale
   * Returns empty object if no cache exists
   */
  get(locale: string): Promise<Record<string, string>>;

  /**
   * Update cache with new translations
   * Merges with existing cache (doesn't replace)
   */
  update(locale: string, translations: Record<string, string>): Promise<void>;

  /**
   * Replace entire cache for a locale
   */
  set(locale: string, translations: Record<string, string>): Promise<void>;

  /**
   * Check if cache exists for a locale
   */
  has(locale: string): Promise<boolean>;

  /**
   * Clear cache for a specific locale
   */
  clear(locale: string): Promise<void>;

  /**
   * Clear all cached translations
   */
  clearAll(): Promise<void>;

  /**
   * Get full dictionary schema for a locale (includes version, metadata)
   * Used for build-time operations that need the complete schema
   * Returns null if cache doesn't exist
   */
  getDictionary?(
    locale: string,
  ): Promise<import("./api").DictionarySchema | null>;

  /**
   * Write full dictionary schema for a locale
   * Used for build-time operations that need to preserve schema metadata
   */
  setDictionary?(
    locale: string,
    dictionary: import("./api").DictionarySchema,
  ): Promise<void>;
}

/**
 * Configuration for local disk cache
 */
export interface LocalCacheConfig {
  cacheDir: string;
}
