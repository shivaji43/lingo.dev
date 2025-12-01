/**
 * Configuration system for locale resolution in Server Components
 * Allows custom locale resolvers while providing sensible defaults
 *
 * ARCHITECTURE NOTE:
 * This module handles ONLY locale resolution (determining which locale to use).
 * Translation fetching is handled separately by server/translations.ts.
 *
 * This separation allows:
 * - Framework-specific locale resolution (cookies, URL, headers, etc.)
 * - Universal translation fetching pattern across all frameworks
 *
 * @module @lingo.dev/_compiler/react/config
 */

/**
 * Locale resolver function type
 * Called once per request on the server (cached by React)
 *
 * The resolver should ONLY determine the locale - it does NOT fetch translations.
 * Translation fetching is handled by the core translation service.
 *
 * @returns Promise resolving to the current locale string
 *
 * @example
 * ```typescript
 * // Next.js resolver
 * setLocaleResolver(async () => {
 *   const cookieStore = await cookies();
 *   return cookieStore.get('locale')?.value || 'en';
 * });
 * ```
 *
 * @example
 * ```typescript
 * // React Router resolver
 * setLocaleResolver(async () => {
 *   // In React Router, you might extract from URL params
 *   // This example is conceptual - actual implementation depends on your routing
 *   return 'en'; // Replace with actual logic
 * });
 * ```
 */
export type LocaleResolver = () => Promise<string>;

/**
 * Global resolver storage
 * No default - server.ts will auto-detect framework and provide fallback
 */
let globalResolver: LocaleResolver | null = null;

/**
 * Set custom locale resolver
 * Call this in your app's server entry point or root layout
 *
 * The resolver should ONLY return the locale string.
 * It should NOT fetch translations - that's handled automatically.
 *
 * @param resolver - Custom locale resolver function
 *
 * @example Next.js - Reading from cookies
 * ```typescript
 * // In app/layout.tsx or i18n config
 * import { setLocaleResolver } from '@lingo.dev/_compiler/react';
 * import { cookies } from 'next/headers';
 *
 * setLocaleResolver(async () => {
 *   const cookieStore = await cookies();
 *   return cookieStore.get('locale')?.value || 'en';
 * });
 * ```
 *
 * @example Next.js - Reading from URL params
 * ```typescript
 * import { setLocaleResolver } from '@lingo.dev/_compiler/react';
 *
 * // If using [locale] dynamic route
 * setLocaleResolver(async () => {
 *   // Note: This is conceptual - you'd need to pass params somehow
 *   // Better to use cookies for cross-page persistence
 *   return params.locale || 'en';
 * });
 * ```
 *
 * @example React Router - Reading from request
 * ```typescript
 * import { setLocaleResolver } from '@lingo.dev/_compiler/react';
 *
 * setLocaleResolver(async () => {
 *   // In React Router, you'd typically do this in a loader
 *   // and pass it via context or similar mechanism
 *   return 'en'; // Replace with actual logic
 * });
 * ```
 */
export function setLocaleResolver(resolver: LocaleResolver): void {
  globalResolver = resolver;
}

/**
 * Get the current locale resolver
 * Returns null if no resolver is set (server.ts will provide framework-specific default)
 *
 * NOTE: This function MUST NOT import server-specific modules
 * to avoid bundling them into the client code
 */
export function getLocaleResolver(): LocaleResolver | null {
  return globalResolver;
}
