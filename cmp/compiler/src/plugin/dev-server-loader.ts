import type { LingoConfig } from "../types";
import { logger } from "../utils/logger";
import { getCacheDir } from "../utils/path-helpers";

export default async function devServerLoader(
  this: any,
  source: string,
): Promise<void> {
  // Ensure we're running in loader context
  if (typeof this.async !== "function") {
    throw new Error("This module must be run as a loader");
  }
  logger.debug("Running devServerLoader");
  const callback = this.async();

  const config: LingoConfig & {
    metadataFilePath: string;
  } = this.getOptions();

  callback(
    null,
    source
      .replace("__SERVER_URL__", config.dev.translationServerUrl!)
      .replace("__CACHE_DIR__", getCacheDir(config)),
  );
}
