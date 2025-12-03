/**
 * Server-side translation utilities for React Server Components
 * Provides async API for explicit locale passing
 *
 * NOTE: For most cases, use the unified `useTranslation()` hook instead.
 * This module is for advanced use cases where you need explicit control.
 *
 * @module @lingo.dev/_compiler-beta/react/server
 */

import { fetchTranslationsOnServer } from "./translations";
import { renderRichText, RichTextParams } from "../shared/render-rich-text";
import type { ReactNode } from "react";
import { logger } from "../../utils/logger";
// Keep this import full for replacement during build.
import { localeResolver } from "@lingo.dev/_compiler/config";

/**
 * Get server-side translations function
 * This is the async alternative to useTranslation() for Server Components
 *
 * For the most common use case, use the unified `useTranslation()` hook instead.
 *
 * The function automatically fetches translations from static files in production
 * and falls back to the development server in development mode.
 */
export async function getServerTranslations(options: {
  /**
   * Target locale for translations (required)
   */
  locale?: string;

  /**
   * List of translation hashes needed for this component
   * Typically injected at build time by the Babel plugin
   */
  hashes?: string[];

  /**
   * Base path for translation files
   * @default process.cwd()
   */
  basePath?: string;
}): Promise<{
  t: (
    hash: string,
    sourceText: string,
    params?: RichTextParams,
  ) => string | ReactNode;
  locale: string;
  translations: Record<string, string>;
}> {
  const locale = options.locale || (await localeResolver());

  logger.debug(`Async Server. Fetching translations for ${locale}`);

  const translations = await fetchTranslationsOnServer(
    locale,
    options.hashes ?? [],
    {
      basePath: options.basePath,
    },
  );

  return {
    t: (hash: string, sourceText: string, params?: RichTextParams) => {
      const text = translations[hash] || sourceText;

      if (!params) {
        return text;
      }

      return renderRichText(text, params);
    },
    locale,
    translations,
  };
}
