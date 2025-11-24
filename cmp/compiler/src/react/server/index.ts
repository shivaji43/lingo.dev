/**
 * Server-side translation utilities for React Server Components
 *
 * @module @lingo.dev/_compiler-beta/react/server
 */

import { cookies } from "next/headers";
import { readFile } from "fs/promises";
import { join } from "path";
import { cache } from "react";

/**
 * Dictionary schema for translation
 * Simple flat structure with direct access to translations
 */
export interface DictionarySchema {
  version: number;
  locale: string;
  entries: Record<string, string>;
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
 * Read translations from filesystem (most efficient for server components)
 * This reads directly from the dist directory without network requests
 */
async function readTranslationsFromFilesystem(
  locale: string,
  distDir?: string,
): Promise<Record<string, string>> {
  try {
    // Determine the path to the translation file
    // In production builds, files are in .next/standalone or dist directory
    const basePath = distDir || process.cwd();
    const possiblePaths = [
      join(basePath, ".next", "standalone", `${locale}.json`),
      join(basePath, ".next", `${locale}.json`),
      join(basePath, "public", `${locale}.json`),
      join(basePath, `${locale}.json`),
    ];

    let data: DictionarySchema | null = null;
    let successPath: string | null = null;

    // Try each path until we find the file
    for (const filePath of possiblePaths) {
      try {
        const fileContent = await readFile(filePath, "utf-8");
        data = JSON.parse(fileContent);
        successPath = filePath;
        break;
      } catch (error) {
        // File doesn't exist at this path, try next one
        continue;
      }
    }

    if (!data) {
      process.stderr.write(
        `[lingo.dev] Translation file not found for locale: ${locale}. Tried paths: ${possiblePaths.join(", ")}\n`,
      );
      return {};
    }

    process.stdout.write(
      `[lingo.dev] Loaded translations from filesystem: ${successPath}\n`,
    );

    // Extract translations from dictionary format
    const translations = data.entries || {};

    process.stdout.write(
      `[lingo.dev] Loaded ${Object.keys(translations).length} translations for locale: ${locale}\n`,
    );

    return translations;
  } catch (error) {
    process.stderr.write(
      `[lingo.dev] Error reading translations from filesystem: ${error}\n`,
    );
    return {};
  }
}

/**
 * Fetch translations from HTTP (fallback or external sources)
 * This uses Next.js's built-in fetch cache for optimal performance
 */
async function fetchTranslationsFromHttp(
  locale: string,
  baseUrl?: string,
): Promise<Record<string, string>> {
  const isDev = process.env.NODE_ENV === "development";

  // In development, always fetch fresh data
  // In production, use Next.js cache with long revalidation
  const cacheOptions = isDev
    ? { cache: "no-store" as const }
    : { next: { revalidate: 3600 } }; // Cache for 1 hour in production

  try {
    const url = `${baseUrl}/${locale}.json`;

    process.stdout.write(
      `[lingo.dev] Fetching translations from HTTP: ${url}\n`,
    );

    const response = await fetch(url, cacheOptions);

    if (!response.ok) {
      process.stderr.write(
        `[lingo.dev] Failed to fetch translation file: ${response.statusText}\n`,
      );
      return {};
    }

    const data: DictionarySchema = await response.json();

    // Extract translations from dictionary format
    const translations = data.entries || {};

    process.stdout.write(
      `[lingo.dev] Loaded ${Object.keys(translations).length} translations for locale: ${locale}\n`,
    );

    return translations;
  } catch (error) {
    process.stderr.write(`[lingo.dev] Error fetching translations: ${error}\n`);
    return {};
  }
}

const cachedFetchTranslationsFromStaticFile = cache(fetchTranslationsFromHttp);

/**
 * Fetch translations from development server
 * Falls back to this in development if static files aren't available
 */
async function fetchTranslationsFromDevServer(
  serverPort: number,
  locale: string,
  hashes: string[],
): Promise<Record<string, string>> {
  try {
    const response = await fetch(
      `http://127.0.0.1:${serverPort}/translations/${locale}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hashes }),
      },
    );

    if (!response.ok) {
      process.stderr.write(
        `[lingo.dev] Failed to fetch from dev server: ${response.statusText}\n`,
      );
      return {};
    }
    const data = await response.json();
    console.debug(`Fetched translations: ${JSON.stringify(data)}`);
    return data || {};
  } catch (error) {
    process.stderr.write(
      `[lingo.dev] Error fetching from dev server: ${error}\n`,
    );
    return {};
  }
}

/**
 * Get server-side translations function
 * This is the async alternative to useTranslation() for Server Components
 *
 * The function automatically fetches translations from static files in production
 * and falls back to the development server in development mode.
 *
 * Uses Next.js's built-in fetch cache for optimal performance:
 * - Production: Cached with 1-hour revalidation
 * - Development: No cache (always fresh)
 *
 * @example
 * ```tsx
 * // In a Server Component
 * export default async function Page({ params }: { params: { locale: string } }) {
 *   const { t } = await getServerTranslations({
 *     locale: params.locale,
 *     hashes: ['hash_123', 'hash_456']
 *   });
 *
 *   return <h1>{t('hash_123', 'Welcome')}</h1>;
 * }
 * ```
 *
 * @param options Configuration options
 * @returns Object with translation function
 */
export async function getServerTranslations(options?: {
  /**
   * Target locale for translations
   * If not provided, will read from cookies
   */
  locale?: string;

  /**
   * Source locale (default language)
   * @default 'en'
   */
  sourceLocale?: string;

  /**
   * Base URL for fetching translation files
   * Useful for custom deployment setups
   * @example 'https://cdn.example.com/translations'
   */
  baseUrl?: string;

  /**
   * Development server port (for fallback in dev mode)
   * @default 60000
   */
  serverPort?: number | null;

  /**
   * Cookie name for reading locale
   * @default 'locale'
   */
  cookieName?: string;

  /**
   * List of translation hashes needed for this component
   * Injected at build time by the Babel plugin
   */
  hashes?: string[];
}): Promise<{
  t: (hash: string, sourceText: string) => string;
  locale: string;
  translations: Record<string, string>;
}> {
  const sourceLocale = options?.sourceLocale || "en";
  const cookieName = options?.cookieName || "locale";
  const hashes = options?.hashes || [];

  // Get locale from cookies if not provided
  const locale =
    options?.locale || (await getLocaleFromCookies(cookieName, sourceLocale));

  // For source locale, return source text directly
  if (locale === sourceLocale) {
    return {
      t: (_hash: string, sourceText: string) => sourceText,
      locale,
      translations: {}, // Empty for source locale - client components will show source text
    };
  }

  // For non-source locales, we need translations
  let translations: Record<string, string> = {};

  const isDev = process.env.NODE_ENV === "development";

  if (isDev && options?.serverPort) {
    // Development mode with server port - fetch from dev server
    process.stdout.write(
      `[lingo.dev] Fetching ${hashes.length} translations from dev server (port ${options.serverPort}) for locale: ${locale}\n`,
    );
    translations = await fetchTranslationsFromDevServer(
      options.serverPort,
      locale,
      hashes,
    );

    console.debug(`Fetched translations: ${JSON.stringify(translations)}`);
  } else {
    // Default: Read from filesystem (most efficient)
    process.stdout.write(
      `[lingo.dev] Reading ${hashes.length} translations from filesystem for locale: ${locale}\n`,
    );
    translations = await readTranslationsFromFilesystem(locale);
  }

  // Return translation function, locale, and full translations object
  return {
    t: (hash: string, sourceText: string) => {
      // Try to get translation
      if (translations[hash]) {
        return translations[hash];
      }

      // Fallback to source text
      if (process.env.NODE_ENV === "development") {
        process.stderr.write(
          `[lingo.dev] Translation not found for hash: ${hash}, using fallback: ${sourceText}\n`,
        );
      }
      return sourceText;
    },
    locale,
    translations, // Pass all translations for client components
  };
}
