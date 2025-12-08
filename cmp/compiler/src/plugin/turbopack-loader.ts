import type { LingoConfig } from "../types";
import { loadMetadata, saveMetadata, upsertEntries } from "../metadata/manager";
import { shouldTransformFile, transformComponent } from "./transform";
import { logger } from "../utils/logger";

/**
 * Turbopack/Webpack loader for automatic translation
 *
 * This loader transforms React components to inject translation calls automatically.
 *
 * For production builds, translations are generated after compilation completes
 * via Next.js's runAfterProductionCompile hook (see next.ts plugin).
 */
export default async function lingoCompilerTurbopackLoader(
  this: any,
  source: string,
): Promise<void> {
  // Ensure we're running in loader context
  if (typeof this.async !== "function") {
    throw new Error("This module must be run as a loader");
  }
  const callback = this.async();
  const isDev = process.env.NODE_ENV === "development";

  try {
    const config: LingoConfig & { buildMetadataFilename: string } =
      this.getOptions();

    // TODO (AleksandrSl 07/12/2025): Remove too I think
    // Check if this file should be transformed
    if (!shouldTransformFile(this.resourcePath, config)) {
      return callback(null, source);
    }

    // Transform the component
    const result = transformComponent({
      code: source,
      filePath: this.resourcePath,
      config,
    });

    // If no transformation occurred, return original source
    if (!result.transformed) {
      return callback(null, source);
    }

    // Load current metadata
    // In build mode, use timestamped metadata file; in dev mode, use default
    const metadataFilename = isDev ? undefined : config.buildMetadataFilename;
    const metadata = await loadMetadata(config, metadataFilename);
    // Update metadata with new entries
    if (result.newEntries && result.newEntries.length > 0) {
      const updatedMetadata = upsertEntries(metadata, result.newEntries);
      await saveMetadata(config, updatedMetadata, metadataFilename);

      // Log new translations discovered (in dev mode)
      // Note: In production, translations are generated after build via runAfterProductionCompile
      if (isDev) {
        logger.debug(
          `Found ${result.newEntries.length} translatable text(s) in ${this.resourcePath}`,
        );
      }
    }

    // Return transformed code
    callback(null, result.code, result.map);
  } catch (error) {
    logger.error(`Compiler failed for ${this.resourcePath}:`);
    logger.error("Details:", error);
    callback(error as Error);
  }
}
