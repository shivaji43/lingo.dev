/**
 * Server-side translation utilities for React Server Components
 *
 * @module @lingo.dev/_compiler-beta/react/server
 */

import { cookies } from "next/headers";

/**
 * Dictionary schema for translation
 */
export interface DictionarySchema {
  version: number;
  locale: string;
  files: Record<
    string,
    {
      entries: Record<string, string>;
    }
  >;
}

/**
 * Get locale from cookies (server-side)
 */
export async function getLocaleFromCookies(
  cookieName = "locale",
  defaultLocale = "en",
): Promise<string> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(cookieName)?.value || defaultLocale;
  } catch {
    return defaultLocale;
  }
}

/**
 * Get server-side translations function
 * This is the async alternative to useTranslation() for Server Components
 *
 * IMPORTANT: The metadata parameter should be an imported JSON file, not loaded from fs
 * Example: import metadata from './app/.lingo/metadata.json'
 *
 * @param options Configuration options (metadata is required)
 * @returns Translation function
 */
export async function getServerTranslations(options: {
  locale?: string;
  sourceLocale?: string;
  translations?: Record<string, string>;
  serverPort?: number | null;
}): Promise<(hash: string, sourceText: string) => string> {
  const sourceLocale = options.sourceLocale || "en";

  // Get locale from cookies if not provided
  const locale = options.locale || (await getLocaleFromCookies());

  // For source locale, return source text directly
  if (locale === sourceLocale) {
    return (_hash: string, sourceText: string) => sourceText;
  }

  // For non-source locales, we need translations
  let translations: Record<string, string> = {};

  // Check if serverPort is provided - fetch from translation server
  if (options.serverPort) {
    console.log(
      `[lingo.dev] Fetching translations from server (port ${options.serverPort}) for locale: ${locale}`,
    );
    try {
      const response = await fetch(
        `http://127.0.0.1:${options.serverPort}/translations/${locale}`,
      );

      if (response.ok) {
        const data = await response.json();
        console.log(
          `[lingo.dev] Fetched translations for locale: ${locale}`,
          data,
        );

        // Extract translations from dictionary format
        if (data.files) {
          Object.values(data.files || {}).forEach((file: any) => {
            Object.assign(translations, file.entries || {});
          });
        }
      } else {
        console.warn(
          `[lingo.dev] Failed to fetch from server: ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error(`[lingo.dev] Error fetching from server:`, error);
    }
  } else if (options.translations) {
    // Check if translations dictionary was provided (from dynamic import)
    console.log(
      `[lingo.dev] Using pre-loaded translations for locale: ${locale}`,
    );
    translations = options.translations;
  }

  // console.log(`[lingo.dev] Fetched translations for locale: ${locale}`, translations);

  // Return translation function
  return (hash: string, sourceText: string) => {
    console.log(`[lingo.dev] Translating hash: ${hash} for locale: ${locale}`);
    // Try to get translation
    if (translations[hash]) {
      return translations[hash];
    }

    return sourceText;
  };
}
