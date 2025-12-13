import fsPromises from "fs/promises";
import fs from "fs";
import path from "path";
import lockfile from "proper-lockfile";
import type { MetadataSchema, PathConfig, TranslationEntry } from "../types";
import { DEFAULT_TIMEOUTS, withTimeout } from "../utils/timeout";
import { getLingoDir } from "../utils/path-helpers";
import { logger } from "../utils/logger";

export function createEmptyMetadata(): MetadataSchema {
  return {
    version: "0.1",
    entries: {},
    stats: {
      totalEntries: 0,
      lastUpdated: new Date().toISOString(),
    },
  };
}

export function loadMetadata(path: string) {
  return new MetadataManager(path).loadMetadata();
}

export function cleanupExistingMetadata(metadataFilePath: string) {
  // General cleanup. Delete metadata and stop the server if any was started.
  logger.debug(`Attempting to cleanup metadata file: ${metadataFilePath}`);

  try {
    fs.unlinkSync(metadataFilePath);
    logger.info(`🧹 Cleaned up build metadata file: ${metadataFilePath}`);
  } catch (error: any) {
    // Ignore if file doesn't exist
    if (error.code === "ENOENT") {
      logger.debug(
        `Metadata file already deleted or doesn't exist: ${metadataFilePath}`,
      );
    } else {
      logger.warn(`Failed to cleanup metadata file: ${error.message}`);
    }
  }
}

/**
 * Get the absolute path to the metadata file
 *
 * @param config - Config with sourceRoot, lingoDir, and environment
 * @returns Absolute path to metadata file
 */
export function getMetadataPath(config: PathConfig): string {
  const filename =
    // Similar to next keeping dev build separate, let's keep the build metadata clean of any dev mode additions
    config.environment === "development"
      ? "metadata-dev.json"
      : "metadata-build.json";
  return path.join(getLingoDir(config), filename);
}

export class MetadataManager {
  constructor(private readonly filePath: string) {}

  /**
   * Load metadata from disk
   * Creates empty metadata if file doesn't exist
   * Times out after 15 seconds to prevent indefinite hangs
   */
  async loadMetadata(): Promise<MetadataSchema> {
    try {
      const content = await withTimeout(
        fsPromises.readFile(this.filePath, "utf-8"),
        DEFAULT_TIMEOUTS.METADATA,
        "Load metadata",
      );
      return JSON.parse(content) as MetadataSchema;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // File doesn't exist, create new metadata
        return createEmptyMetadata();
      }
      throw error;
    }
  }

  /**
   * Save metadata to disk
   * Times out after 15 seconds to prevent indefinite hangs
   */
  private async saveMetadata(metadata: MetadataSchema): Promise<void> {
    await withTimeout(
      fsPromises.mkdir(path.dirname(this.filePath), { recursive: true }),
      DEFAULT_TIMEOUTS.FILE_IO,
      "Create metadata directory",
    );

    metadata.stats = {
      totalEntries: Object.keys(metadata.entries).length,
      lastUpdated: new Date().toISOString(),
    };

    await withTimeout(
      fsPromises.writeFile(
        this.filePath,
        JSON.stringify(metadata, null, 2),
        "utf-8",
      ),
      DEFAULT_TIMEOUTS.METADATA,
      "Save metadata",
    );
  }

  /**
   * Thread-safe save operation that atomically updates metadata with new entries
   * Uses file locking to prevent concurrent write corruption
   *
   * @param entries - Translation entries to add/update
   * @returns The updated metadata schema
   */
  async saveMetadataWithEntries(
    entries: TranslationEntry[],
  ): Promise<MetadataSchema> {
    const lockDir = path.dirname(this.filePath);

    // Ensure directory exists before locking
    await fsPromises.mkdir(lockDir, { recursive: true });

    // Create lock file if it doesn't exist (lockfile needs a file to lock)
    try {
      await fsPromises.access(this.filePath);
    } catch {
      // TODO (AleksandrSl 10/12/2025): Should I use another file as a lock?
      await fsPromises.writeFile(
        this.filePath,
        JSON.stringify(createEmptyMetadata(), null, 2),
        "utf-8",
      );
    }

    // Acquire lock with retry options
    const release = await lockfile.lock(this.filePath, {
      retries: {
        retries: 10,
        minTimeout: 50,
        maxTimeout: 1000,
      },
      stale: 2000, // Consider lock stale after 5 seconds
    });

    try {
      // Re-load metadata inside lock to get latest state
      const currentMetadata = await this.loadMetadata();
      for (const entry of entries) {
        currentMetadata.entries[entry.hash] = entry;
      }
      await this.saveMetadata(currentMetadata);
      return currentMetadata;
    } finally {
      await release();
    }
  }

  /**
   * Get an entry by hash
   */
  getEntry(
    metadata: MetadataSchema,
    hash: string,
  ): TranslationEntry | undefined {
    return metadata.entries[hash];
  }

  /**
   * Check if an entry exists
   */
  hasEntry(metadata: MetadataSchema, hash: string): boolean {
    return hash in metadata.entries;
  }
}
