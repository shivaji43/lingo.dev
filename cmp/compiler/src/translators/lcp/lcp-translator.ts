import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider";
import { createMistral } from "@ai-sdk/mistral";
import { generateText, type LanguageModel } from "ai";
import { LingoDotDevEngine } from "lingo.dev/sdk";
import type { DictionarySchema, TranslatableEntry, Translator } from "../api";
import { getSystemPrompt } from "./prompt";
import { obj2xml, xml2obj } from "./xml2obj";
import { shots } from "./shots";
import { getLocaleModel } from "./locales";
import {
  getGoogleKey,
  getGroqKey,
  getLingoDotDevKey,
  getMistralKey,
  getOpenRouterKey,
} from "./api-keys";
import { logger } from "../../utils/file-logger";
import { withTimeout, DEFAULT_TIMEOUTS } from "../../utils/timeout";

/**
 * LCP Translator configuration
 */
export interface LCPTranslatorConfig {
  models: "lingo.dev" | Record<string, string>;
  sourceLocale: string;
  prompt?: string | null;
}

/**
 * LCP-based translator using AI models
 */
export class LCPTranslator implements Translator<LCPTranslatorConfig> {
  constructor(readonly config: LCPTranslatorConfig) {}

  /**
   * Translate multiple entries
   */
  async translate(
    locale: string,
    entriesMap: Record<string, TranslatableEntry>,
  ): Promise<Record<string, string>> {
    logger.debug(`[TRACE-LCP] translate() ENTERED for ${locale}`);
    logger.debug(
      `[TRACE-LCP] translate() called for ${locale} with ${Object.keys(entriesMap).length} entries`,
    );

    // Create dictionary from entries map
    const sourceDictionary: DictionarySchema = {
      version: 0.1,
      locale: this.config.sourceLocale,
      entries: Object.fromEntries(
        Object.entries(entriesMap).map(([hash, entry]) => [hash, entry.text]),
      ),
    };

    logger.debug(
      `[TRACE-LCP] Created source dictionary with ${Object.keys(sourceDictionary.entries).length} entries`,
    );
    logger.debug(`[TRACE-LCP] Calling translateDictionary()`);

    const translated = await this.translateDictionary(sourceDictionary, locale);

    logger.debug(
      `[TRACE-LCP] translateDictionary() completed, returned ${Object.keys(translated.entries || {}).length} entries`,
    );

    return translated.entries || {};
  }

  /**
   * Translate a complete dictionary
   */
  private async translateDictionary(
    sourceDictionary: DictionarySchema,
    targetLocale: string,
  ): Promise<DictionarySchema> {
    const timeLabel = `LCPTranslator: ${this.config.sourceLocale} -> ${targetLocale}`;
    console.time(timeLabel);

    // Split into chunks if needed
    logger.debug(
      `[TRACE-LCP] Chunking dictionary with ${Object.keys(sourceDictionary.entries).length} entries`,
    );
    const chunks = this.chunkDictionary(sourceDictionary);
    logger.debug(`[TRACE-LCP] Split into ${chunks.length} chunks`);

    const translatedChunks: DictionarySchema[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      logger.debug(
        `[TRACE-LCP] Translating chunk ${i + 1}/${chunks.length} with ${Object.keys(chunk.entries).length} entries`,
      );
      const chunkStartTime = performance.now();

      const translatedChunk = await this.translateChunk(chunk, targetLocale);

      const chunkEndTime = performance.now();
      logger.debug(
        `[TRACE-LCP] Chunk ${i + 1}/${chunks.length} completed in ${(chunkEndTime - chunkStartTime).toFixed(2)}ms`,
      );

      translatedChunks.push(translatedChunk);
    }

    logger.debug(`[TRACE-LCP] All chunks translated, merging results`);
    const result = this.mergeDictionaries(translatedChunks);
    logger.debug(
      `[TRACE-LCP] Merge completed, final dictionary has ${Object.keys(result.entries).length} entries`,
    );

    console.timeEnd(timeLabel);
    return result;
  }

  /**
   * Translate a single chunk
   */
  private async translateChunk(
    sourceDictionary: DictionarySchema,
    targetLocale: string,
  ): Promise<DictionarySchema> {
    if (this.config.models === "lingo.dev") {
      return this.translateWithLingoDotDev(sourceDictionary, targetLocale);
    } else {
      return this.translateWithLLM(sourceDictionary, targetLocale);
    }
  }

  /**
   * Translate using Lingo.dev Engine
   * Times out after 60 seconds to prevent indefinite hangs
   */
  private async translateWithLingoDotDev(
    sourceDictionary: DictionarySchema,
    targetLocale: string,
  ): Promise<DictionarySchema> {
    logger.debug(`[TRACE-LCP] translateWithLingoDotDev() called`);

    const apiKey = getLingoDotDevKey();
    if (!apiKey) {
      throw new Error(
        "⚠️  Lingo.dev API key not found. Please set LINGODOTDEV_API_KEY environment variable.",
      );
    }

    logger.info(
      `Using Lingo.dev Engine to localize from "${this.config.sourceLocale}" to "${targetLocale}"`,
    );

    logger.debug(`[TRACE-LCP] Creating LingoDotDevEngine client`);
    const engine = new LingoDotDevEngine({ apiKey });

    try {
      logger.debug(
        `[TRACE-LCP] Calling engine.localizeObject() with timeout ${DEFAULT_TIMEOUTS.AI_API}ms`,
      );
      const apiStartTime = performance.now();

      const result = await withTimeout(
        engine.localizeObject(sourceDictionary, {
          sourceLocale: this.config.sourceLocale,
          targetLocale: targetLocale,
        }),
        DEFAULT_TIMEOUTS.AI_API,
        `Lingo.dev API translation to ${targetLocale}`,
      );

      const apiEndTime = performance.now();
      logger.debug(
        `[TRACE-LCP] engine.localizeObject() completed in ${(apiEndTime - apiStartTime).toFixed(2)}ms`,
      );

      return result as DictionarySchema;
    } catch (error) {
      logger.error(`[TRACE-LCP] translateWithLingoDotDev() failed:`, error);
      throw new Error(
        `Lingo.dev translation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Translate using generic LLM
   * Times out after 60 seconds to prevent indefinite hangs
   */
  private async translateWithLLM(
    sourceDictionary: DictionarySchema,
    targetLocale: string,
  ): Promise<DictionarySchema> {
    const { provider, model } = getLocaleModel(
      this.config.models as Record<string, string>,
      this.config.sourceLocale,
      targetLocale,
    );

    if (!provider || !model) {
      throw new Error(
        `No model configured for translation from ${this.config.sourceLocale} to ${targetLocale}`,
      );
    }

    logger.info(
      `Using LLM ("${provider}":"${model}") to translate from "${this.config.sourceLocale}" to "${targetLocale}"`,
    );

    const aiModel = this.createAiModel(provider, model);

    try {
      const response = await withTimeout(
        generateText({
          model: aiModel,
          messages: [
            {
              role: "system",
              content: getSystemPrompt({
                sourceLocale: this.config.sourceLocale,
                targetLocale,
                prompt: this.config.prompt ?? undefined,
              }),
            },
            // Add few-shot examples
            ...shots.flatMap((shotsTuple) => [
              {
                role: "user" as const,
                content: obj2xml(shotsTuple[0]),
              },
              {
                role: "assistant" as const,
                content: obj2xml(shotsTuple[1]),
              },
            ]),
            {
              role: "user",
              content: obj2xml(sourceDictionary),
            },
          ],
        }),
        DEFAULT_TIMEOUTS.AI_API,
        `${provider} LLM translation to ${targetLocale}`,
      );

      // Extract XML content from response
      let responseText = response.text;
      const xmlStart = responseText.indexOf("<");
      const xmlEnd = responseText.lastIndexOf(">") + 1;

      if (xmlStart !== -1 && xmlEnd > xmlStart) {
        responseText = responseText.substring(xmlStart, xmlEnd);
      }

      return xml2obj<DictionarySchema>(responseText);
    } catch (error) {
      throw new Error(
        `LLM translation failed with ${provider}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Create AI model instance
   */
  private createAiModel(providerId: string, modelId: string): LanguageModel {
    switch (providerId) {
      case "groq": {
        const apiKey = getGroqKey();
        if (!apiKey) {
          throw new Error(
            "⚠️  GROQ API key not found. Please set GROQ_API_KEY environment variable.",
          );
        }
        logger.debug(`Creating Groq client using model ${modelId}`);
        return createGroq({ apiKey })(modelId);
      }

      case "google": {
        const apiKey = getGoogleKey();
        if (!apiKey) {
          throw new Error(
            "⚠️  Google API key not found. Please set GOOGLE_API_KEY environment variable.",
          );
        }
        logger.debug(
          `Creating Google Generative AI client using model ${modelId}`,
        );
        return createGoogleGenerativeAI({ apiKey })(modelId);
      }

      case "openrouter": {
        const apiKey = getOpenRouterKey();
        if (!apiKey) {
          throw new Error(
            "⚠️  OpenRouter API key not found. Please set OPENROUTER_API_KEY environment variable.",
          );
        }
        logger.debug(`Creating OpenRouter client using model ${modelId}`);
        return createOpenRouter({ apiKey })(modelId);
      }

      case "ollama": {
        logger.debug(
          `Creating Ollama client using model ${modelId} at default address`,
        );
        return createOllama()(modelId);
      }

      case "mistral": {
        const apiKey = getMistralKey();
        if (!apiKey) {
          throw new Error(
            "⚠️  Mistral API key not found. Please set MISTRAL_API_KEY environment variable.",
          );
        }
        logger.debug(`Creating Mistral client using model ${modelId}`);
        return createMistral({ apiKey })(modelId);
      }

      default: {
        throw new Error(
          `⚠️  Provider "${providerId}" is not supported. Supported providers: groq, google, openrouter, ollama, mistral, lingo.dev`,
        );
      }
    }
  }

  /**
   * Split dictionary into chunks for processing
   */
  private chunkDictionary(dictionary: DictionarySchema): DictionarySchema[] {
    const MAX_ENTRIES_PER_CHUNK = 100;
    const { entries, ...rest } = dictionary;
    const chunks: DictionarySchema[] = [];

    const entryPairs = Object.entries(entries);

    // Split entries into chunks of MAX_ENTRIES_PER_CHUNK
    for (let i = 0; i < entryPairs.length; i += MAX_ENTRIES_PER_CHUNK) {
      const chunkEntries = entryPairs.slice(i, i + MAX_ENTRIES_PER_CHUNK);
      chunks.push({
        ...rest,
        entries: Object.fromEntries(chunkEntries),
      });
    }

    return chunks;
  }

  /**
   * Merge multiple dictionaries into one
   */
  private mergeDictionaries(
    dictionaries: DictionarySchema[],
  ): DictionarySchema {
    if (dictionaries.length === 0) {
      return {
        version: 0.1,
        locale: this.config.sourceLocale,
        entries: {},
      };
    }

    // Merge all entries from all dictionaries
    const mergedEntries: Record<string, string> = {};
    for (const dict of dictionaries) {
      Object.assign(mergedEntries, dict.entries);
    }

    return {
      version: dictionaries[0].version,
      locale: dictionaries[0].locale,
      entries: mergedEntries,
    };
  }
}
