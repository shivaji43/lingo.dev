import { logger } from "../utils/logger";
import fs from "fs";
import type { TranslationServer } from "../translation-server";

export async function cleanup(
  server: TranslationServer | undefined,
  metadataFilePath: string,
) {
  // General cleanup. Delete metadata and stop the server if any was started.
  logger.debug(`Attempting to cleanup metadata file: ${metadataFilePath}`);

  try {
    // Check if file exists first
    fs.accessSync(metadataFilePath);
    fs.unlinkSync(metadataFilePath);
    logger.info(`🧹 Cleaned up build metadata file: ${metadataFilePath}`);
  } catch (error: any) {
    // Ignore if file doesn't exist
    if (error.code === "ENOENT") {
      logger.debug(
        `Metadata file already deleted or doesn't exist: ${metadataFilePath}`,
      );
    } else {
      logger.warn(`Failed to cleanup metadata file: ${error.message}`);
    }
  }

  if (server) {
    logger.debug("Stopping translation server...");
    await server.stop();
    logger.info("Translation server stopped");
  }
}
