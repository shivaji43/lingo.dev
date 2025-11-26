#!/usr/bin/env node
/**
 * Standalone script to start the translation server
 *
 * Usage:
 *   node start-server.js
 *   node start-server.js --port 3456
 *   node start-server.js --source-root ./app --lingo-dir .lingo
 */

import {
  startTranslationServer,
  TranslationServer,
} from "./translation-server";

import type { TranslatorConfig } from "../translate";
import { logger } from "../utils/logger";

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options: any = {
    port: 3456,
    sourceRoot: "./app",
    lingoDir: ".lingo",
    sourceLocale: "en",
    translatorType: "pseudo",
    models: undefined,
    prompt: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--port" && args[i + 1]) {
      options.port = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--source-root" && args[i + 1]) {
      options.sourceRoot = args[i + 1];
      i++;
    } else if (arg === "--lingo-dir" && args[i + 1]) {
      options.lingoDir = args[i + 1];
      i++;
    } else if (arg === "--source-locale" && args[i + 1]) {
      options.sourceLocale = args[i + 1];
      i++;
    } else if (arg === "--translator" && args[i + 1]) {
      options.translatorType = args[i + 1];
      i++;
    } else if (arg === "--models" && args[i + 1]) {
      options.models = args[i + 1];
      i++;
    } else if (arg === "--prompt" && args[i + 1]) {
      options.prompt = args[i + 1];
      i++;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`
Lingo.dev Translation Server

Usage:
  node start-server.js [options]

Options:
  --port <number>              Starting port (default: 3456)
  --source-root <path>         Source root directory (default: ./app)
  --lingo-dir <path>          Lingo directory (default: .lingo)
  --source-locale <locale>     Source locale (default: en)
  --translator <type>          Translator type: pseudo|lcp (default: pseudo)
  --models <config>            Models config for LCP (e.g., "lingo.dev" or JSON)
  --prompt <text>              Custom prompt for LCP translator
  --help, -h                   Show this help message

Examples:
  node start-server.js
  node start-server.js --port 3500
  node start-server.js --source-root ./src --lingo-dir .translations
  node start-server.js --translator lcp --models "lingo.dev"
  node start-server.js --translator lcp --models '{"en:es":"google:gemini-2.0-flash"}'
      `);
      process.exit(0);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  // Build translator config
  let translatorConfig: TranslatorConfig | undefined;

  if (options.translatorType === "pseudo") {
    translatorConfig = { type: "pseudo" };
  } else if (options.translatorType === "lcp") {
    // Parse models config
    let models: "lingo.dev" | Record<string, string> = "lingo.dev";
    if (options.models) {
      try {
        // Try parsing as JSON first
        models = JSON.parse(options.models);
      } catch {
        // If not JSON, treat as string
        models = options.models;
      }
    }

    translatorConfig = {
      type: "lcp",
      config: {
        models,
        sourceLocale: options.sourceLocale,
        prompt: options.prompt || null,
      },
    };
  }

  process.stdout.write("[lingo.dev] Starting translation server...\n");
  process.stdout.write(
    `[lingo.dev] Configuration: ${JSON.stringify({
      startPort: options.port,
      sourceRoot: options.sourceRoot,
      lingoDir: options.lingoDir,
      sourceLocale: options.sourceLocale,
      translator: translatorConfig,
    })}\n`,
  );

  let server: TranslationServer | null = null;

  try {
    server = await startTranslationServer({
      startPort: options.port,
      config: {
        sourceRoot: options.sourceRoot,
        lingoDir: options.lingoDir,
        sourceLocale: options.sourceLocale,
        translator: translatorConfig,
        allowProductionGeneration: true,
      },
      onReady: (port) => {
        process.stdout.write("[lingo.dev] Server ready!\n");
        process.stdout.write("[lingo.dev] Available endpoints:\n");
        process.stdout.write(
          `[lingo.dev]   - GET http://127.0.0.1:${port}/health\n`,
        );
        process.stdout.write(
          `[lingo.dev]   - GET http://127.0.0.1:${port}/translations/:locale\n`,
        );
        process.stdout.write(
          `[lingo.dev]   - GET http://127.0.0.1:${port}/translations/:locale/:hash\n`,
        );
        process.stdout.write("[lingo.dev]\n");
        process.stdout.write("[lingo.dev] Press Ctrl+C to stop\n");
      },
      onError: (error) => {
        process.stderr.write(`[lingo.dev] Server error: ${error.stack}\n`);
      },
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      process.stdout.write("\n[lingo.dev] Shutting down...\n");
      if (server) {
        await server.stop();
      }
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Run if this is the main module
// Auto-run when executed directly with node or tsx
main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
