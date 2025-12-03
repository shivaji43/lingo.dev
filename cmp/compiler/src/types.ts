/**
 * Core types for the compiler-beta translation system
 */

import type { Framework } from "./types/framework";
import { LocaleCode } from "lingo.dev/spec";

/**
 * Cookie configuration for locale persistence
 */
export interface CookieConfig {
  /**
   * Name of the cookie to store the locale
   * @default 'locale'
   */
  name: string;

  /**
   * Maximum age of the cookie in seconds
   * @default 31536000 (1 year)
   */
  maxAge: number;
}

/**
 * Configuration for the translation loader
 */
export interface LoaderConfig {
  /**
   * Root directory of the source code
   */
  sourceRoot: string;

  /**
   * Directory for lingo files (.lingo/)
   */
  lingoDir: string;

  /**
   * The locale to translate from.
   *
   * This must match one of the following formats:
   *
   * - [ISO 639-1 language code](https://en.wikipedia.org/wiki/ISO_639-1) (e.g., `"en"`)
   * - [IETF BCP 47 language tag](https://en.wikipedia.org/wiki/IETF_language_tag) (e.g., `"en-US"`)
   *
   * @default "en"
   */
  sourceLocale: LocaleCode;

  /**
   * The locale(s) to translate to.
   *
   * Each locale must match one of the following formats:
   *
   * - [ISO 639-1 language code](https://en.wikipedia.org/wiki/ISO_639-1) (e.g., `"en"`)
   * - [IETF BCP 47 language tag](https://en.wikipedia.org/wiki/IETF_language_tag) (e.g., `"en-US"`)
   *
   * @default ["es"]
   */
  targetLocales: LocaleCode[];

  /**
   * Whether to require 'use i18n' directive
   */
  useDirective?: boolean;

  /**
   * Skip transformation for specific patterns
   */
  skipPatterns?: RegExp[];

  /**
   * Model configuration for LCP translator
   * - Use "lingo.dev" for Lingo.dev Engine (recommended)
   * - Use locale-pair mapping for direct LLM providers
   *
   * Examples:
   * - "lingo.dev"
   * - { "en:es": "google:gemini-2.0-flash", "*:*": "groq:llama3-8b-8192" }
   *
   * @default "lingo.dev"
   */
  models?: "lingo.dev" | Record<string, string>;

  /**
   * Custom translation prompt for LCP translator
   * Use {SOURCE_LOCALE} and {TARGET_LOCALE} placeholders
   */
  prompt?: string;

  /**
   * Development-specific settings
   */
  dev?: {
    /**
     * Use pseudotranslator in development instead of real translator
     * Useful for:
     * - Testing i18n without API calls
     * - Verifying correct elements are translated
     * - Saving AI tokens during development
     *
     * @default false
     */
    usePseudotranslator?: boolean;
  };

  /**
   * Framework being used (affects component detection)
   */
  framework?: Framework;

  /**
   * Cookie configuration for locale persistence
   * Used by both client-side LocaleSwitcher and server-side locale resolver
   */
  cookieConfig?: CookieConfig;
}

/**
 * Minimal config needed for metadata operations
 * Used by metadata manager functions
 */
export type MetadataConfig = Pick<LoaderConfig, "sourceRoot" | "lingoDir">;

/**
 * Config needed for translation operations
 * Includes translator configuration
 */
export type TranslationConfig = Pick<
  LoaderConfig,
  "sourceRoot" | "lingoDir" | "sourceLocale" | "models" | "prompt"
>;

/**
 * Config needed for translation middleware and server
 * Extends TranslationConfig with optional fields
 */
export type TranslationMiddlewareConfig = Pick<
  LoaderConfig,
  "sourceRoot" | "lingoDir" | "sourceLocale" | "models" | "prompt"
> &
  Partial<Pick<LoaderConfig, "targetLocales" | "dev">>;

/**
 * Config needed for path operations
 * Alias for MetadataConfig (same fields)
 */
export type PathConfig = Pick<LoaderConfig, "sourceRoot" | "lingoDir">;

/**
 * A single translation entry
 */
export interface TranslationEntry {
  /**
   * Original source text
   */
  sourceText: string;

  /**
   * Context information
   */
  context: Record<string, any>;

  location: {
    filePath: string;
    line?: number;
    column?: number;
  };
  /**
   * Hash of the entry (sourceText + componentName + filePath)
   */
  hash: string;

  /**
   * When this entry was first added
   */
  addedAt: string;

  /**
   * Last time this entry was seen during compilation
   */
  lastSeenAt?: string;
}

/**
 * Metadata file schema
 */
export interface MetadataSchema {
  /**
   * Schema version
   */
  version: string;

  /**
   * All translation entries indexed by hash
   */
  entries: Record<string, TranslationEntry>;

  /**
   * Statistics about the metadata
   */
  stats?: {
    totalEntries: number;
    lastUpdated: string;
  };
}

export type ComponentType = "client" | "server" | "unknown";
