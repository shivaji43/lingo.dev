/**
 * Next.js-specific components and utilities for Lingo.dev
 *
 * @module @lingo.dev/_compiler/react/next
 */

export { NextTranslationProvider } from "./NextTranslationContext";
// NextTranslationProvider uses the same props as TranslationProvider
export type { TranslationProviderProps as NextTranslationProviderProps } from "../client/TranslationContext";

// Locale resolver for Next.js (reads from cookies)
export { createNextCookieLocaleResolver } from "./cookie-locale-resolver";
export type { NextLocaleResolverConfig } from "./cookie-locale-resolver";
