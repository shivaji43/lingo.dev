import type { LingoConfig } from "../types";
import { logger } from "../utils/logger";
import { DEFAULT_TIMEOUTS, withTimeout } from "../utils/timeout";
import { startOrGetTranslationServer } from "../translation-server/translation-server";
import { getCacheDir } from "../utils/path-helpers";

let serverPromise: ReturnType<typeof startOrGetTranslationServer> | null = null;

export default async function devServerLoader(
  this: any,
  source: string,
): Promise<void> {
  // Ensure we're running in loader context
  if (typeof this.async !== "function") {
    throw new Error("This module must be run as a loader");
  }
  logger.debug("devServerLoader called", this.resourcePath);
  const callback = this.async();
  const isDev = process.env.NODE_ENV === "development";

  const config: LingoConfig = this.getOptions();
  const startPort = config.dev.serverStartPort;

  if (isDev && !serverPromise) {
    serverPromise = startOrGetTranslationServer({
      startPort,
      onError: (err) => {
        logger.error("Translation server error:", err);
      },
      onReady: () => {
        logger.info("Translation server started");
      },
      config,
    });
  }

  // Wait for server with timeout to prevent compilation from hanging
  const server = await withTimeout(
    serverPromise!,
    DEFAULT_TIMEOUTS.SERVER_START,
    "Translation server startup",
  );

  callback(
    null,
    source
      // TODO (AleksandrSl 04/12/2025): Should we just error instead of the default?
      .replace("__SERVER_URL__", server?.url || `http://127.0.0.1:${startPort}`)
      // TODO (AleksandrSl 04/12/2025): Make cacheDir work
      .replace("__CACHE_DIR__", getCacheDir(config)),
  );
}
