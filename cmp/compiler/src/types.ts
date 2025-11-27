/**
 * Core types for the compiler-beta translation system
 */

import type { TranslatorConfig } from "./translate";
import type { Framework } from "./types/framework";

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
   * Source locale (e.g., 'en')
   */
  sourceLocale: string;

  targetLocales: string[];

  /**
   * Whether to require 'use i18n' directive
   */
  useDirective?: boolean;

  /**
   * Whether running in development mode
   */
  isDev?: boolean;

  /**
   * Whether this loader is processing server components
   * When true, only server component logic will be applied
   */
  isServer?: boolean;

  /**
   * Skip transformation for specific patterns
   */
  skipPatterns?: RegExp[];

  /**
   * Translation provider to use
   */
  translator?: TranslatorConfig;

  /**
   * Framework being used (affects component detection)
   */
  framework?: Framework;
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
  "sourceRoot" | "lingoDir" | "sourceLocale" | "translator"
>;

/**
 * Config needed for path operations
 * Alias for MetadataConfig (same fields)
 */
export type PathConfig = Pick<LoaderConfig, "sourceRoot" | "lingoDir">;

/**
 * Context information for a translatable text
 */
export interface TranslationContext {
  /**
   * Name of the React component (or "metadata" for metadata strings)
   */
  componentName: string;

  /**
   * Relative file path from sourceRoot
   */
  filePath: string;

  /**
   * Line number in the source file
   */
  line?: number;

  /**
   * Column number in the source file
   */
  column?: number;

  // TODO (AleksandrSl 27/11/2025): Maybe keep metadata and component will be default.
  /**
   * Type of translation: component text or metadata
   */
  type?: "component" | "metadata";

  /**
   * For metadata translations, the field path (e.g., "title", "openGraph.title")
   */
  metadataField?: string;
}

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
  context: TranslationContext;

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
