/**
 * Next.js-specific locale resolver
 * Reads locale from Next.js cookies
 *
 * This resolver ONLY handles locale resolution - it does NOT fetch translations.
 * Translation fetching is handled by the core translation service (server/translations.ts)
 */
import type { CookieConfig } from "../../types";
import { cookies } from "next/headers";

/**
 * Configuration for Next.js locale resolver
 */
export interface NextLocaleResolverConfig {
  /**
   * Cookie configuration (name and maxAge)
   * @default { name: 'locale', maxAge: 31536000 }
   */
  cookieConfig?: CookieConfig;

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
 * import { setLocaleResolver } from '@lingo.dev/compiler/react';
 * import { createNextCookieLocaleResolver } from '@lingo.dev/compiler/react/next';
 *
 * // Use default config (cookie name: 'locale', default: 'en')
 * setLocaleResolver(createNextCookieLocaleResolver());
 *
 * // Or customize with cookie config
 * setLocaleResolver(createNextCookieLocaleResolver({
 *   cookieConfig: { name: 'user_language', maxAge: 2592000 },
 *   defaultLocale: 'de'
 * }));
 * ```
 */
export function createNextCookieLocaleResolver(
  config: NextLocaleResolverConfig = {},
): () => Promise<string> {
  const cookieName = config.cookieConfig?.name || "locale";
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
