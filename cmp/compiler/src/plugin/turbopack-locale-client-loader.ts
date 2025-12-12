/**
 * Turbopack loader for locale/client.ts
 * Replaces __LOCALE_CLIENT_IMPL__ with client-side locale detection and persistence code
 */

import type { LingoConfig } from "../types";
import { generateClientLocaleCode } from "./locale-code-generator";

export default async function turbopackLocaleClientLoader(
  this: any,
  source: string,
): Promise<void> {
  const callback = this.async();
  const config: LingoConfig = this.getOptions();

  const { getClientLocale, persistLocale } = generateClientLocaleCode(config);

  const result = source
    .replace('return "en"', getClientLocale)
    .replace("return __NOOP_PERSIST_LOCALE__()", persistLocale);
  callback(null, result);
}
