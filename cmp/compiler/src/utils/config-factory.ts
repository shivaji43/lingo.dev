/**
 * Config factory for creating LoaderConfig instances
 */
import type {
  LingoConfig,
  PartialLingoConfig,
  LingoConfigRequiredFields,
} from "../types";

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  sourceRoot: "src",
  lingoDir: "lingo",
  useDirective: false,
  skipPatterns: [/node_modules/, /\.spec\./, /\.test\./] as RegExp[],
  dev: {
    serverStartPort: 60000,
  },
  cookieConfig: {
    name: "locale",
    maxAge: 31536000,
  },
  models: "lingo.dev",
  pluralization: {
    enabled: true,
    model: "groq:llama3-8b-8192",
  },
  buildMode: "translate",
} satisfies Omit<LingoConfig, LingoConfigRequiredFields>;

/**
 * Create a LoaderConfig with defaults applied
 *
 * @param options - Partial config to override defaults
 * @returns Complete LoaderConfig with all defaults applied
 *
 */
export function createLingoConfig(options: PartialLingoConfig): LingoConfig {
  return {
    ...DEFAULT_CONFIG,
    ...options,
    dev: {
      ...DEFAULT_CONFIG.dev,
      ...options.dev,
    },
    pluralization: {
      ...DEFAULT_CONFIG.pluralization,
      ...options.pluralization,
    },
  };
}
