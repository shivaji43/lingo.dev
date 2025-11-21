/**
 * React components for Lingo.dev translation runtime
 *
 * @module @lingo.dev/_compiler-beta/react
 */

"use client";

// Export context and provider
export {
  TranslationProvider,
  useTranslationContext,
  getLocaleFromCookies,
  type TranslationContextType,
  type TranslationProviderProps,
} from "./client/TranslationContext";

export { NextTranslationProvider } from "./client/NextTranslationContext";

// Export hooks
export {
  useTranslation,
  useTranslationWithStatus,
  type TranslationFunction,
} from "./client/useTranslation";

// Export components
export {
  LocaleSwitcher,
  LocaleSwitcher as LocaleSwitcherPure, // Alias for backwards compatibility
  type LocaleSwitcherProps,
  type LocaleConfig,
} from "./client/LocaleSwitcher";
