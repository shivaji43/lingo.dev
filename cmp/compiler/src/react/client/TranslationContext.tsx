"use client";

// TODO (AleksandrSl 21/11/2025): I think there should be a better type
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState, } from "react";

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
    registerHash: (hash: string) => void;

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
}

/**
 * Translation context
 */
const TranslationContext = createContext<TranslationContextType | null>(null);

/**
 * Set locale in cookies (client-side)
 */
function setLocaleInCookies(
    locale: string,
    cookieName: string = "locale",
    maxAge: number = 31536000,
): void {
    if (typeof document === "undefined") {
        return;
    }

    document.cookie = `${cookieName}=${locale}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Translation provider props
 */
export interface TranslationProviderProps {
    /**
     * Initial locale to use
     */
    initialLocale: string;

    /**
     * Source locale (default language)
     */
    sourceLocale?: string;

    /**
     * Initial translations (pre-loaded)
     */
    initialTranslations?: Record<string, string>;

    /**
     * Custom fetch function for translations
     * Default implementation calls /api/translate
     */
    fetchTranslations?: (
        hashes: string[],
        locale: string,
    ) => Promise<Record<string, string>>;

    /**
     * Debounce delay for batching translation requests (ms)
     * Default: 100ms
     */
    batchDelay?: number;

    /**
     * Port of the translation server (if running)
     */
    serverPort?: number | null;

    /**
     * Cookie configuration for persisting locale
     */
    cookie?: {
        /**
         * Cookie name for storing locale
         * @default 'locale'
         */
        name?: string;

        /**
         * Cookie max age in seconds
         * @default 31536000 (1 year)
         */
        maxAge?: number;

        /**
         * Disable cookie persistence
         * @default false
         */
        disabled?: boolean;
    };

    /**
     * Optional router instance for Next.js integration
     * If provided, calls router.refresh() after locale change
     * This ensures Server Components re-render with new locale
     */
    router?: AppRouterInstance;

    children: ReactNode;
}

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
export function TranslationProvider({
                                        initialLocale,
                                        sourceLocale = "en",
                                        initialTranslations = {},
                                        fetchTranslations: customFetchTranslations,
                                        batchDelay = 100,
                                        serverPort: providedServerPort,
                                        cookie: cookieConfig,
                                        router,
                                        children,
                                    }: TranslationProviderProps) {
    // Use provided serverPort or try to read from global variable
    const serverPort =
        providedServerPort ||
        (typeof window !== "undefined" && (window as any).__LINGO_SERVER_PORT__) ||
        60000;

    // Extract cookie configuration with defaults
    const cookieName = cookieConfig?.name ?? "locale";
    const cookieMaxAge = cookieConfig?.maxAge ?? 31536000;
    const cookieDisabled = cookieConfig?.disabled ?? false;

    const [locale, setLocaleState] = useState(initialLocale);
    const [translations, setTranslations] =
        useState<Record<string, string>>(initialTranslations);
    const [isLoading, setIsLoading] = useState(false);

    // Track registered hashes from components (updated every render)
    const registeredHashesRef = useRef<Set<string>>(new Set());

    // Track which hashes are pending translation request
    const pendingHashesRef = useRef<Set<string>>(new Set());

    // Batch timer reference
    const batchTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Use ref to track translations to avoid stale closures
    const translationsRef = useRef<Record<string, string>>(initialTranslations);
    const localeRef = useRef(locale);

    // Keep refs in sync with state
    useEffect(() => {
        translationsRef.current = translations;
    }, [translations]);

    useEffect(() => {
        localeRef.current = locale;
    }, [locale]);

    /**
     * Default fetch function - calls batch translation endpoint
     */
    const defaultFetchTranslations = useCallback(
        async (hashes: string[], targetLocale: string) => {
            // Use POST endpoint for batch translation
            const url = `http://127.0.0.1:${serverPort}/translations/${targetLocale}`;

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({hashes}),
            });

            if (!response.ok) {
                throw new Error(`Translation API error: ${response.statusText}`);
            }

            // Response is a hash -> translation map
            return await response.json();
        },
        [serverPort],
    );

    const fetchFn = customFetchTranslations || defaultFetchTranslations;

    /**
     * Register a hash as being used in a component
     * Called during render - must not trigger state updates
     */
    const registerHash = useCallback((hash: string) => {
        registeredHashesRef.current.add(hash);
    }, []);

    /**
     * Check for missing translations and request them (batched)
     * This runs after every render
     */
    useEffect(() => {
        // Skip if source locale
        if (locale === sourceLocale) {
            registeredHashesRef.current.clear();
            return;
        }

        // Find hashes that are registered but not translated and not already pending
        const missingHashes: string[] = [];
        for (const hash of registeredHashesRef.current) {
            if (
                !translationsRef.current[hash] &&
                !pendingHashesRef.current.has(hash)
            ) {
                missingHashes.push(hash);
                pendingHashesRef.current.add(hash);
            }
        }

        // Clear registered hashes for next render
        registeredHashesRef.current.clear();

        // If no missing hashes, nothing to do
        if (missingHashes.length === 0) return;

        console.log(
            `[lingo.dev] Requesting translations for ${missingHashes.length} hashes in locale ${locale}`,
        );

        // Cancel existing timer
        if (batchTimerRef.current) {
            clearTimeout(batchTimerRef.current);
        }

        // Batch the request
        batchTimerRef.current = setTimeout(async () => {
            const hashesToFetch = Array.from(pendingHashesRef.current);
            pendingHashesRef.current.clear();

            if (hashesToFetch.length === 0) return;

            setIsLoading(true);
            try {
                const newTranslations = await fetchFn(hashesToFetch, localeRef.current);

                setTranslations((prev) => ({...prev, ...newTranslations}));
            } catch (error) {
                console.error(
                    "[TranslationProvider] Failed to fetch translations:",
                    error,
                );
                // Remove from pending so they can be retried
                for (const hash of hashesToFetch) {
                    pendingHashesRef.current.delete(hash);
                }
            } finally {
                setIsLoading(false);
            }
        }, batchDelay);
    }); // Run after every render

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
            if (!cookieDisabled) {
                setLocaleInCookies(newLocale, cookieName, cookieMaxAge);
            }

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
                console.log(
                    `[lingo.dev] Fetching translations for locale: ${newLocale}`,
                );

                // Determine URL based on serverPort
                const url = serverPort
                    ? `http://127.0.0.1:${serverPort}/translations/${newLocale}`
                    : `/api/translations/${newLocale}`;

                // Fetch translation file from API endpoint or server
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch translations: ${response.statusText}`,
                    );
                }

                const translatedDict = await response.json();

                const endTime = performance.now();
                console.log(
                    `[lingo.dev] Translation fetch complete for ${newLocale} in ${(endTime - startTime).toFixed(2)}ms`,
                );

                // Extract all translations from dictionary files
                const allTranslations: Record<string, string> = {};
                Object.values(translatedDict.files || {}).forEach((file: any) => {
                    Object.assign(allTranslations, file.entries || {});
                });

                console.log(
                    `[lingo.dev] Translations loaded for ${newLocale}:`,
                    allTranslations,
                );

                setTranslations(allTranslations);
            } catch (error) {
                console.error(
                    `[lingo.dev] Failed to load translations for ${newLocale}:`,
                    error,
                );
                // Clear translations on error - components will request individually
                setTranslations({});
            } finally {
                setIsLoading(false);
            }
        },
        [sourceLocale, serverPort, cookieDisabled, cookieName, cookieMaxAge, router],
    );

    return (
        <TranslationContext.Provider
            value={{
                locale,
                setLocale,
                translations,
                registerHash,
                isLoading,
                sourceLocale,
                serverPort,
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
