/**
 * Shared utilities for creating AI model instances
 */

import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider";
import { createMistral } from "@ai-sdk/mistral";
import type { LanguageModel } from "ai";
import {
  getGoogleKey,
  getGroqKey,
  getMistralKey,
  getOpenRouterKey,
} from "./api-keys";

type LocaleModel = {
  provider: string;
  name: string;
};

/**
 * Get provider and model for a specific locale pair
 */
export function getLocaleModel(
  localeModels: Record<string, string>,
  sourceLocale: string,
  targetLocale: string,
): LocaleModel | undefined {
  const localeKeys = [
    `${sourceLocale}:${targetLocale}`,
    `*:${targetLocale}`,
    `${sourceLocale}:*`,
    "*:*",
  ];

  const modelKey = localeKeys.find((key) => key in localeModels);
  if (!modelKey) {
    return undefined;
  }

  const value = localeModels[modelKey];
  if (!value) {
    return undefined;
  }

  return parseModelString(value);
}

/**
 * Parse provider and model from model string
 * Format: "provider:model" (e.g., "groq:llama3-8b-8192")
 *
 * @param modelString Model string to parse
 * @returns Object with provider and model
 * @throws Error if format is invalid
 */
export function parseModelString(modelString: string): LocaleModel | undefined {
  // Split on first colon only
  const [provider, name] = modelString.split(":", 2);

  if (!provider || !name) {
    return undefined;
  }

  return { provider, name };
}

/**
 * Create AI model instance from provider and model ID
 *
 * @param model Provider name (groq, google, openrouter, ollama, mistral) and model identifier as an object
 * @returns LanguageModel instance
 * @throws Error if provider is not supported or API key is missing
 */
export function createAiModel(model: LocaleModel): LanguageModel {
  switch (model.provider) {
    case "groq": {
      const apiKey = getGroqKey();
      if (!apiKey) {
        throw new Error(
          "⚠️  GROQ API key not found. Please set GROQ_API_KEY environment variable.",
        );
      }
      return createGroq({ apiKey })(model.name);
    }

    case "google": {
      const apiKey = getGoogleKey();
      if (!apiKey) {
        throw new Error(
          "⚠️  Google API key not found. Please set GOOGLE_GENERATIVE_AI_API_KEY environment variable.",
        );
      }
      return createGoogleGenerativeAI({ apiKey })(model.name);
    }

    case "openrouter": {
      const apiKey = getOpenRouterKey();
      if (!apiKey) {
        throw new Error(
          "⚠️  OpenRouter API key not found. Please set OPENROUTER_API_KEY environment variable.",
        );
      }
      return createOpenRouter({ apiKey })(model.name);
    }

    case "ollama": {
      return createOllama()(model.name);
    }

    case "mistral": {
      const apiKey = getMistralKey();
      if (!apiKey) {
        throw new Error(
          "⚠️  Mistral API key not found. Please set MISTRAL_API_KEY environment variable.",
        );
      }
      return createMistral({ apiKey })(model.name);
    }

    default:
      throw new Error(
        `⚠️  Provider "${model.provider}" is not supported. Supported providers: groq, google, openrouter, ollama, mistral`,
      );
  }
}
