export type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerConfig {
  enableDebug: boolean;
  enableConsole?: boolean;
  writeToFile?: (level: LogLevel, message: string) => void;
}

class Logger {
  private config: LoggerConfig;
  private readonly prefix = "\x1b[42m\x1b[30m[Lingo.dev]\x1b[0m";

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      enableDebug:
        config.enableDebug ??
        (typeof process !== "undefined" && process.env?.LINGO_DEBUG === "true"),
      enableConsole: config.enableConsole ?? true,
      writeToFile: config.writeToFile,
    };
  }

  setDebug(enabled: boolean) {
    this.config.enableDebug = enabled;
  }

  setConsoleEnabled(enabled: boolean) {
    this.config.enableConsole = enabled;
  }

  /**
   * Set a custom file writer function
   * This allows server-side code to inject file writing without importing fs
   */
  setFileWriter(writer: (level: LogLevel, message: string) => void) {
    this.config.writeToFile = writer;
  }

  private formatMessage(...args: any[]): string {
    return args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg),
      )
      .join(" ");
  }

  private log(level: LogLevel, ...args: any[]) {
    const message = this.formatMessage(...args);

    // Console output
    if (this.config.enableConsole) {
      const consoleMethod =
        level === "debug" || level === "info" ? console.log : console[level];
      consoleMethod(this.prefix, message);
    }

    // File output (if configured)
    if (this.config.writeToFile) {
      this.config.writeToFile(level, message);
    }
  }

  debug(...args: any[]) {
    if (this.config.enableDebug) {
      this.log("debug", ...args);
    }
  }

  info(...args: any[]) {
    this.log("info", ...args);
  }

  warn(...args: any[]) {
    this.log("warn", ...args);
  }

  error(...args: any[]) {
    this.log("error", ...args);
  }
}

class LoggerRegistry {
  private loggers = new Map<string, Logger>();
  private readonly defaultLogger: Logger;

  constructor() {
    this.defaultLogger = new Logger({
      enableConsole: true,
    });
  }

  /**
   * Get a logger by key, or return the default logger if not found
   */
  get(key?: string): Logger {
    if (!key) return this.defaultLogger;
    return this.loggers.get(key) ?? this.defaultLogger;
  }

  /**
   * Create or update a named logger with specific configuration
   */
  create(key: string, config: Partial<LoggerConfig>): Logger {
    const logger = new Logger(config);
    this.loggers.set(key, logger);
    return logger;
  }

  /**
   * Remove a logger from the registry
   */
  remove(key: string): void {
    this.loggers.delete(key);
  }

  /**
   * Check if a logger exists
   */
  has(key: string): boolean {
    return this.loggers.has(key);
  }
}

export const loggerRegistry = new LoggerRegistry();

export function getLogger(key?: string): Logger {
  return loggerRegistry.get(key);
}

export const logger = loggerRegistry.get();
