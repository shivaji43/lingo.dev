import type { NextConfig } from "next";
import type {
  NextJsWebpackConfig,
  TurbopackOptions,
  WebpackConfigContext,
} from "next/dist/server/config-shared";

import { getConfigPath } from "../utils/path-helpers";
import { createLingoConfig } from "../utils/config-factory";
import { logger } from "../utils/logger";
import type { PartialLingoConfig } from "../types";
import { lingoUnplugin } from "./unplugin";
import { useI18nRegex } from "./transform/use-i18n";

export type LingoNextPluginOptions = PartialLingoConfig;

/**
 * Check if Next.js supports stable turbopack config (Next.js 16+)
 */
function hasStableTurboConfig(): boolean {
  try {
    const nextPackage = require("next/package.json");
    const majorVersion = parseInt(nextPackage.version.split(".")[0], 10);
    return majorVersion >= 16;
  } catch {
    return false;
  }
}

function getTurbopackConfig(userConfig: NextConfig): TurbopackOptions {
  return (
    (hasStableTurboConfig()
      ? userConfig?.turbopack?.rules
      : // @ts-expect-error - experimental.turbo for Next.js <16
        userConfig?.experimental?.turbo) || {}
  );
}

/**
 * Merge Turbopack rules without mutating original
 */
function mergeTurbopackRules(
  existingRules: Record<string, any>,
  newRule: { pattern: string; config: any },
): Record<string, any> {
  // Create a shallow copy to avoid mutation
  const mergedRules = { ...existingRules };

  const { pattern, config } = newRule;

  if (mergedRules[pattern]) {
    if (Array.isArray(mergedRules[pattern])) {
      mergedRules[pattern] = [...mergedRules[pattern], config];
    } else {
      mergedRules[pattern] = [mergedRules[pattern], config];
    }
  } else {
    mergedRules[pattern] = config;
  }

  return mergedRules;
}

/**
 * Build the complete Lingo config object
 */
function buildLingoConfig(
  userNextConfig: NextConfig,
  lingoOptions: LingoNextPluginOptions,
): NextConfig {
  const lingoConfig = createLingoConfig(lingoOptions);

  // Prepare Turbopack loader configuration
  const loaderConfig = {
    loader: "@lingo.dev/_compiler/turbopack-loader",
    options: {
      sourceRoot: lingoConfig.sourceRoot,
      lingoDir: lingoConfig.lingoDir,
      sourceLocale: lingoConfig.sourceLocale,
      useDirective: lingoConfig.useDirective,
    },
  };

  // Build rule config with optional content condition for useDirective
  const lingoRuleConfig: any = { loaders: [loaderConfig] };

  // If useDirective is enabled, add content condition to skip files without "use i18n"
  // This is more efficient than checking in the loader itself
  if (lingoConfig.useDirective) {
    lingoRuleConfig.condition = {
      content: useI18nRegex,
    };
  }

  const existingTurbopackConfig = getTurbopackConfig(userNextConfig);
  const mergedRules = mergeTurbopackRules(
    mergeTurbopackRules(existingTurbopackConfig.rules ?? {}, {
      pattern: "*.{tsx,jsx}",
      config: lingoRuleConfig,
    }),
    // TODO (AleksandrSl 02/12/2025): We can also inject default resolvers for locale based on the framework
    {
      pattern: "**/dev-config.mjs",
      config: {
        loaders: [
          {
            loader: "@lingo.dev/_compiler/dev-server-loader",
            options: {
              sourceRoot: lingoConfig.sourceRoot,
              lingoDir: lingoConfig.lingoDir,
              dev: lingoConfig.dev,
              sourceLocale: lingoConfig.sourceLocale,
            },
          },
        ],
      },
    },
  );

  const existingResolveAlias = existingTurbopackConfig.resolveAlias;
  const mergedResolveAlias = {
    ...existingResolveAlias,
    "@lingo.dev/_compiler/config": getConfigPath(lingoConfig),
  };

  // Build Turbopack config (handles Next.js 16+ vs <16)
  let turbopackConfig: Partial<NextConfig>;
  if (hasStableTurboConfig()) {
    turbopackConfig = {
      turbopack: {
        ...userNextConfig.turbopack, // Preserve existing turbopack options
        rules: mergedRules,
        resolveAlias: mergedResolveAlias,
      },
    };
  } else {
    turbopackConfig = {
      experimental: {
        ...userNextConfig.experimental, // Preserve ALL experimental options
        // @ts-expect-error - turbo for Next.js <16
        turbo: {
          // @ts-expect-error - turbo for Next.js <16
          ...userNextConfig.experimental?.turbo, // Preserve existing turbo options
          rules: mergedRules,
          resolveAlias: mergedResolveAlias,
        },
      },
    };
  }

  const runAfterProductionCompile = async ({
    distDir,
    projectDir,
  }: {
    distDir: string;
    projectDir: string;
  }) => {
    // Call user's hook first if it exists
    if (
      typeof userNextConfig.compiler?.runAfterProductionCompile === "function"
    ) {
      await userNextConfig.compiler.runAfterProductionCompile({
        distDir,
        projectDir,
      });
    }

    logger.info("Running post-build translation generation...");

    try {
      const { processBuildTranslations } = await import("./build-translator");

      await processBuildTranslations({
        config: lingoConfig,
        publicOutputPath: distDir,
      });
    } catch (error) {
      logger.error("Translation generation failed:", error);
      throw error;
    }
  };

  const webpack: NextJsWebpackConfig = (
    config: any,
    options: WebpackConfigContext,
  ) => {
    // Apply user's webpack config first if it exists
    let modifiedConfig = config;
    if (typeof userNextConfig.webpack === "function") {
      modifiedConfig = userNextConfig.webpack(config, options);
    }

    modifiedConfig.plugins = modifiedConfig.plugins || [];
    modifiedConfig.plugins.push(lingoUnplugin.webpack(lingoOptions));

    return modifiedConfig;
  };

  const finalConfig = {
    ...userNextConfig,
    ...turbopackConfig,
    compiler: {
      ...userNextConfig.compiler,
      runAfterProductionCompile,
    },
    webpack,
  };

  // Attach Lingo config for CLI extraction
  // @ts-expect-error - Internal property for CLI access
  finalConfig._lingoConfig = lingoOptions;

  return finalConfig;
}

/**
 * Next.js plugin that automatically adds the Lingo loader
 *
 * @example
 * // Simple usage
 * module.exports = withLingo({ reactStrictMode: true }, lingoOptions);
 *
 * @example
 * // With Next.js phase
 * module.exports = async (phase, { defaultConfig }) =>
 *   withLingo({ ...defaultConfig, custom: phase }, lingoOptions);
 *
 * @example
 * // Chained with other plugins
 * module.exports = withOtherPlugin(withLingo(baseConfig, lingoOptions));
 */
export function withLingo(
  nextConfig: NextConfig = {},
  lingoOptions: LingoNextPluginOptions,
): NextConfig {
  return buildLingoConfig(nextConfig, lingoOptions);
}

// Also export TypeScript types
export type { NextConfig };
