import { appendFile } from "fs/promises";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerConfig {
  enableDebug: boolean;
  logFilePath?: string;
}

class Logger {
  private config: LoggerConfig = {
    // Safe check that works in both Node.js and browser environments
    enableDebug:
      typeof process !== "undefined" && process.env?.LINGO_DEBUG === "true",
  };
  private readonly plainPrefix = "[Lingo.dev]";
  private writeQueue: Promise<void> = Promise.resolve();

  setDebug(enabled: boolean) {
    this.config.enableDebug = enabled;
  }

  /**
   * Enable file logging to the specified path
   * Logs will be appended to this file in addition to console output
   */
  setLogFile(filePath: string) {
    this.config.logFilePath = filePath;
  }

  /**
   * Write to file asynchronously without blocking
   * Uses a queue to ensure writes happen in order but don't block the caller
   */
  private writeToFile(level: LogLevel, ...args: any[]) {
    if (!this.config.logFilePath) return;

    // Queue the write operation but don't await it (fire and forget)
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          const timestamp = new Date().toISOString();
          const message = args
            .map((arg) =>
              typeof arg === "object"
                ? JSON.stringify(arg, null, 2)
                : String(arg),
            )
            .join(" ");
          const logLine = `${timestamp} [${level.toUpperCase()}] ${this.plainPrefix} ${message}\n`;

          // Async file write with timeout protection
          await Promise.race([
            appendFile(this.config.logFilePath!, logLine, "utf-8"),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("File write timeout")), 1000),
            ),
          ]);
        } catch (error) {
          // Silently fail to avoid breaking the application
          // Only log to console, don't try to write to file again
          if (this.config.enableDebug) {
            console.error("Failed to write to log file:", error);
          }
        }
      })
      .catch(() => {
        // Catch any queue errors to prevent unhandled promise rejections
      });
  }

  debug(...args: any[]) {
    if (this.config.enableDebug) {
      this.writeToFile("debug", ...args);
    }
  }

  info(...args: any[]) {
    this.writeToFile("info", ...args);
  }

  warn(...args: any[]) {
    this.writeToFile("warn", ...args);
  }

  error(...args: any[]) {
    this.writeToFile("error", ...args);
  }
}

export const logger = new Logger();
logger.setDebug(true);
