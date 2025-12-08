/**
 * Shared code generation for locale resolution modules
 * Used by both unplugin (virtual modules) and Turbopack loaders
 */

import type { LingoConfig } from "../types";

/**
 * Generate server-side locale detection code
 * Reads locale from cookie
 */
export function generateServerLocaleCode(config: LingoConfig): string {
  return `
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const locale = cookieStore.get(${JSON.stringify(config.cookieConfig.name)})?.value;
    return locale || ${JSON.stringify(config.sourceLocale)};
  } catch (error) {
    // Fallback if cookies are not available
    return ${JSON.stringify(config.sourceLocale)};
  }`;
}

/**
 * Generate client-side locale detection and persistence code
 * Includes both getClientLocale() and persistLocale() functions
 */
export function generateClientLocaleCode(config: LingoConfig): {
  getClientLocale: string;
  persistLocale: string;
} {
  const cookieName = config.cookieConfig.name;
  const maxAge = config.cookieConfig.maxAge;

  return {
    getClientLocale: `
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/${cookieName}=([^;]+)/);
    if (match) return match[1];
  }
  // Fallback to source locale
  return ${JSON.stringify(config.sourceLocale)};
`,
    persistLocale: `if (typeof document !== 'undefined') {
    document.cookie = \`${cookieName}=\${locale}; path=/; max-age=${maxAge}\`;
  }`,
  };
}
