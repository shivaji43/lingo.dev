import type { LoaderConfig } from "../types";
import {
  startTranslationServer,
  type TranslationServer,
} from "../translation-server";
import { logger } from "../utils/logger";

let globalServer: TranslationServer;

export default async function devServerLoader(
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
    const config: LoaderConfig & { cacheDir: string } = this.getOptions();

    if (isDev && !globalServer) {
      globalServer = await startTranslationServer({
        startPort: 60000,
        onError: (err) => {
          logger.error("Translation server error:", err);
        },
        onReady: () => {
          logger.info("Translation server started");
        },
        config,
      });
    }

    callback(
      null,
      source
        .replace(
          "__SERVER_URL__",
          globalServer.getUrl() || "http://127.0.0.1:60000",
        )
        .replace("__CACHE_DIR__", config.cacheDir),
    );
  } catch (error) {
    logger.error(`Compiler failed for ${this.resourcePath}:`);
    logger.error("Details:", error);
    callback(error as Error);
  }
}
