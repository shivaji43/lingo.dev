/**
 * Next.js-specific components and utilities for Lingo.dev
 *
 * @module @lingo.dev/_compiler/react/next
 */
// Locale resolver for Next.js (reads from cookies)
export { createNextCookieLocaleResolver } from "./cookie-locale-resolver";
export type { NextLocaleResolverConfig } from "./cookie-locale-resolver";
