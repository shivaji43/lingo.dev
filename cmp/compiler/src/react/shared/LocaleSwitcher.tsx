"use client";

import { useTranslationContext } from "../shared/TranslationContext";
import type { CSSProperties } from "react";

/**
 * Locale configuration
 */
export interface LocaleConfig {
  /**
   * Locale code (e.g., 'en', 'de', 'fr')
   */
  code: string;

  /**
   * Display name (e.g., 'English', 'Deutsch', 'Français')
   */
  label: string;
}

/**
 * LocaleSwitcher component props
 */
export interface LocaleSwitcherProps {
  /**
   * Available locales
   * @default [{ code: 'en', label: 'English' }]
   */
  locales?: LocaleConfig[];

  /**
   * Custom styles for the select element
   */
  style?: CSSProperties;

  /**
   * Custom class name
   */
  className?: string;

  /**
   * Show loading indicator
   * @default true
   */
  showLoadingState?: boolean;
}

/**
 * LocaleSwitcher Component
 *
 * Provides a dropdown to switch between locales.
 * Works with both Next.js and other React frameworks.
 *
 * **How it works:**
 * 1. User selects new locale
 * 2. TranslationProvider automatically:
 *    - Updates cookie for persistence
 *    - Refreshes Server Components (if Next.js router provided to provider)
 *    - Loads translations for new locale
 * 3. Client state is preserved throughout!
 *
 * @example
 * ```tsx
 * import { LocaleSwitcher } from '@lingo.dev/compiler/react';
 *
 * export function Header() {
 *   return (
 *     <header>
 *       <LocaleSwitcher locales={[
 *         { code: 'en', label: 'English' },
 *         { code: 'de', label: 'Deutsch' },
 *         { code: 'fr', label: 'Français' },
 *       ]} />
 *     </header>
 *   );
 * }
 * ```
 */
export function LocaleSwitcher({
  locales = [
    {
      code: "en",
      label: "English",
    },
  ],
  style,
  className = "lingo-locale-switcher",
  showLoadingState = true,
}: LocaleSwitcherProps) {
  const { locale, setLocale, isLoading } = useTranslationContext();

  const loading = showLoadingState && isLoading;

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value)}
      disabled={loading}
      className={className}
      style={{
        opacity: loading ? 0.5 : 1,
        cursor: loading ? "wait" : "pointer",
        ...style,
      }}
      aria-label="Select language"
    >
      {locales.map((loc) => (
        <option key={loc.code} value={loc.code}>
          {loc.label}
        </option>
      ))}
    </select>
  );
}
