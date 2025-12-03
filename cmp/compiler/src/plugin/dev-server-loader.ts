import type { LoaderConfig } from "../types";
import { logger } from "../utils/logger";
import { withTimeout, DEFAULT_TIMEOUTS } from "../utils/timeout";
import { startOrGetTranslationServerHono } from "../translation-server/translation-server-hono";

let serverPromise: ReturnType<typeof startOrGetTranslationServerHono> | null =
  null;

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

  const config: LoaderConfig & { cacheDir: string } = this.getOptions();

  if (isDev && !serverPromise) {
    serverPromise = startOrGetTranslationServerHono({
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

  // Wait for server with timeout to prevent compilation from hanging
  const server = await withTimeout(
    serverPromise!,
    DEFAULT_TIMEOUTS.SERVER_START,
    "Translation server startup",
  );

  callback(
    null,
    source
      .replace("__SERVER_URL__", server?.url || "http://127.0.0.1:60000")
      .replace("__CACHE_DIR__", config.cacheDir)
      .replace("__SOURCE_LOCALE__", config.sourceLocale),
  );
}
