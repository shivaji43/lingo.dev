/**
 * Get the current locale resolver
 * Returns null if no resolver is set (server.ts will provide framework-specific default)
 *
 * NOTE: This function MUST NOT import server-specific modules
 * to avoid bundling them into the client code
 */
export function localeResolver(): Promise<string> {
  //   // Lazy import to avoid bundling Next.js code in non-Next.js projects
  //   try {
  //     // Try to import Next.js resolver
  //     const {
  //       createNextCookieLocaleResolver,
  //     } = require("./next/cookie-locale-resolver");
  //     logger.debug("Using Next.js locale resolver (reading from cookies)");
  //     return createNextCookieLocaleResolver();
  //   } catch {
  //     // Fallback: return a basic resolver that just returns 'en'
  //     logger.debug("No framework-specific resolver found, defaulting to 'en'");
  //     return async () => "en";
  //   }

  throw new Error("Couldn't find locale resolver");
}
