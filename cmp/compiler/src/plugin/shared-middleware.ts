/**
 * Shared middleware logic for both Vite and Next.js
 *
 * This handler is used by:
 * - Vite plugin middleware (configureServer)
 * - Next.js API route handler
 *
 * It provides a unified implementation for on-demand translation generation
 */

import fs from "fs/promises";
import type { MetadataSchema, TranslationConfig } from "../types";
import {
  createTranslator,
  type DictionarySchema,
  LocalTranslationCache,
  TranslationService,
} from "../translators";
import { getMetadataPath } from "../utils/path-helpers";
import { logger } from "../utils/logger";

export interface TranslationMiddlewareConfig extends TranslationConfig {
  useCache?: boolean;
}

export interface TranslationResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Create translation service instance
 */
function createTranslationService(
  config: TranslationMiddlewareConfig,
): TranslationService {
  // Create translator (no caching wrapper needed anymore)
  const translator = config.translator
    ? createTranslator(config.translator)
    : createTranslator({ type: "pseudo" }); // Fallback to pseudo

  // Create cache
  const cache = new LocalTranslationCache({
    cacheDir: config.lingoDir,
    sourceRoot: config.sourceRoot,
  });

  // Create service
  return new TranslationService(translator, cache, {
    sourceLocale: config.sourceLocale,
    useCache: config.useCache,
  });
}

/**
 * Load metadata from disk
 */
async function loadMetadata(
  config: TranslationMiddlewareConfig,
): Promise<MetadataSchema> {
  const metadataPath = getMetadataPath(config);
  const metadataContent = await fs.readFile(metadataPath, "utf-8");
  return JSON.parse(metadataContent);
}

/**
 * Handle translation request
 * Returns a normalized response that can be adapted to any framework
 */
export async function handleTranslationRequest(
  locale: string,
  config: TranslationMiddlewareConfig,
): Promise<TranslationResponse> {
  logger.info(`Translation requested for locale: ${locale}`);

  try {
    // Load metadata
    const metadata = await loadMetadata(config);

    // Create service
    const service = createTranslationService(config);

    // Translate (service handles caching internally)
    const result = await service.translate(locale, metadata);

    // Check for errors
    if (result.errors.length > 0) {
      logger.warn(
        `Translation completed with ${result.errors.length} errors for ${locale}`,
      );
    }

    // Format as DictionarySchema for response
    const dictionary: DictionarySchema = {
      version: 0.1,
      locale,
      entries: result.translations,
    };

    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
      body: JSON.stringify(dictionary, null, 2),
    };
  } catch (error) {
    logger.error(`Error generating translations:`, error);

    return {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Failed to generate translations",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
}

/**
 * Handle translation request for specific hashes only
 * More efficient than translating the entire dictionary
 */
export async function handleHashTranslationRequest(
  locale: string,
  hashes: string[],
  config: TranslationMiddlewareConfig,
): Promise<TranslationResponse> {
  logger.info(
    `Translation requested for ${hashes.length} hashes in locale: ${locale}`,
  );

  try {
    // Load metadata
    const metadata = await loadMetadata(config);

    // Create service
    const service = createTranslationService(config);

    // Translate only requested hashes (service handles caching internally)
    const result = await service.translate(locale, metadata, hashes);

    // Check for errors
    if (result.errors.length > 0) {
      logger.warn(
        `Translation completed with ${result.errors.length} errors for ${locale}`,
      );
    }

    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
      body: JSON.stringify(result.translations),
    };
  } catch (error) {
    logger.error(`Error generating translations for hashes:`, error);

    return {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Failed to generate translations",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
}
