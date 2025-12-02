import fs from "fs/promises";
import path from "path";
import lockfile from "proper-lockfile";
import type {
  MetadataConfig,
  MetadataSchema,
  TranslationEntry,
} from "../types";
import { getMetadataPath as getMetadataPathUtil } from "../utils/path-helpers";

/**
 * Default metadata schema
 */
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

// TODO (AleksandrSl 24/11/2025): Probably remove and use path util as is
/**
 * Get the path to the metadata file
 */
export function getMetadataPath(config: MetadataConfig): string {
  return getMetadataPathUtil(config);
}

/**
 * Load metadata from disk
 * Creates empty metadata if file doesn't exist
 */
export async function loadMetadata(
  config: MetadataConfig,
): Promise<MetadataSchema> {
  const metadataPath = getMetadataPath(config);

  try {
    const content = await fs.readFile(metadataPath, "utf-8");
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
 */
export async function saveMetadata(
  config: MetadataConfig,
  metadata: MetadataSchema,
): Promise<void> {
  const metadataPath = getMetadataPath(config);
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });

  metadata.stats = {
    totalEntries: Object.keys(metadata.entries).length,
    lastUpdated: new Date().toISOString(),
  };

  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
}

/**
 * Thread-safe save operation that atomically updates metadata with new entries
 * Uses file locking to prevent concurrent write corruption
 *
 * @param config - Metadata configuration
 * @param entries - Translation entries to add/update
 * @returns The updated metadata schema
 */
export async function saveMetadataWithEntries(
  config: MetadataConfig,
  entries: TranslationEntry[],
): Promise<MetadataSchema> {
  const metadataPath = getMetadataPath(config);
  const lockDir = path.dirname(metadataPath);

  // Ensure directory exists before locking
  await fs.mkdir(lockDir, { recursive: true });

  // Create lock file if it doesn't exist (lockfile needs a file to lock)
  try {
    await fs.access(metadataPath);
  } catch {
    await fs.writeFile(
      metadataPath,
      JSON.stringify(createEmptyMetadata(), null, 2),
      "utf-8",
    );
  }

  // Acquire lock with retry options
  const release = await lockfile.lock(metadataPath, {
    retries: {
      retries: 10,
      minTimeout: 50,
      maxTimeout: 1000,
    },
    stale: 2000, // Consider lock stale after 5 seconds
  });

  try {
    // Re-load metadata inside lock to get latest state
    const currentMetadata = await loadMetadata(config);

    // Apply updates
    const updatedMetadata = upsertEntries(currentMetadata, entries);

    // Save
    await saveMetadata(config, updatedMetadata);

    return updatedMetadata;
  } finally {
    // Always release lock
    await release();
  }
}

/**
 * Add or update a translation entry in metadata
 */
export function upsertEntry(
  metadata: MetadataSchema,
  entry: TranslationEntry,
): MetadataSchema {
  const existing = metadata.entries[entry.hash];

  if (existing) {
    metadata.entries[entry.hash] = {
      ...existing,
      lastSeenAt: new Date().toISOString(),
    };
  } else {
    metadata.entries[entry.hash] = entry;
  }

  return metadata;
}

/**
 * Batch add multiple entries
 */
export function upsertEntries(
  metadata: MetadataSchema,
  entries: TranslationEntry[],
): MetadataSchema {
  let result = metadata;
  for (const entry of entries) {
    result = upsertEntry(result, entry);
  }
  return result;
}

/**
 * Get an entry by hash
 */
export function getEntry(
  metadata: MetadataSchema,
  hash: string,
): TranslationEntry | undefined {
  return metadata.entries[hash];
}

/**
 * Check if an entry exists
 */
export function hasEntry(metadata: MetadataSchema, hash: string): boolean {
  return hash in metadata.entries;
}

/**
 * Remove stale entries (entries not seen in a while)
 * This is useful for cleanup but should be done carefully
 */
export function removeStaleEntries(
  metadata: MetadataSchema,
  maxAgeMs: number = 30 * 24 * 60 * 60 * 1000, // 30 days default
): MetadataSchema {
  const now = Date.now();
  const filtered: Record<string, TranslationEntry> = {};

  for (const [hash, entry] of Object.entries(metadata.entries)) {
    const lastSeen = entry.lastSeenAt || entry.addedAt;
    const age = now - new Date(lastSeen).getTime();

    if (age < maxAgeMs) {
      filtered[hash] = entry;
    }
  }

  return {
    ...metadata,
    entries: filtered,
  };
}
