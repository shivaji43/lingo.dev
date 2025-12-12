# @lingo.dev/compiler

Official Lingo.dev compiler with automatic translation support for React applications.

This package provides plugins for multiple bundlers (Vite, Webpack, Rollup, esbuild) and a Next.js loader that
automatically transforms React components to inject translation calls. It uses a hash-based metadata system to track
translatable text across your application.

## Features

- **Automatic JSX text transformation** - Automatically detects and transforms translatable text in JSX
- **Hash-based metadata** - Generates unique hashes for each translatable text based on content, component name, and
  file path
- **Opt-in or automatic** - Configure whether to require `'use i18n'` directive or transform all files
- **Multi-bundler support** - Works with Vite, Webpack, Rollup, esbuild, and Next.js
- **Built on unplugin** - Unified plugin API across all bundlers
- **Metadata tracking** - Maintains `.lingo/metadata.json` with all translatable content
- **Translation server** - On-demand translation generation during development
- **AI-powered translations** - Support for multiple LLM providers and Lingo.dev Engine

## Installation

```bash
npm install @lingo.dev/compiler
# or
pnpm add @lingo.dev/compiler
# or
yarn add @lingo.dev/compiler
```

## Quick Start

## Usage with Turbopack (Next.js 16+)

### 1. Configure Next.js

[//]: # ( TODO (AleksandrSl 12/12/2025):

### 2. (Optional) Use directive mode

If you set `useDirective: true`, add the directive to files you want to translate:

```tsx
"use i18n";

export function MyComponent() {
  return <div>This text will be translated</div>;
}
```

### 3. Write components normally

```tsx
// src/components/Welcome.tsx
export function Welcome() {
  return (
    <div>
      <h1>Welcome to our site</h1>
      <p>This text will be automatically translated</p>
    </div>
  );
}
```

### 4. Build and see transformations

After build, the code will be transformed to:

```tsx
import { useTranslation } from "@lingo.dev/runtime";

export function Welcome() {
  const t = useTranslation();
  return (
    <div>
      <h1>{t("a1b2c3d4e5f6")}</h1>
      <p>{t("f6e5d4c3b2a1")}</p>
    </div>
  );
}
```

## How It Works

[//]: # ( TODO (AleksandrSl 12/12/2025):

## Limitations (Current Version)

- Requires manual runtime setup (TranslationProvider, etc.)

## Supported Bundlers

| Bundler | Status          | Import Path                   |
| ------- | --------------- | ----------------------------- |
| Vite    | ✅ Full Support | `@lingo.dev/compiler/vite`    |
| Webpack | ✅ Full Support | `@lingo.dev/compiler/webpack` |
| Next.js | ✅ Full Support | `@lingo.dev/compiler/next`    |

All bundler plugins share the same configuration API.

## Contributing

This is a beta package under active development. Feedback and contributions are welcome!

## License

ISC
