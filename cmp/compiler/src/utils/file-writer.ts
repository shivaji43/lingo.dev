/**
 * Such weird separation of file writer from logger
 * is needed to avoid leaking node deps to the client build in next,
 * but still keep the main logger logic in one place.
 */
import { appendFile } from "fs/promises";
import { getLogger, type LogLevel } from "./logger";

/**
 * Create a file writer function for a specific log file
 */
export function createFileWriter(
  filePath: string,
  plainPrefix: string = "[Lingo.dev]",
) {
  let writeQueue: Promise<void> = Promise.resolve();

  return (level: LogLevel, message: string) => {
    writeQueue = writeQueue
      .then(async () => {
        try {
          const timestamp = new Date().toISOString();
          const logLine = `${timestamp} [${level.toUpperCase()}] ${plainPrefix} ${message}\n`;

          await Promise.race([
            appendFile(filePath, logLine, "utf-8"),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("File write timeout")), 1000),
            ),
          ]);
        } catch (error) {
          // Silently fail to avoid breaking the application
        }
      })
      .catch(() => {});
  };
}

/**
 * Configure a logger with file output
 */
export function configureFileLogger(
  logger: ReturnType<typeof getLogger>,
  filePath: string,
): void {
  const fileWriter = createFileWriter(filePath);
  logger.setFileWriter(fileWriter);
}
