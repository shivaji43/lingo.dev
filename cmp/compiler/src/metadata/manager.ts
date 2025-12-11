import fs from "fs/promises";
import path from "path";
import lockfile from "proper-lockfile";
import type { MetadataSchema, TranslationEntry } from "../types";
import { DEFAULT_TIMEOUTS, withTimeout } from "../utils/timeout";

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
        fs.readFile(this.filePath, "utf-8"),
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
      fs.mkdir(path.dirname(this.filePath), { recursive: true }),
      DEFAULT_TIMEOUTS.FILE_IO,
      "Create metadata directory",
    );

    metadata.stats = {
      totalEntries: Object.keys(metadata.entries).length,
      lastUpdated: new Date().toISOString(),
    };

    await withTimeout(
      fs.writeFile(this.filePath, JSON.stringify(metadata, null, 2), "utf-8"),
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
    await fs.mkdir(lockDir, { recursive: true });

    // Create lock file if it doesn't exist (lockfile needs a file to lock)
    try {
      await fs.access(this.filePath);
    } catch {
      // TODO (AleksandrSl 10/12/2025): Should I use another file as a lock?
      await fs.writeFile(
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
