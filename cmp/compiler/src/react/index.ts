/**
 * React components for Lingo.dev translation runtime
 *
 * This file serves as the CLIENT-SIDE entry point via conditional exports.
 * The server-side entry point is in ./server.ts
 *
 * @module @lingo.dev/_compiler/react (client)
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

// Export hooks
export { useTranslation } from "./client/useTranslation";

// Export components
export {
  LocaleSwitcher,
  type LocaleSwitcherProps,
  type LocaleConfig,
} from "./client/LocaleSwitcher";
