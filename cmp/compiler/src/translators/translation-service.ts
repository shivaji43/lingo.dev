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
import type { TranslatableEntry, Translator } from "./api";
import type { MetadataSchema } from "../types";
import { logger } from "../utils/file-logger";

/**
 * Configuration for translation service
 */
export interface TranslationServiceConfig {
  /**
   * Source locale (e.g., "en")
   */
  sourceLocale: string;

  /**
   * Whether the translator is a pseudo translator
   * If true, translations will NOT be cached
   */
  isPseudo?: boolean;
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
  private useCache = true;

  constructor(
    private translator: Translator<any>,
    private cache: TranslationCache,
    private config: TranslationServiceConfig,
  ) {
    this.useCache = !this.config.isPseudo;
  }

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

    // TODO (AleksandrSl 03/12/2025): This would be the point to remove if we want to process the source files for pluralization
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
    logger.debug(`[TRACE] Checking cache for locale: ${locale}`);
    const cacheStartTime = performance.now();
    const cachedTranslations = this.useCache
      ? await this.cache.get(locale)
      : {};
    const cacheEndTime = performance.now();
    logger.debug(
      `[TRACE] Cache check completed in ${(cacheEndTime - cacheStartTime).toFixed(2)}ms, found ${Object.keys(cachedTranslations).length} entries`,
    );

    // Step 2: Determine what needs translation
    const missingHashes = workingHashes.filter(
      (hash) => !cachedTranslations[hash],
    );
    logger.debug(
      `[TRACE] ${missingHashes.length} hashes need translation, ${workingHashes.length - missingHashes.length} are cached`,
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
    logger.debug(
      `[TRACE] Preparing ${missingHashes.length} entries for translation`,
    );
    const entriesToTranslate = this.prepareEntries(metadata, missingHashes);
    logger.debug(
      `[TRACE] Prepared ${Object.keys(entriesToTranslate).length} entries`,
    );

    // Step 4: Translate
    let newTranslations: Record<string, string> = {};
    const errors: TranslationError[] = [];

    try {
      logger.debug(
        `[TRACE] Calling translator.translate() for ${locale} with ${Object.keys(entriesToTranslate).length} entries`,
      );
      logger.debug(`[TRACE] About to await translator.translate()...`);
      const translateStartTime = performance.now();
      logger.debug(`[TRACE] Executing translator.translate() NOW`);
      newTranslations = await this.translator.translate(
        locale,
        entriesToTranslate,
      );
      logger.debug(`[TRACE] translator.translate() returned`);

      const translateEndTime = performance.now();
      logger.debug(
        `[TRACE] translator.translate() completed in ${(translateEndTime - translateStartTime).toFixed(2)}ms`,
      );
      logger.debug(
        `[TRACE] Received ${Object.keys(newTranslations).length} translations`,
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

    // Step 5: Update cache with successful translations (skip for pseudo)
    if (this.useCache && Object.keys(newTranslations).length > 0) {
      try {
        logger.debug(
          `[TRACE] Updating cache with ${Object.keys(newTranslations).length} translations for ${locale}`,
        );
        const updateStartTime = performance.now();
        await this.cache.update(locale, newTranslations);
        const updateEndTime = performance.now();
        logger.debug(
          `[TRACE] Cache update completed in ${(updateEndTime - updateStartTime).toFixed(2)}ms`,
        );
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
