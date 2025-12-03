import type { LoaderConfig } from "../types";
import { logger } from "../utils/logger";
import { startOrGetTranslationServer } from "../translation-server/translation-server";

let serverPromise: ReturnType<typeof startOrGetTranslationServer> | null = null;

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
    serverPromise = startOrGetTranslationServer({
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

  const server = await serverPromise;

  callback(
    null,
    source
      .replace("__SERVER_URL__", server?.url || "http://127.0.0.1:60000")
      .replace("__CACHE_DIR__", config.cacheDir),
  );
}
