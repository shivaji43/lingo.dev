import type { CookieConfig } from "../types";

/**
 * Default cookie configuration
 * - name: 'locale'
 * - maxAge: 31536000 (1 year)
 */
export const defaultCookieConfig: CookieConfig = {
  name: "locale",
  maxAge: 31536000,
};
