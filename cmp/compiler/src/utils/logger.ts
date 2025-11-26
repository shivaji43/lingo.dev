type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerConfig {
  enableDebug: boolean;
}

class Logger {
  private config: LoggerConfig = {
    enableDebug: process.env.LINGO_DEBUG === "true",
  };

  private readonly prefix = "\x1b[42m\x1b[30m[Lingo.dev]\x1b[0m";

  setDebug(enabled: boolean) {
    this.config.enableDebug = enabled;
  }

  debug(...args: any[]) {
    if (this.config.enableDebug) {
      console.log(this.prefix, ...args);
    }
  }

  info(...args: any[]) {
    console.log(this.prefix, ...args);
  }

  warn(...args: any[]) {
    console.warn(this.prefix, ...args);
  }

  error(...args: any[]) {
    console.error(this.prefix, ...args);
  }
}

export const logger = new Logger();
