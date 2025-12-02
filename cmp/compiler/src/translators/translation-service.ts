/**
 * TranslationService - Main orchestrator for translation workflow
 *
 * Responsibilities:
 * - Coordinates between metadata, cache, and translator
 * - Determines what needs translation
 * - Handles caching strategy
 * - Manages partial failures
 */

import type { TranslationCache } from "./cache";
import type { Translator, TranslatableEntry } from "./api";
import type { MetadataSchema } from "../types";
import { logger } from "../utils/logger";

/**
 * Configuration for translation service
 */
export interface TranslationServiceConfig {
  /**
   * Source locale (e.g., "en")
   */
  sourceLocale: string;

  /**
   * Whether to use cache (can be disabled for testing)
   */
  useCache?: boolean;
}

/**
 * Result of a translation request
 */
export interface TranslationResult {
  /**
   * Successfully translated entries (hash -> translated text)
   */
  translations: Record<string, string>;

  /**
   * Errors that occurred during translation
   */
  errors: TranslationError[];

  /**
   * Statistics about the operation
   */
  stats: {
    total: number;
    cached: number;
    translated: number;
    failed: number;
  };
}

/**
 * Translation error details
 */
export interface TranslationError {
  hash: string;
  sourceText: string;
  error: string;
}

/**
 * Translation service orchestrator
 */
export class TranslationService {
  constructor(
    private translator: Translator<any>,
    private cache: TranslationCache,
    private config: TranslationServiceConfig,
  ) {}

  /**
   * Translate entries to target locale
   *
   * @param locale Target locale
   * @param metadata Metadata schema with all entries
   * @param requestedHashes Optional: only translate specific hashes
   * @returns Translation result with translations and errors
   */
  async translate(
    locale: string,
    metadata: MetadataSchema,
    requestedHashes?: string[],
  ): Promise<TranslationResult> {
    const startTime = performance.now();

    // Skip translation if target is source locale
    if (locale === this.config.sourceLocale) {
      return this.createSourceLocaleResult(metadata, requestedHashes);
    }

    // Determine which hashes we need to work with
    const workingHashes = requestedHashes || Object.keys(metadata.entries);

    logger.info(
      `Translation requested for ${workingHashes.length} hashes in locale: ${locale}`,
    );

    // Step 1: Check cache
    const cachedTranslations =
      this.config.useCache !== false ? await this.cache.get(locale) : {};

    // Step 2: Determine what needs translation
    const missingHashes = workingHashes.filter(
      (hash) => !cachedTranslations[hash],
    );

    const cachedCount = workingHashes.length - missingHashes.length;

    if (missingHashes.length === 0) {
      // All cached!
      const endTime = performance.now();
      logger.info(
        `Cache hit for all ${workingHashes.length} hashes in ${locale} in ${(endTime - startTime).toFixed(2)}ms`,
      );

      return {
        translations: this.pickTranslations(cachedTranslations, workingHashes),
        errors: [],
        stats: {
          total: workingHashes.length,
          cached: cachedCount,
          translated: 0,
          failed: 0,
        },
      };
    }

    logger.info(
      `Generating translations for ${missingHashes.length} missing hashes in ${locale}...`,
    );

    // Step 3: Prepare entries for translation
    const entriesToTranslate = this.prepareEntries(metadata, missingHashes);

    // Step 4: Translate
    let newTranslations: Record<string, string> = {};
    const errors: TranslationError[] = [];

    try {
      newTranslations = await this.translator.translate(
        locale,
        entriesToTranslate,
      );
    } catch (error) {
      // Complete failure - log and return what we have from cache
      logger.error(`Translation failed completely:`, error);

      return {
        translations: this.pickTranslations(cachedTranslations, workingHashes),
        errors: [
          {
            hash: "all",
            sourceText: "all",
            error:
              error instanceof Error
                ? error.message
                : "Unknown translation error",
          },
        ],
        stats: {
          total: workingHashes.length,
          cached: cachedCount,
          translated: 0,
          failed: missingHashes.length,
        },
      };
    }

    // Check for partial failures (some hashes didn't get translated)
    for (const hash of missingHashes) {
      if (!newTranslations[hash]) {
        const entry = metadata.entries[hash];
        errors.push({
          hash,
          sourceText: entry?.sourceText || "",
          error: "Translation not returned by translator",
        });
      }
    }

    // Step 5: Update cache with successful translations
    if (
      this.config.useCache !== false &&
      Object.keys(newTranslations).length > 0
    ) {
      try {
        await this.cache.update(locale, newTranslations);
        logger.info(
          `Updated cache with ${Object.keys(newTranslations).length} translations for ${locale}`,
        );
      } catch (error) {
        logger.error(`Failed to update cache:`, error);
        // Don't fail the request if cache update fails
      }
    }

    // Step 6: Merge and return
    const allTranslations = { ...cachedTranslations, ...newTranslations };
    const result = this.pickTranslations(allTranslations, workingHashes);

    const endTime = performance.now();
    logger.info(
      `Translation completed for ${locale}: ${Object.keys(newTranslations).length} new, ${cachedCount} cached, ${errors.length} errors in ${(endTime - startTime).toFixed(2)}ms`,
    );

    return {
      translations: result,
      errors,
      stats: {
        total: workingHashes.length,
        cached: cachedCount,
        translated: Object.keys(newTranslations).length,
        failed: errors.length,
      },
    };
  }

  /**
   * Create result for source locale (no translation needed)
   */
  private createSourceLocaleResult(
    metadata: MetadataSchema,
    requestedHashes?: string[],
  ): TranslationResult {
    const hashes = requestedHashes || Object.keys(metadata.entries);
    const translations: Record<string, string> = {};

    for (const hash of hashes) {
      const entry = metadata.entries[hash];
      if (entry) {
        translations[hash] = entry.sourceText;
      }
    }

    return {
      translations,
      errors: [],
      stats: {
        total: hashes.length,
        cached: 0,
        translated: 0,
        failed: 0,
      },
    };
  }

  /**
   * Prepare metadata entries for translation
   */
  private prepareEntries(
    metadata: MetadataSchema,
    hashes: string[],
  ): Record<string, TranslatableEntry> {
    const entries: Record<string, TranslatableEntry> = {};

    for (const hash of hashes) {
      const entry = metadata.entries[hash];
      if (entry) {
        entries[hash] = {
          text: entry.sourceText,
          context: entry.context || {},
        };
      }
    }

    return entries;
  }

  /**
   * Pick only requested translations from the full set
   */
  private pickTranslations(
    allTranslations: Record<string, string>,
    requestedHashes: string[],
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const hash of requestedHashes) {
      if (allTranslations[hash]) {
        result[hash] = allTranslations[hash];
      }
    }

    return result;
  }
}
