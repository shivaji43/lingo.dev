/**
 * React components for Lingo.dev translation runtime
 *
 * This file serves as the CLIENT-SIDE entry point via conditional exports.
 * The server-side entry point is in ./server.ts
 *
 * @module @lingo.dev/_compiler/react (client)
 */
export {
  TranslationProvider,
  useTranslationContext,
  getLocaleFromCookies,
  type TranslationContextType,
  type TranslationProviderProps,
} from "../shared/TranslationContext";

export { useTranslation } from "./useTranslation";

export { LocaleSwitcher } from "../shared/LocaleSwitcher";
