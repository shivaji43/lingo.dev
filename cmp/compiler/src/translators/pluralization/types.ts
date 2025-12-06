/**
 * Types for pluralization system
 */

import type { LingoConfig } from "../../types";

/**
 * Plural candidate detected by pattern matching
 */
export interface PluralCandidate {
  /**
   * Hash of the entry
   */
  hash: string;

  /**
   * Original source text
   */
  sourceText: string;
}

/**
 * Result of ICU format generation
 */
export interface ICUGenerationResult {
  /**
   * Whether ICU format was generated successfully
   */
  success: boolean;

  /**
   * Generated ICU format text (if successful)
   */
  icuText?: string;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * LLM explanation of why pluralization was or wasn't applied
   */
  reasoning?: string;
}

type RequiredPluralizationConfigFields = "sourceLocale";

export type DefaultPluralizationConfig = Required<
  Omit<PluralizationConfig, RequiredPluralizationConfigFields>
>;

export type PartialPluralizationConfig = Partial<
  Omit<PluralizationConfig, RequiredPluralizationConfigFields>
> &
  Pick<PluralizationConfig, RequiredPluralizationConfigFields>;

/**
 * Configuration for pluralization system
 */
export type PluralizationConfig = {
  /**
   * Whether pluralization is enabled
   * @default true
   */
  enabled: boolean;

  /**
   * LLM provider for pluralization detection
   * Format: "provider:model" (e.g., "groq:llama3-8b-8192")
   * @default "groq:llama3-8b-8192"
   */
  model: string;
} & Pick<LingoConfig, "sourceLocale">;

/**
 * Statistics about pluralization processing
 */
export interface PluralizationStats {
  /**
   * Total entries processed
   */
  total: number;

  /**
   * Candidates detected by pattern matching
   */
  candidates: number;

  /**
   * Successfully pluralized by LLM
   */
  pluralized: number;

  /**
   * Rejected by LLM (not suitable for pluralization)
   */
  rejected: number;

  /**
   * Failed (errors during processing)
   */
  failed: number;

  /**
   * Processing time in milliseconds
   */
  durationMs: number;
}

export interface PluralizationBatch {
  version: number;
  sourceLocale: string;
  candidates: {
    candidate: Array<{
      hash: string;
      text: string;
    }>;
  };
}

export interface PluralizationResponse {
  version: number;
  results: {
    result: Array<{
      hash: string;
      shouldPluralize: boolean;
      icuText?: string;
      reasoning: string;
    }>;
  };
}
