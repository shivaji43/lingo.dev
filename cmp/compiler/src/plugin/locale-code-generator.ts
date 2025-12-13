/**
 * Shared code generation for locale resolution modules
 * Used by both unplugin (virtual modules) and Turbopack loaders
 *
 * This module provides FULL module generators, not just function bodies.
 * Both loaders and unplugin use these to generate complete modules.
 */

import type { LingoConfig } from "../types";
import { getCacheDir } from "../utils/path-helpers";

/**
 * Generate complete dev-config module
 * Exports serverUrl and cacheDir constants
 */
export function generateDevConfigModule(config: LingoConfig): string {
  const serverUrl = config.dev.translationServerUrl || "http://127.0.0.1:60000";
  const cacheDir = getCacheDir(config);

  return `export const serverUrl = ${JSON.stringify(serverUrl)};
export const cacheDir = ${JSON.stringify(cacheDir)};
`;
}

/**
 * Generate complete locale/server module
 * Exports async getServerLocale() function
 */
export function generateServerLocaleModule(config: LingoConfig): string {
  return `
export async function getServerLocale() {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const locale = cookieStore.get(${JSON.stringify(config.cookieConfig.name)})?.value;
    return locale || ${JSON.stringify(config.sourceLocale)};
  } catch (error) {
    // Fallback if cookies are not available
    return ${JSON.stringify(config.sourceLocale)};
  }
}
`;
}

/**
 * Generate complete locale/client module
 * Exports getClientLocale() and persistLocale() functions
 */
export function generateClientLocaleModule(config: LingoConfig): string {
  const cookieName = config.cookieConfig.name;
  const maxAge = config.cookieConfig.maxAge;

  return `
export function getClientLocale() {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/${cookieName}=([^;]+)/);
    if (match) return match[1];
  }
  // Fallback to source locale
  return ${JSON.stringify(config.sourceLocale)};
}

export function persistLocale(locale) {
  if (typeof document !== 'undefined') {
    document.cookie = \`${cookieName}=\${locale}; path=/; max-age=${maxAge}\`;
  }
}
`;
}
