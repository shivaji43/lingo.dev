export type {
  LoaderConfig,
  MetadataConfig,
  TranslationConfig,
  PathConfig,
  TranslationContext,
  TranslationEntry,
  MetadataSchema,
  ComponentType,
} from "./types";

export {
  loadMetadata,
  saveMetadata,
  upsertEntry,
  upsertEntries,
  getEntry,
  hasEntry,
  getMetadataPath,
} from "./metadata/manager";
