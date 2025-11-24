"use client";

import { useCallback, useEffect } from "react";
import { useTranslationContext } from "./TranslationContext";

/**
 * Translation function type
 */
export type TranslationFunction = (hash: string, source: string) => string;

/**
 * useTranslation Hook
 *
 * Returns a translation function `t(hash)` that:
 * - Returns original text for source locale
 * - Returns translated text for target locales
 * - Automatically requests missing translations
 * - Falls back to source text while loading
 *
 * This hook is automatically injected by the Babel plugin.
 * You typically don't need to call it manually.
 *
 * @param hashes - Static list of all translation hashes used in this component (injected at build time)
 *
 * @example
 * ```tsx
 * 'use client';
 *
 * export function Welcome() {
 *   const t = useTranslation(['hash_abc123', 'hash_def456']);
 *
 *   return (
 *     <div>
 *       <h1>{t('hash_abc123', 'Welcome')}</h1>
 *       <p>{t('hash_def456', 'Hello world')}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useTranslation(hashes: string[]): TranslationFunction {
  const { translations, registerHashes, locale, sourceLocale } =
    useTranslationContext();

  // Register all hashes in useEffect (safe for state updates)
  useEffect(() => {
    // Skip if source locale
    if (locale === sourceLocale) {
      return;
    }

    console.log(
      `[lingo.dev] Registering ${hashes.length} hashes for component`,
    );

    registerHashes(hashes);
  }, [hashes, registerHashes, locale, sourceLocale]);

  return useCallback(
    (hash: string, source: string): string => {
      // For source locale, always return source text
      if (locale === sourceLocale) {
        return source;
      }

      // Return translation if available, otherwise return source as fallback
      return translations[hash] || source;
    },
    [translations, locale, sourceLocale],
  );
}
