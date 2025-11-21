/**
 * Universal Plugin for Lingo.dev Compiler
 *
 * Built with unplugin to support:
 * - Vite
 * - Webpack
 * - Rollup
 * - esbuild
 *
 * Provides:
 * 1. Dev server middleware for on-demand translation generation
 * 2. Build-time pre-generation of translations
 * 3. Babel transformation of JSX
 */

import { createUnplugin } from "unplugin";
import path from "path";
import { transformComponent } from "./transform";
import type { LoaderConfig } from "../types";
import { handleTranslationRequest } from "./shared-middleware";
import { startTranslationServer } from "../server";
import { loadMetadata, saveMetadata, upsertEntries } from "../metadata/manager";

export interface LingoPluginOptions extends Omit<LoaderConfig, "isDev"> {
  /**
   * Locales to pre-generate during build
   * @default [] - Generate none at build time
   */
  preGenerateLocales?: string[];
}

let globalServer: any;

/**
 * Universal plugin for Lingo.dev compiler
 * Supports Vite, Webpack, Rollup, and esbuild
 */
export const lingoUnplugin = createUnplugin<LingoPluginOptions>((options = {} as LingoPluginOptions, meta) => {
  const config: LoaderConfig = {
    ...options,
    sourceRoot: options.sourceRoot ?? "src",
    lingoDir: options.lingoDir ?? ".lingo",
    sourceLocale: options.sourceLocale ?? "en",
    useDirective: options.useDirective ?? false,
    isDev: false, // Will be set correctly in buildStart
    framework: options.framework ?? "unknown", // Will be set by specific plugin
  };

  return {
    name: "lingo-compiler",
    enforce: "pre", // Run before other plugins (especially before React plugin)

    // Vite-specific hooks
    vite: {
      configResolved(resolvedConfig) {
        config.isDev = resolvedConfig.mode === "development";
      },

      // TODO: Add dev server middleware for translation API
      // configureServer(server) {
      //   server.middlewares.use(async (req, res, next) => {
      //     const url = req.url;
      //     const match = url?.match(/^\/api\/translations\/(\w+)$/);
      //     if (!match) return next();
      //
      //     const locale = match[1];
      //     const response = await handleTranslationRequest(locale, {
      //       sourceRoot: config.sourceRoot,
      //       lingoDir: config.lingoDir,
      //       sourceLocale: config.sourceLocale,
      //       translator: config.translator,
      //       allowProductionGeneration: true,
      //     });
      //
      //     res.statusCode = response.status;
      //     Object.entries(response.headers).forEach(([key, value]) => {
      //       res.setHeader(key, value);
      //     });
      //     res.end(response.body);
      //   });
      // },
    },

    // Webpack-specific hooks
    webpack(compiler) {
      config.isDev = compiler.options.mode === "development";
    },

    // Rollup-specific hooks
    rollup: {
      buildStart() {
        // Detect dev mode from command
        config.isDev = process.env.NODE_ENV === "development";
      },
    },

    // esbuild-specific hooks
    esbuild: {
      setup(build) {
        // esbuild doesn't have a clear dev/prod distinction
        // We'll default to production unless explicitly set
        config.isDev = process.env.NODE_ENV === "development";
      },
    },

    async buildStart() {
      // Start translation server if not already running
      if (!globalServer) {
        globalServer = await startTranslationServer({
          startPort: 60000,
          onError: (err) => {
            console.error("Translation server error:", err);
          },
          onReady: () => {
            console.log("Translation server started");
          },
          config,
        });
      }
    },

    transformInclude(id) {
      console.log(`[lingo.dev] transformInclude check for: ${id}`);

      // Only transform .tsx and .jsx files
      if (!id.match(/\.(tsx|jsx)$/)) {
        console.log(`[lingo.dev] Skipping ${id} - not tsx/jsx`);
        return false;
      }

      // Skip node_modules
      if (id.includes("node_modules")) {
        console.log(`[lingo.dev] Skipping ${id} - node_modules`);
        return false;
      }

      console.log(`[lingo.dev] Including ${id} for transformation`);
      return true;
    },

    async transform(code, id) {
      try {
        console.log(`[lingo.dev] transform() called for: ${id}`);
        console.log(`[lingo.dev] Code length: ${code.length}, First 100 chars: ${code.substring(0, 100)}`);

        // Get relative path from sourceRoot
        const relativePath = path
          .relative(path.join(process.cwd(), config.sourceRoot), id)
          .split(path.sep)
          .join("/"); // Normalize for cross-platform consistency

        console.log(`[lingo.dev] Relative path: ${relativePath}`);
        console.log(`[lingo.dev] Config:`, {
          sourceRoot: config.sourceRoot,
          lingoDir: config.lingoDir
        });

        // Load current metadata
        const metadata = await loadMetadata({
          sourceRoot: config.sourceRoot,
          lingoDir: config.lingoDir,
        });

        console.log(`[lingo.dev] Metadata loaded, entries:`, Object.keys(metadata.entries).length);

        // Transform the component
        const result = transformComponent({
          code,
          filePath: id,
          config,
          metadata,
          serverPort: globalServer?.getPort() || null,
        });

        console.log(`[lingo.dev] Transform result:`, {
          transformed: result.transformed,
          newEntriesCount: result.newEntries?.length || 0,
        });

        // If no transformation occurred, return original code
        if (!result.transformed) {
          console.log(`[lingo.dev] No transformation needed for ${id}`);
          return null;
        }

        // Update metadata with new entries
        if (result.newEntries && result.newEntries.length > 0) {
          console.log(`[lingo.dev] Updating metadata with ${result.newEntries.length} new entries`);
          const updatedMetadata = upsertEntries(metadata, result.newEntries);
          await saveMetadata(config, updatedMetadata);

          // Log new translations discovered (in dev mode)
          if (config.isDev) {
            console.log(
              `✨ [lingo.dev] Found ${result.newEntries.length} translatable text(s) in ${id}`,
            );
          }
        }

        console.log(`[lingo.dev] Returning transformed code for ${id}`);
        return {
          code: result.code,
          map: result.map,
        };
      } catch (error) {
        console.error(`[lingo.dev] Transform error in ${id}:`, error);
        return null;
      }
    },

    async buildEnd() {
      // Pre-generate translations for specified locales during build
      if (!config.isDev && options.preGenerateLocales?.length) {
        console.log(
          "[lingo.dev] Pre-generating translations for build...",
        );

        for (const locale of options.preGenerateLocales) {
          try {
            const response = await handleTranslationRequest(locale, {
              sourceRoot: config.sourceRoot,
              lingoDir: config.lingoDir,
              sourceLocale: config.sourceLocale,
              translator: config.translator,
              allowProductionGeneration: true,
            });

            if (response.status !== 200) {
              console.error(
                `[lingo.dev] Failed to pre-generate ${locale}: ${response.body}`,
              );
            }
          } catch (error) {
            console.error(
              `[lingo.dev] Failed to pre-generate ${locale}:`,
              error,
            );
          }
        }
      }
    },
  };
});
