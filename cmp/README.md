# Lingo.dev compiler

## Getting started

Install the package - `pnpm install @lingo.dev/compile`

### Vite

- Configure the plugin in your vite config.

  ```ts
  import { defineConfig } from "vite";
  import { lingoCompilerPlugin } from "@lingo.dev/compiler/vite";

  export default defineConfig({
    plugins: [
      lingoCompilerPlugin({
        sourceRoot: "src",
        sourceLocale: "en",
        targetLocales: ["es", "de", "fr"],
        models: "lingo.dev",
        dev: {
          usePseudotranslator: true,
        },
      }), // ...other plugins
    ],
  });
  ```

- Wrap your app with `LingoProvider`. It should be used as early as possible in your app.
  e.g. in vite example with tanstack-router `LingoProvider` should be above `RouterProvider`, otherwise code-splitting breaks contexts.
  ```tsx
  // Imports and other tanstack router setup
  if (rootElement && !rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <StrictMode>
        <LingoProvider>
          <RouterProvider router={router} />
        </LingoProvider>
      </StrictMode>,
    );
  }
  ```

See `demo/vite-react-spa` for the working example

### Next.js

- Use `withLingo` function to wrap your existing next config. You will have to make your config async.

  ```ts
  import type { NextConfig } from "next";
  import { withLingo } from "@lingo.dev/compiler/next";

  const nextConfig: NextConfig = {};

  export default async function (): Promise<NextConfig> {
    return await withLingo(nextConfig, {
      sourceRoot: "./app",
      sourceLocale: "en",
      targetLocales: ["es", "de", "ru"],
      models: "lingo.dev",
      dev: {
        usePseudotranslator: true,
      },
      buildMode: "cache-only",
    });
  }
  ```

- Wrap your app with `LingoProvider`. It should be used as early as possible in your app, root `Layout` is a good place.
  ```tsx
  export default function RootLayout({
    children,
  }: Readonly<{ children: React.ReactNode }>) {
    return (
      <LingoProvider>
        <html>
          <body className="antialiased">{children}</body>
        </html>
      </LingoProvider>
    );
  }
  ```

## Development

`pnpm install` from project root
`pnpm turbo dev --filter=@lingo.dev/compile` to compile and watch for compiler changes

Choose the demo you want to work with and run it from the corresponding folder.
`tsdown` in compiler is configured to cleanup the output folder before compilation, which works fine with next, but vite
seems to be dead every time and has to be restarted.
