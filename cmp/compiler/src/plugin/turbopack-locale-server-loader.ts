/**
 * Turbopack loader for locale/server.ts
 * Replaces __LOCALE_SERVER_IMPL__ with server-side locale detection code
 */

import type { LingoConfig } from "../types";
import { generateServerLocaleCode } from "./locale-code-generator";

export default async function turbopackLocaleServerLoader(
  this: any,
  source: string,
): Promise<void> {
  const callback = this.async();
  const config: LingoConfig = this.getOptions();

  const implementation = generateServerLocaleCode(config);

  const result = source.replace('return "en"', implementation);
  callback(null, result);
}
