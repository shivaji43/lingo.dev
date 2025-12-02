/**
 * Simple HTTP server for serving translations during development
 *
 * This server:
 * - Finds a free port automatically
 * - Serves translations via:
 *   - GET /translations/:locale - Full dictionary (cached)
 *   - GET /translations/:locale/:hash - Single hash translation
 *   - POST /translations/:locale (body: { hashes: string[] }) - Batch translation
 * - Uses the same translation logic as middleware
 * - Can be started/stopped programmatically
 */

import http from "http";
import { URL } from "url";
import type { TranslationMiddlewareConfig } from "../types";
import { logger } from "../utils/logger";
import {
  createTranslator,
  LocalTranslationCache,
  TranslationService,
} from "../translators";
import { loadMetadata, createEmptyMetadata } from "../metadata/manager";
import type { MetadataSchema } from "../types";

export interface TranslationServerOptions {
  /**
   * Starting port to try (will find next available if taken)
   * @default 3456
   */
  startPort?: number;

  /**
   * Configuration for translation generation
   */
  config: TranslationMiddlewareConfig;

  /**
   * Callback when server is ready
   */
  onReady?: (port: number) => void;

  /**
   * Callback on error
   */
  onError?: (error: Error) => void;
}

export class TranslationServer {
  private server: http.Server | null = null;
  private url: string | undefined = undefined;
  private config: TranslationMiddlewareConfig;
  private startPort: number;
  private onReadyCallback?: (port: number) => void;
  private onErrorCallback?: (error: Error) => void;
  private translationService: TranslationService | null = null;
  private metadata: MetadataSchema | null = null;

  constructor(options: TranslationServerOptions) {
    this.config = options.config;
    this.startPort = options.startPort || 60000;
    this.onReadyCallback = options.onReady;
    this.onErrorCallback = options.onError;
  }

  /**
   * Start the server and find an available port
   */
  async start(): Promise<number> {
    if (this.server) {
      throw new Error("Server is already running");
    }

    console.log(`\x1b[36m[Lingo]\x1b[0m 🔧 Initializing translator...`);

    const translator = createTranslator(this.config);
    const isPseudo = translator.constructor.name === "PseudoTranslator";

    const cache = new LocalTranslationCache({
      cacheDir: this.config.lingoDir,
      sourceRoot: this.config.sourceRoot,
    });

    this.translationService = new TranslationService(translator, cache, {
      sourceLocale: this.config.sourceLocale,
      useCache: this.config.useCache,
      isPseudo,
    });

    try {
      this.metadata = await loadMetadata(this.config);
      console.log(
        `\x1b[36m[Lingo]\x1b[0m ✅ Loaded ${Object.keys(this.metadata.entries).length} translation entries`,
      );
    } catch (error) {
      console.warn(
        `\x1b[33m[Lingo]\x1b[0m ⚠️  No metadata found, will be created on first translation`,
      );
      this.metadata = createEmptyMetadata();
    }

    const port = await this.findAvailablePort(this.startPort);

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // Log that we received a request (before async handling)
        console.log(
          `\x1b[36m[Lingo]\x1b[0m 📥 Received: ${req.method} ${req.url}`,
        );

        // Wrap async handler and catch errors explicitly
        this.handleRequest(req, res).catch((error) => {
          console.error(
            `\x1b[41m\x1b[37m[Lingo.dev]\x1b[0m Request handler error:`,
            error,
          );
          console.error(error.stack);

          // Send error response if headers not sent
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
          }
        });
      });

      console.debug(
        `\x1b[42m\x1b[30m[Lingo.dev]\x1b[0m Starting translation server on port ${port}`,
      );

      this.server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          // Port is in use, try next one
          reject(new Error(`Port ${port} is already in use`));
        } else {
          process.stderr.write(
            `\x1b[42m\x1b[30m[Lingo.dev]\x1b[0m Translation server error: ${error.message}\n`,
          );
          this.onErrorCallback?.(error);
          reject(error);
        }
      });

      this.server.listen(port, "127.0.0.1", () => {
        this.url = `http://127.0.0.1:${port}`;
        console.log(
          `\x1b[42m\x1b[30m[Lingo.dev]\x1b[0m ✅ Translation server listening on http://127.0.0.1:${port}`,
        );
        logger.info(`Translation server listening on http://127.0.0.1:${port}`);
        this.onReadyCallback?.(port);
        resolve(port);
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      logger.debug("Translation server is not running. Nothing to stop.");
      return;
    }

    return new Promise((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          reject(error);
        } else {
          logger.info(`Translation server stopped`);
          this.server = null;
          this.url = undefined;
          resolve();
        }
      });
    });
  }

  /**
   * Get the current port (null if not running)
   */
  getUrl(): string | undefined {
    return this.url;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null && this.url !== null;
  }

  /**
   * Directly translate hashes without going through HTTP
   * Useful for build-time translation generation
   */
  async translateHashes(
    locale: string,
    hashes: string[],
  ): Promise<{
    translations: Record<string, string>;
    errors: Array<{ hash: string; error: string }>;
  }> {
    if (!this.translationService || !this.metadata) {
      throw new Error("Translation server not initialized");
    }

    return await this.translationService.translate(
      locale,
      this.metadata,
      hashes,
    );
  }

  /**
   * Find an available port starting from the given port
   */
  private async findAvailablePort(
    startPort: number,
    maxAttempts = 100,
  ): Promise<number> {
    for (let port = startPort; port < startPort + maxAttempts; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error(
      `Could not find available port in range ${startPort}-${startPort + maxAttempts}`,
    );
  }

  /**
   * Check if a port is available
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const testServer = http.createServer();

      testServer.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          resolve(false);
        } else {
          resolve(false);
        }
      });

      testServer.once("listening", () => {
        testServer.close(() => {
          resolve(true);
        });
      });

      testServer.listen(port, "127.0.0.1");
    });
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    console.log(
      `\x1b[33m[Lingo]\x1b[0m 🔄 Processing: ${req.method} ${req.url}`,
    );

    try {
      const url = new URL(req.url || "", `http://${req.headers.host}`);

      // Log request
      logger.debug(`${req.method} ${url.pathname}`);

      // Handle CORS for browser requests
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Type, Cache-Control",
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check endpoint
      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", port: this.url }));
        return;
      }

      // Batch translation endpoint: POST /translations/:locale
      const postMatch = url.pathname.match(/^\/translations\/([^/]+)$/);
      if (postMatch && req.method === "POST") {
        const [, locale] = postMatch;
        await this.handleBatchTranslationRequest(locale, req, res);
        return;
      }

      // Translation dictionary endpoint: GET /translations/:locale
      const dictMatch = url.pathname.match(/^\/translations\/([^/]+)$/);
      if (dictMatch && req.method === "GET") {
        const [, locale] = dictMatch;
        await this.handleDictionaryRequest(locale, res);
        return;
      }

      // 404 for unknown routes
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Not Found",
          message: "Unknown endpoint",
          availableEndpoints: [
            "GET /health",
            "GET /translations/:locale",
            "GET /translations/:locale/:hash",
            "POST /translations/:locale (with body: { hashes: string[] })",
          ],
        }),
      );
    } catch (error) {
      logger.error("Error handling request:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }

  /**
   * Handle batch translation request
   */
  private async handleBatchTranslationRequest(
    locale: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    try {
      // Read request body
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
      }

      // Parse body
      const { hashes } = JSON.parse(body);

      if (!Array.isArray(hashes)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Bad Request",
            message: "Body must contain 'hashes' array",
          }),
        );
        return;
      }

      if (!this.translationService || !this.metadata) {
        throw new Error("Translation service not initialized");
      }

      console.log(
        `\x1b[36m[Lingo]\x1b[0m 🔄 Translating ${hashes.length} hashes to ${locale}`,
      );
      console.log(`\x1b[36m[Lingo]\x1b[0m 🔄 Hashes: ${hashes.join(", ")}`);

      // Translate using the stored service
      const result = await this.translationService.translate(
        locale,
        this.metadata,
        hashes,
      );

      // Return successful response
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      });
      res.end(
        JSON.stringify({
          locale,
          translations: result.translations,
          errors: result.errors,
        }),
      );
    } catch (error) {
      logger.error(`Error getting batch translations for ${locale}:`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Translation generation failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }

  /**
   * Handle request for full translation dictionary
   */
  private async handleDictionaryRequest(
    locale: string,
    res: http.ServerResponse,
  ): Promise<void> {
    try {
      if (!this.translationService || !this.metadata) {
        throw new Error("Translation service not initialized");
      }

      console.log(
        `\x1b[36m[Lingo]\x1b[0m 🌐 Requesting full dictionary for ${locale}`,
      );

      const allHashes = Object.keys(this.metadata.entries);

      // Translate all hashes
      const result = await this.translationService.translate(
        locale,
        this.metadata,
        allHashes,
      );

      // Return successful response
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      });
      res.end(
        JSON.stringify({
          locale,
          translations: result.translations,
          errors: result.errors,
        }),
      );
    } catch (error) {
      logger.error(`Error getting dictionary for ${locale}:`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Translation generation failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }
}

/**
 * Create and start a translation server
 */
export async function startTranslationServer(
  options: TranslationServerOptions,
): Promise<TranslationServer> {
  const server = new TranslationServer(options);
  await server.start();
  return server;
}
