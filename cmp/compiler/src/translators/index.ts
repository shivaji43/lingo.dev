/**
 * Translation utilities
 *
 * @module @lingo.dev/_compiler-beta/translate
 */

// Core API
export type { Translator, TranslatableEntry } from "./api";

// Translators
export { PseudoTranslator } from "./pseudotranslator";
export { LCPTranslator } from "./lcp";
export type { LCPTranslatorConfig } from "./lcp";
export { createTranslator } from "./translator-factory";
export type { TranslatorConfig } from "./translator-factory";

// Translation Service (orchestrator)
export { TranslationService } from "./translation-service";
export type {
  TranslationServiceConfig,
  TranslationResult,
  TranslationError,
} from "./translation-service";

// Cache abstractions
export type { TranslationCache, LocalCacheConfig } from "./cache";
export { LocalTranslationCache } from "./local-cache";
