/**
 * Factory for creating translators based on configuration
 */

import type { Translator } from "./api";
import { PseudoTranslator, PseudoTranslatorConfig } from "./pseudotranslator";
import { LCPTranslator, type LCPTranslatorConfig } from "./lcp";
import { createCachedTranslator } from "./cached-translator";
import type { ServerCacheConfig } from "./cache-server";
import { logger } from "../utils/logger";

/**
 * Translator configuration types
 */
export type TranslatorConfig =
  | { type: "pseudo"; config?: PseudoTranslatorConfig }
  | { type: "lcp"; config: LCPTranslatorConfig };

/**
 * Create a translator instance based on configuration
 */
export function createTranslator(config: TranslatorConfig): Translator<any> {
  // TODO (AleksandrSl 26/11/2025): Why the config can be a string?
  if (typeof config === "string") {
    config = JSON.parse(config);
  }
  switch (config.type) {
    case "pseudo":
      return new PseudoTranslator(config.config);

    case "lcp":
      return new LCPTranslator(config.config);

    default:
      throw new Error(
        `Unknown translator type: ${(config as any).type}. Config: ${JSON.stringify(config)}`,
      );
  }
}

/**
 * Create a cached translator based on configuration
 */
export function createCachedTranslatorFromConfig(
  translatorConfig: TranslatorConfig,
  cacheConfig: ServerCacheConfig,
): Translator<any> {
  const translator = createTranslator(translatorConfig);
  logger.info(
    `Using ${translator.constructor.name} translator with cache: ${cacheConfig.useCache}`,
  );
  return cacheConfig.useCache
    ? createCachedTranslator(translator, cacheConfig)
    : translator;
}
