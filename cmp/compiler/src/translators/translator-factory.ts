/**
 * Factory for creating translators based on configuration
 */

import type { Translator } from "./api";
import { PseudoTranslator } from "./pseudotranslator";
import { LCPTranslator } from "./lcp";
import {
  getGoogleKey,
  getGroqKey,
  getLingoDotDevKey,
  getMistralKey,
  getOpenRouterKey,
} from "./lcp/api-keys";
import { formatNoApiKeysError } from "./lcp/provider-details";
import { logger } from "../utils/logger";

/**
 * Check if API keys are available for the configured models
 * Returns validation result with:
 * - hasKeys: true if ALL required providers have API keys
 * - providers: list of all configured providers
 * - missingProviders: list of providers missing API keys
 */
function validateApiKeys(models: "lingo.dev" | Record<string, string>): {
  hasKeys: boolean;
  providers: string[];
  missingProviders: string[];
} {
  if (models === "lingo.dev") {
    const hasKey = !!getLingoDotDevKey();
    return {
      hasKeys: hasKey,
      providers: ["lingo.dev"],
      missingProviders: hasKey ? [] : ["lingo.dev"],
    };
  }

  // Extract unique providers from model strings
  // Models are like: { "es": "groq:llama3-70b", "fr": "google:gemini-pro" }
  const uniqueProviders = new Set<string>();

  for (const modelString of Object.values(models)) {
    const colonIndex = modelString.indexOf(":");
    if (colonIndex !== -1) {
      const provider = modelString.substring(0, colonIndex);
      uniqueProviders.add(provider);
    }
  }

  const providers = Array.from(uniqueProviders);
  const missingProviders: string[] = [];

  // Check if ALL providers have their API keys
  for (const provider of providers) {
    let hasKey = false;

    switch (provider) {
      case "groq":
        hasKey = !!getGroqKey();
        break;
      case "google":
        hasKey = !!getGoogleKey();
        break;
      case "openrouter":
        hasKey = !!getOpenRouterKey();
        break;
      case "ollama":
        hasKey = true; // Ollama doesn't need API key
        break;
      case "mistral":
        hasKey = !!getMistralKey();
        break;
      default:
        // Unknown provider - consider it missing
        hasKey = false;
    }

    if (!hasKey) {
      missingProviders.push(provider);
    }
  }

  return {
    hasKeys: missingProviders.length === 0,
    providers,
    missingProviders,
  };
}

/**
 * Configuration required for creating a translator
 * (subset of LoaderConfig)
 */
export interface TranslatorFactoryConfig {
  sourceLocale: string;
  models?: "lingo.dev" | Record<string, string>;
  prompt?: string;
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
 */
export function createTranslator(
  config: TranslatorFactoryConfig,
): Translator<any> {
  const isDev = process.env.NODE_ENV === "development";
  // 1. Try to create LCP translator

  // 1. Explicit dev override takes precedence
  if (isDev && config.dev?.usePseudotranslator) {
    logger.info("📝 Using pseudotranslator (dev.usePseudotranslator enabled)");
    return new PseudoTranslator({ delayMedian: 100 });
  }

  try {
    const models = config.models || "lingo.dev";
    const validation = validateApiKeys(models);

    if (!validation.hasKeys) {
      // Format helpful error message with specific missing providers
      const errorMessage = formatNoApiKeysError(
        validation.missingProviders,
        validation.providers,
      );
      throw new Error(errorMessage);
    }

    logger.info(
      `✅ Creating LCP translator with models: ${JSON.stringify(models)}`,
    );
    return new LCPTranslator({
      models,
      sourceLocale: config.sourceLocale,
      prompt: config.prompt || null,
    });
  } catch (error) {
    if (isDev) {
      // Use console.error to ensure visibility in all contexts (loader, server, etc.)
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ [Lingo] Translation setup error: ${errorMsg}\n`);
      console.warn(
        `⚠️  [Lingo] Auto-fallback to pseudotranslator in development mode.\n` +
          `   Set the required API keys for real translations.\n`,
      );

      return new PseudoTranslator({ delayMedian: 100 });
    }

    // Fail in production
    throw error;
  }
}
