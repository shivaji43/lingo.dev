/**
 * React components for Lingo.dev translation runtime
 *
 * @module @lingo.dev/_compiler-beta/react
 */
// TODO (AleksandrSl 27/11/2025): Is this needed, I don't think so.
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
  type TranslationFunction,
} from "./client/useTranslation";

// Export components
export {
  LocaleSwitcher,
  type LocaleSwitcherProps,
  type LocaleConfig,
} from "./client/LocaleSwitcher";

// Export dev widget for Next.js
export { NextDevWidget } from "../widget/NextDevWidget";
