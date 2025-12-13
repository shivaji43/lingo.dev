/**
 * Factory for creating translators based on configuration
 */

import type { Translator } from "./api";
import { PseudoTranslator } from "./pseudotranslator";
import { Service } from "./lcp";
import { Logger } from "../utils/logger";

/**
 * Configuration required for creating a translator
 * (subset of LoaderConfig)
 */
export interface TranslatorFactoryConfig {
  sourceLocale: string;
  models?: "lingo.dev" | Record<string, string>;
  prompt?: string;
  environment: "development" | "production";
  dev?: {
    usePseudotranslator?: boolean;
  };
}

/**
 * Create a translator instance based on configuration
 *
 * Development mode behavior:
 * - If translator is "pseudo" or dev.usePseudotranslator is true, use pseudotranslator
 * - If API keys are missing, auto-fallback to pseudotranslator (with warning)
 * - Otherwise, create real translator
 *
 * Production mode behavior:
 * - Always require real translator with valid API keys
 * - Throw error if API keys are missing
 *
 * Note: Translators are stateless and don't handle caching.
 * Caching is handled by TranslationService layer.
 *
 * API key validation is now done in the LCPTranslator constructor
 * which validates and fetches all keys once at initialization.
 */
export function createTranslator(
  config: TranslatorFactoryConfig,
  logger: Logger,
): Translator<any> {
  const isDev = config.environment === "development";

  // 1. Explicit dev override takes precedence
  if (isDev && config.dev?.usePseudotranslator) {
    logger.info("📝 Using pseudotranslator (dev.usePseudotranslator enabled)");
    return new PseudoTranslator({ delayMedian: 100 }, logger);
  }

  // 2. Try to create real translator
  // LCPTranslator constructor will validate and fetch API keys
  // If validation fails, it will throw an error with helpful message
  try {
    const models = config.models || "lingo.dev";

    logger.info(
      `Creating LCP translator with models: ${JSON.stringify(models)}`,
    );

    return new Service(
      {
        models,
        sourceLocale: config.sourceLocale,
        prompt: config.prompt || null,
      },
      logger,
    );
  } catch (error) {
    // 3. Auto-fallback in dev mode if creation fails
    if (isDev) {
      // Use console.error to ensure visibility in all contexts (loader, server, etc.)
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ [Lingo] Translation setup error: ${errorMsg}\n`);
      console.warn(
        `⚠️  [Lingo] Auto-fallback to pseudotranslator in development mode.\n` +
          `   Set the required API keys for real translations.\n`,
      );

      return new PseudoTranslator({ delayMedian: 100 }, logger);
    }

    // 4. Fail in production
    throw error;
  }
}
