/**
 * Next.js-specific locale resolver
 * Reads locale from Next.js cookies
 *
 * This resolver ONLY handles locale resolution - it does NOT fetch translations.
 * Translation fetching is handled by the core translation service (server/translations.ts)
 *
 * @module @lingo.dev/_compiler/react/next
 */

import type { LocaleResolver } from "../config";
import { cookies } from "next/headers";

/**
 * Configuration for Next.js locale resolver
 */
export interface NextLocaleResolverConfig {
  /**
   * Cookie name to read locale from
   * @default 'locale'
   */
  cookieName?: string;

  /**
   * Default locale if cookie is not set
   * @default 'en'
   */
  defaultLocale?: string;
}

/**
 * Create Next.js locale resolver
 *
 * This resolver reads the locale from Next.js cookies.
 * It does NOT fetch translations - that's handled separately by the core translation service.
 *
 * @param config - Configuration options
 * @returns Locale resolver function
 *
 * @example
 * ```typescript
 * import { setLocaleResolver } from '@lingo.dev/_compiler/react';
 * import { createNextLocaleResolver } from '@lingo.dev/_compiler/react/next';
 *
 * // Use default config (cookie name: 'locale', default: 'en')
 * setLocaleResolver(createNextLocaleResolver());
 *
 * // Or customize
 * setLocaleResolver(createNextLocaleResolver({
 *   cookieName: 'user_language',
 *   defaultLocale: 'de'
 * }));
 * ```
 */
export function createNextCookieLocaleResolver(
  config: NextLocaleResolverConfig = {},
): LocaleResolver {
  const cookieName = config.cookieName || "locale";
  const defaultLocale = config.defaultLocale || "en";

  return async () => {
    try {
      const cookieStore = await cookies();
      return cookieStore.get(cookieName)?.value || defaultLocale;
    } catch (error) {
      // Fallback on error (e.g., not in Next.js environment, or cookies() failed)
      if (process.env.DEBUG) {
        process.stderr.write(
          `[lingo.dev] Error reading locale from Next.js cookies: ${error}\n`,
        );
      }
      return defaultLocale;
    }
  };
}
