# Translation Architecture

## Overview

This document describes the refactored translation architecture that provides clear separation of concerns between metadata management, translation execution, and caching.

## Architectural Principles

1. **Metadata file structure** is only known by:
   - Metadata Manager (reads/writes metadata.json)
   - Translation Service (orchestrator that coordinates everything)

2. **Translators are stateless** and work with abstract `TranslatableEntry` types
   - No knowledge of metadata file structure
   - No built-in caching
   - Easy to test in isolation

3. **Caching is handled at the service layer**
   - Translation Service owns cache strategy
   - Cache implementations can be swapped (local disk, remote, memory, etc.)
   - Translators remain pure and simple

4. **Partial failures are handled gracefully**
   - Service returns both successful translations and errors
   - Can continue with cached translations if new translations fail
   - Errors include context for debugging

## Component Diagram

```
┌─────────────────────────────────────────────────┐
│ AST Transformer                                  │
│  - Extracts text from JSX                       │
│  - Knows ComponentType, context                 │
└────────────────┬────────────────────────────────┘
                 │ writes
                 ↓
┌─────────────────────────────────────────────────┐
│ MetadataManager                                  │
│  - ONLY component that reads/writes metadata.json│
│  - Provides metadata loading/saving              │
│  - Returns TranslationEntry[]                   │
└────────────────┬────────────────────────────────┘
                 │ reads from
                 ↓
┌─────────────────────────────────────────────────┐
│ TranslationService (orchestrator)                │
│  - Coordinates translation workflow              │
│  - Handles cache strategy                        │
│  - Determines what needs translation             │
│  - Manages partial failures                      │
│  - Returns TranslationResult with errors         │
└───┬─────────────────────┬──────────────────────┘
    │                     │
    │ uses               │ uses
    ↓                     ↓
┌──────────────┐   ┌────────────────────┐
│ Cache        │   │ Translator         │
│  - get()     │   │  - translate()     │
│  - set()     │   │  - batchTranslate()│
│  - update()  │   │  - Pseudo, LCP, etc│
│  - Local/    │   │  - Stateless       │
│    Remote    │   │  - No file I/O     │
└──────────────┘   └────────────────────┘
```

## Core Components

### 1. TranslationCache Interface

**Location:** `compiler/src/translate/cache.ts`

Abstract interface for cache implementations:

```typescript
interface TranslationCache {
  get(locale: string): Promise<Record<string, string>>;
  update(locale: string, translations: Record<string, string>): Promise<void>;
  set(locale: string, translations: Record<string, string>): Promise<void>;
  has(locale: string): Promise<boolean>;
  clear(locale: string): Promise<void>;
  clearAll(): Promise<void>;
}
```

**Key principle:** Cache stores simple `hash -> translation` mappings. It doesn't need to know about metadata context.

### 2. LocalTranslationCache

**Location:** `compiler/src/translate/local-cache.ts`

Disk-based cache implementation that stores translations in `.lingo/cache/{locale}.json`:

```typescript
const cache = new LocalTranslationCache({
  cacheDir: ".lingo",
  sourceRoot: ".",
});
```

**Future:** Can easily add `RemoteTranslationCache`, `MemoryTranslationCache`, etc.

### 3. TranslationService

**Location:** `compiler/src/translate/translation-service.ts`

Main orchestrator that coordinates the translation workflow:

```typescript
const service = new TranslationService(translator, cache, {
  sourceLocale: "en",
  useCache: true,
});

const result = await service.translate(locale, metadata, requestedHashes);
// Returns: { translations, errors, stats }
```

**Responsibilities:**

- Load metadata from MetadataManager
- Check cache for existing translations
- Determine what needs translation (missing hashes)
- Call translator for missing translations only
- Handle partial failures gracefully
- Update cache with new translations
- Return results with errors for debugging

**Result format:**

```typescript
interface TranslationResult {
  translations: Record<string, string>; // hash -> translated text
  errors: TranslationError[]; // Any failures that occurred
  stats: {
    total: number; // Total hashes requested
    cached: number; // How many came from cache
    translated: number; // How many were newly translated
    failed: number; // How many failed
  };
}
```

### 4. Translator Interface (unchanged)

**Location:** `compiler/src/translate/api.ts`

```typescript
interface Translator<Config> {
  translate(locale: string, entry: TranslatableEntry): Promise<string>;
  batchTranslate(
    locale: string,
    entriesMap: Record<string, TranslatableEntry>,
  ): Promise<Record<string, string>>;
}

type TranslatableEntry = {
  text: string;
  context: Record<string, any>;
};
```

**Key principle:** Translators are stateless and only know about abstract entries. No file I/O, no caching logic.

## Migration Guide

### Old Approach (deprecated)

```typescript
// ❌ Old: Wrapping translator with caching
const translator = createCachedTranslatorFromConfig(config.translator, {
  cacheDir: ".lingo",
  useCache: true,
});
```

### New Approach

```typescript
// ✅ New: Service handles caching
const translator = createTranslator(config.translator);
const cache = new LocalTranslationCache({ cacheDir: ".lingo" });
const service = new TranslationService(translator, cache, {
  sourceLocale: "en",
  useCache: true,
});

const result = await service.translate(locale, metadata);
```

## Benefits of New Architecture

1. **Clear Separation of Concerns**
   - Metadata knows file structure
   - Translators know translation logic
   - Cache knows storage
   - Service coordinates everything

2. **Easier Testing**
   - Can mock cache separately from translator
   - Can test translators without file system
   - Can test service with mock dependencies

3. **Better Error Handling**
   - Partial failures don't break everything
   - Errors include context for debugging
   - Can continue with cached translations

4. **Flexible Caching**
   - Easy to add remote cache
   - Easy to add memory cache for tests
   - Easy to implement different cache strategies

5. **Type Safety**
   - Clear interfaces for each layer
   - Compiler catches misuse
   - Self-documenting code

## Files Changed

### New Files

- `compiler/src/translate/cache.ts` - Cache interface
- `compiler/src/translate/local-cache.ts` - Local disk cache implementation
- `compiler/src/translate/translation-service.ts` - Orchestrator service

### Modified Files

- `compiler/src/plugin/shared-middleware.ts` - Simplified to use service (345 → 224 lines)
- `compiler/src/translate/translator-factory.ts` - Removed caching wrapper
- `compiler/src/translate/index.ts` - Updated exports
- `compiler/src/types.ts` - Added `useCache` to config types

### Deprecated Files (kept for backward compatibility)

- `compiler/src/translate/cached-translator.ts` - Use TranslationService instead
- `compiler/src/translate/cache-server.ts` - Use LocalTranslationCache instead

## Future Enhancements

### Remote Cache Implementation

```typescript
class RemoteTranslationCache implements TranslationCache {
  constructor(private apiUrl: string) {}

  async get(locale: string) {
    const response = await fetch(`${this.apiUrl}/cache/${locale}`);
    return response.json();
  }

  // ... other methods
}
```

### Metrics & Observability

The service already provides stats - easy to add metrics:

```typescript
const result = await service.translate(locale, metadata);
metrics.recordCacheHitRate(result.stats.cached / result.stats.total);
metrics.recordTranslationErrors(result.errors.length);
```

### Cache Warming

```typescript
async function warmCache(locales: string[]) {
  const metadata = await loadMetadata(config);
  const service = createTranslationService(config);

  for (const locale of locales) {
    await service.translate(locale, metadata);
  }
}
```

## Questions & Answers

**Q: Why not cache inside translators?**
A: Caching is an infrastructure concern, not a translation concern. Different deployments might need different cache strategies (local dev vs production, single server vs distributed).

**Q: What if I need context in the cache?**
A: The service already has access to metadata context. If you need it in the cache, extend the cache interface to store `TranslationEntry` instead of just strings.

**Q: Can I still use the old cached translator?**
A: Yes, it's deprecated but kept for backward compatibility. However, it won't receive new features and will be removed in a future major version.

**Q: How do I add a new translator?**
A: Implement the `Translator` interface, add a case to `translator-factory.ts`, and you're done. No need to worry about caching.

**Q: What happens if translation fails?**
A: The service returns partial results with errors. The cached translations are still returned, and errors include details for debugging.

---

**Last Updated:** November 2025
**Version:** 0.1.0 (Beta)
