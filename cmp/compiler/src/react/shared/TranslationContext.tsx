"use client";

// TODO (AleksandrSl 21/11/2025): I think there should be a better type
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { logger } from "../../utils/logger";
import type { LingoDevState } from "../../widget/types";
import { fetchTranslations } from "./utils";
import type { CookieConfig } from "../../types";
import { defaultCookieConfig } from "../../utils/cookies";

/**
 * Translation context type
 */
export interface TranslationContextType {
  /**
   * Current locale (e.g., 'en', 'de', 'fr')
   */
  locale: string;

  /**
   * Change the current locale and dynamically load translations
   */
  setLocale: (locale: string) => Promise<void>;

  /**
   * Translation dictionary: hash -> translated text
   */
  translations: Record<string, string>;

  /**
   * Register a hash as being used in a component
   * The provider will automatically request missing translations
   */
  registerHashes: (hashes: string[], serverUrl?: string) => void;

  /**
   * Whether translations are currently being loaded
   */
  isLoading: boolean;

  /**
   * Source locale (default language)
   */
  sourceLocale: string;

  /**
   * Port of the translation server (if running)
   */
  serverPort?: number | null;

  /**
   * Development statistics (only in dev mode)
   */
  _devStats?: {
    pendingCount: number;
    totalRegisteredCount: number;
  };
}

/**
 * Translation context
 */
const TranslationContext = createContext<TranslationContextType | null>(null);

/**
 * Translation provider props
 */
export interface TranslationProviderProps {
  /**
   * Initial locale to use
   */
  initialLocale?: string;

  /**
   * Source locale (default language)
   */
  sourceLocale?: string;

  /**
   * Initial translations (pre-loaded)
   */
  initialTranslations?: Record<string, string>;

  /**
   * Debounce delay for batching translation requests (ms)
   * Default: 100ms
   */
  batchDelay?: number;
  /**
   * Cookie configuration for persisting locale
   */
  cookieConfig?: CookieConfig;

  /**
   * Optional router instance for Next.js integration
   * If provided, calls router.refresh() after locale change
   * This ensures Server Components re-render with new locale
   */
  router?: AppRouterInstance;

  /**
   * Development widget configuration
   */
  devWidget?: {
    /**
     * Enable/disable widget (default: true in dev mode)
     * Set to false to opt-out
     */
    enabled?: boolean;

    /**
     * Widget position on screen
     * @default 'bottom-left'
     */
    position?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  };

  children: ReactNode;
}

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Translation Provider Component
 *
 * Wraps your app to provide translation context to all components.
 * Handles locale switching and on-demand translation loading.
 *
 * @example
 * ```tsx
 * // In your root layout
 * import { TranslationProvider } from '@lingo.dev/_compiler-beta/react';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <TranslationProvider initialLocale="en">
 *           {children}
 *         </TranslationProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
// Export the appropriate provider directly
export const TranslationProvider = IS_DEV
  ? TranslationProvider__Dev
  : TranslationProvider__Prod;

function TranslationProvider__Prod({
  initialLocale,
  sourceLocale = "en",
  initialTranslations = {},
  cookieConfig: customCookieConfig,
  router,
  children,
}: TranslationProviderProps) {
  const [cookieConfig] = useState(customCookieConfig || defaultCookieConfig);
  // TODO (AleksandrSl 01/12/2025): Correctly provide default locale.
  const [locale, setLocaleState] = useState(initialLocale ?? "en");

  logger.debug(
    `TranslationProvider initialized with locale: ${locale}`,
    initialTranslations,
  );

  /**
   * Change locale - triggers server re-render via router.refresh()
   * Following next-intl pattern: locale changes reload the page with new translations from server
   */
  const setLocale = useCallback(
    async (newLocale: string) => {
      // 1. Persist to cookie so server can read it on next render
      setLocaleInCookies(newLocale, cookieConfig);

      // 2. Update local state for immediate UI feedback
      setLocaleState(newLocale);

      // 3. Trigger server re-render - Server Components will fetch new translations
      // and pass them as initialTranslations prop, causing this component to re-render
      if (router) {
        router.refresh();
      }
    },
    [cookieConfig, router],
  );

  return (
    <TranslationContext.Provider
      value={{
        locale,
        setLocale,
        translations: initialTranslations,
        registerHashes: () => {}, // No-op in production
        isLoading: false, // No loading state - translations come from server
        sourceLocale,
      }}
    >
      {children}
    </TranslationContext.Provider>
  );
}

function TranslationProvider__Dev({
  initialLocale,
  sourceLocale = "en",
  initialTranslations = {},
  batchDelay = 100,
  cookieConfig: customCookieConfig,
  router,
  devWidget,
  children,
}: TranslationProviderProps) {
  const [cookieConfig] = useState(customCookieConfig || defaultCookieConfig);
  const [locale, setLocaleState] = useState(initialLocale ?? "en");
  const [translations, setTranslations] =
    useState<Record<string, string>>(initialTranslations);
  const [isLoading, setIsLoading] = useState(false);
  // This is not ideal, but to keep the transformations to the minimum and centralize the translations this is the easiest way
  const serverUrlRef = useRef<string>();

  // Track registered hashes from components (updated every render)
  const registeredHashesRef = useRef<Set<string>>(new Set());

  // Track all hashes that have been seen (for hot reload detection)
  const [allSeenHashes, setAllSeenHashes] = useState<Set<string>>(new Set());

  // Track which hashes are pending translation request
  const pendingHashesRef = useRef<Set<string>>(new Set());

  // Batch timer reference
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Use ref to track translations to avoid stale closures
  const translationsRef = useRef<Record<string, string>>(initialTranslations);
  const localeRef = useRef(locale);

  useEffect(() => {
    translationsRef.current = translations;
  }, [translations]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  /**
   * Register a hash as being used in a component
   * Called during render - must not trigger state updates immediately
   */
  const registerHashes = useCallback((hashes: string[], serverUrl?: string) => {
    let wasNew = false;
    hashes.forEach((hash) => {
      wasNew = wasNew || !registeredHashesRef.current.has(hash);
      registeredHashesRef.current.add(hash);
    });

    serverUrlRef.current = serverUrl;
    logger.debug(
      `Registering hashes: ${hashes.join(", ")}. Registered hashes: ${registeredHashesRef.current.values()}. wasNew: ${wasNew}`,
    );

    // Schedule a state update for the next tick to track all hashes
    if (wasNew) {
      setAllSeenHashes((prev) => {
        const next = prev.union(new Set(hashes));
        // TODO (AleksandrSl 25/11/2025): Should be a cheaper solution
        logger.debug(`New allSeenHashes: ${[...next.values()]}`);
        return next;
      });
    }
  }, []);

  /**
   * Check for missing translations and request them (batched)
   * This runs when allSeenHashes changes (hot reload or new components mount)
   */
  useEffect(() => {
    logger.debug(
      `TranslationProvider checking translations for locale ${locale}, seen hashes: ${allSeenHashes.size}`,
    );

    // Skip if source locale
    if (locale === sourceLocale) {
      return;
    }

    // Find hashes that are seen but not translated and not already pending
    const missingHashes: string[] = [];
    logger.debug(
      "allSeenHashes: ",
      [...allSeenHashes.values()],
      [...pendingHashesRef.current.values()],
    );
    logger.debug("translationsRef.current: ", translations);
    for (const hash of allSeenHashes) {
      if (!translations[hash] && !pendingHashesRef.current.has(hash)) {
        missingHashes.push(hash);
        pendingHashesRef.current.add(hash);
      }
    }
    logger.debug("Missing hashes: ", missingHashes.join(","));

    // If no missing hashes, nothing to do
    if (missingHashes.length === 0 && localeRef.current == locale) return;

    logger.debug(
      `Requesting translations for ${missingHashes.length} hashes in locale ${locale}`,
    );

    // Cancel existing timer
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
    }

    // Batch the request
    batchTimerRef.current = setTimeout(async () => {
      const hashesToFetch = Array.from(pendingHashesRef.current);
      pendingHashesRef.current.clear();

      logger.debug(`Fetching translations for ${hashesToFetch.length} hashes`);
      if (hashesToFetch.length === 0) return;

      setIsLoading(true);
      try {
        const newTranslations = await fetchTranslations(
          localeRef.current,
          hashesToFetch,
          serverUrlRef.current,
        );

        logger.debug(
          `Fetched translations for ${hashesToFetch.length} hashes:`,
          newTranslations,
        );
        setTranslations((prev) => ({ ...prev, ...newTranslations }));
        for (const hash of hashesToFetch) {
          registeredHashesRef.current.add(hash);
        }
      } catch (error) {
        logger.error("Failed to fetch translations:", error);
        // Remove from pending so they can be retried
        for (const hash of hashesToFetch) {
          pendingHashesRef.current.delete(hash);
        }
      } finally {
        setIsLoading(false);
      }
    }, batchDelay);
  }, [allSeenHashes, locale, sourceLocale, batchDelay, translations]);

  /**
   * Clear batch timer on unmount
   */
  useEffect(() => {
    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, []);

  /**
   * Change locale and load translations dynamically
   */
  const setLocale = useCallback(
    async (newLocale: string) => {
      // 1. Persist to cookie (unless disabled)
      setLocaleInCookies(newLocale, cookieConfig);

      // 2. Update state
      setLocaleState(newLocale);

      // 3. Reload Server Components (if router provided)
      if (router) {
        router.refresh();
      }

      // For source locale, clear translations
      if (newLocale === sourceLocale) {
        setTranslations({});
        return;
      }

      // Fetch translations from API endpoint
      setIsLoading(true);
      const startTime = performance.now();

      try {
        logger.info(`Fetching translations for locale: ${newLocale}`);

        const translatedDict = await fetchTranslations(newLocale);

        const endTime = performance.now();
        logger.info(
          `Translation fetch complete for ${newLocale} in ${(endTime - startTime).toFixed(2)}ms`,
        );

        // Extract all translations from a dictionary
        const allTranslations = translatedDict.entries || {};

        logger.debug(`Translations loaded for ${newLocale}:`, allTranslations);

        setTranslations(allTranslations);
      } catch (error) {
        logger.error(`Failed to load translations for ${newLocale}:`, error);
        // Clear translations on error - components will request individually
        setTranslations({});
      } finally {
        setIsLoading(false);
      }
    },
    [sourceLocale, cookieConfig, router],
  );

  // Load widget on client-side only (avoids SSR issues with HTMLElement)
  useEffect(() => {
    if (devWidget?.enabled !== false) {
      // Dynamic import ensures this only runs on the client
      import("../../widget/lingo-dev-widget").catch((err) => {
        logger.error("Failed to load dev widget:", err);
      });
    }
  }, [devWidget?.enabled]);

  // Publish state to window global for Web Component widget
  useEffect(() => {
    if (typeof window !== "undefined" && devWidget?.enabled !== false) {
      window.__LINGO_DEV_STATE__ = {
        isLoading,
        locale,
        sourceLocale,
        pendingCount: pendingHashesRef.current.size,
        serverPort: null,
        position: devWidget?.position || "bottom-left",
      } satisfies LingoDevState;
      // Trigger widget update
      window.__LINGO_DEV_UPDATE__?.();
    }
  }, [isLoading, locale, sourceLocale, devWidget]);

  // TODO (AleksandrSl 24/11/2025): Should I memo the value?
  return (
    <TranslationContext.Provider
      value={{
        locale,
        setLocale,
        translations,
        registerHashes,
        isLoading,
        sourceLocale,
        _devStats: {
          pendingCount: pendingHashesRef.current.size,
          totalRegisteredCount: registeredHashesRef.current.size,
        },
      }}
    >
      {children}
    </TranslationContext.Provider>
  );
}

/**
 * Hook to access translation context
 *
 * @throws Error if used outside TranslationProvider
 */
export function useTranslationContext(): TranslationContextType {
  const context = useContext(TranslationContext);

  if (!context) {
    throw new Error(
      "useTranslationContext must be used within TranslationProvider",
    );
  }

  return context;
}

/**
 * Set locale in cookies (client-side)
 */
function setLocaleInCookies(
  locale: string,
  cookieConfig: { name: string; maxAge: number },
): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${cookieConfig.name}=${locale}; path=/; max-age=${cookieConfig.maxAge}; SameSite=Lax`;
}

/**
 * Get current locale from cookies (client-side)
 *
 * @param cookieName - Name of the cookie
 * @param defaultLocale - Default locale if cookie not found
 * @returns Current locale from cookie or default
 */
export function getLocaleFromCookies(
  cookieName: string = "locale",
  defaultLocale: string = "en",
): string {
  if (typeof document === "undefined") {
    return defaultLocale;
  }

  const match = document.cookie.match(new RegExp(`(^| )${cookieName}=([^;]+)`));
  return match ? match[2] : defaultLocale;
}
