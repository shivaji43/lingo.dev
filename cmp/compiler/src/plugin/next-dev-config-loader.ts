import type { LingoConfig } from "../types";
import { generateDevConfigModule } from "./locale-code-generator";

/**
 * Loader for dev-config module
 * Generates full module code - ignores source file (template is only for types)
 */
export default function nextDevConfigLoader(
  this: any,
  _source: string,
): string {
  const config: LingoConfig = this.getOptions();
  return generateDevConfigModule(config);
}
