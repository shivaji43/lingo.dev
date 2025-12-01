"use client";

import { ReactNode, useCallback, useEffect } from "react";
import { useTranslationContext } from "./TranslationContext";
import { logger } from "../../utils/logger";
import { renderRichText, RichTextParams } from "../render-rich-text";
import { TranslationHook } from "../types";

/**
 * useTranslation Hook
 *
 * Returns a translation function `t(hash, source, params?)` that:
 * - Returns original text for source locale
 * - Returns translated text for target locales
 * - Supports rich text with variable and component placeholders
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
 *       <p>{t('hash_def456', 'Hello {name}', { name: 'Alice' })}</p>
 *       <p>{t('hash_def789', 'Click <a0>here</a0>', {
 *         a0: (chunks) => <a href="/home">{chunks}</a>
 *       })}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export const useTranslation: TranslationHook = (
  hashes: string[],
  serverUrl?: string,
) => {
  const { translations, registerHashes, locale, sourceLocale } =
    useTranslationContext();

  // Register all hashes in useEffect (safe for state updates)
  useEffect(() => {
    // Skip if source locale
    if (locale === sourceLocale) {
      return;
    }

    logger.debug(`Registering ${hashes.length} hashes for component`);

    registerHashes(hashes);
  }, [hashes, registerHashes, locale, sourceLocale]);

  return useCallback(
    (hash: string, source: string, params?: RichTextParams): ReactNode => {
      // Get the text (either source or translation)
      const text =
        locale === sourceLocale ? source : translations[hash] || source;

      // If no params, return plain text
      if (!params) {
        return text;
      }

      return renderRichText(text, params);
    },
    [translations, locale, sourceLocale],
  );
};
