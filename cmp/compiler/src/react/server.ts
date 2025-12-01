/**
 * Server-side translation hook using React Server Module Conventions
 * This file is loaded via "react-server" conditional export in package.json
 *
 * When you import from '@lingo.dev/_compiler/react' in a Server Component,
 * the bundler automatically loads THIS file instead of the client version.
 *
 * ARCHITECTURE:
 * This module orchestrates two separate concerns:
 * 1. Locale resolution (framework-specific) - via config.ts
 * 2. Translation fetching (universal) - via server/translations.ts
 *
 * @module @lingo.dev/_compiler/react (server)
 */

import type { ReactNode } from "react";
import { cache, use } from "react";
import { localeResolver } from "@lingo.dev/_compiler/config";
import { fetchTranslationsOnServer } from "./server-only/translations";
import { renderRichText, type RichTextParams } from "./render-rich-text";
import { logger } from "../utils/logger";
import type { TranslationHook } from "./types";

// TODO (AleksandrSl 01/12/2025): Should we add back the cache?
const getTranslations = async (hashes: string[], serverUrl?: string) => {
  // 1. Resolve locale (framework-specific)
  const locale = await localeResolver();

  // 2. Fetch translations (universal)
  const translations = await fetchTranslationsOnServer(
    locale,
    hashes,
    serverUrl,
  );

  logger.debug(
    `Server. The translations for locale ${locale} are: ${JSON.stringify(translations)}`,
  );

  return {
    locale,
    translations,
  };
};

/**
 * Server-side translation hook
 *
 * Works in Server Components WITHOUT async/await!
 * Uses React's use() hook to unwrap the cached promise.
 *
 * This hook has the SAME signature as the client-side version,
 * making components truly isomorphic.
 *
 * @param hashes - List of translation hashes used in component (injected by compiler)
 * @param serverUrl
 * @returns Translation function
 *
 * @example
 * ```tsx
 * // Works in Server Components (no async needed!)
 * export default function ServerPage() {
 *   const t = useTranslation(['hash_abc', 'hash_def']);
 *   return <h1>{t('hash_abc', 'Welcome')}</h1>;
 * }
 *
 * // Also works in Client Components (via conditional exports)
 * 'use client';
 * export default function ClientPage() {
 *   const t = useTranslation(['hash_abc', 'hash_def']);
 *   return <h1>{t('hash_abc', 'Welcome')}</h1>;
 * }
 * ```
 */
export const useTranslation: TranslationHook = (
  hashes: string[],
  serverUrl?: string,
) => {
  // Use React's use() to unwrap the cached promise
  // This appears synchronous in Server Components!
  const { locale, translations } = use(getTranslations(hashes, serverUrl));
  logger.debug(
    `Server. The translations for locale ${locale} are: ${JSON.stringify(translations)}`,
  );

  // Return translation function matching client signature
  return (
    hash: string,
    source: string,
    params?: RichTextParams,
  ): string | ReactNode => {
    // Get translated text or fallback to source
    const text = translations[hash] || source;

    // If no params, return plain text
    if (!params) {
      return text;
    }

    // Render rich text with placeholders
    return renderRichText(text, params);
  };
};

export { TranslationProvider } from "./ServerTranslationProvider";
