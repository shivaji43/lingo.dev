/**
 * Factory for creating translators based on configuration
 */

import type { Translator } from "./api";
import { PseudoTranslator, PseudoTranslatorConfig } from "./pseudotranslator";
import { LCPTranslator, type LCPTranslatorConfig } from "./lcp";

/**
 * Translator configuration types
 */
export type TranslatorConfig =
  | { type: "pseudo"; config?: PseudoTranslatorConfig }
  | { type: "lcp"; config: LCPTranslatorConfig };

/**
 * Create a translator instance based on configuration
 *
 * Note: Translators are stateless and don't handle caching.
 * Caching is handled by TranslationService layer.
 */
export function createTranslator(config: TranslatorConfig): Translator<any> {
  switch (config.type) {
    case "pseudo":
      return new PseudoTranslator(config.config || {});

    case "lcp":
      return new LCPTranslator(config.config);

    default:
      throw new Error(
        `Unknown translator type: ${(config as any).type}. Config: ${JSON.stringify(config)}`,
      );
  }
}
