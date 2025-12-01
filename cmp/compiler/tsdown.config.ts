import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  target: "esnext",
  entry: [
    "src/index.ts",
    "src/react/index.ts",
    "src/react/server.ts",
    "src/config.ts",
    "src/react/server-only/index.ts",
    "src/react/next/client.tsx",
    "src/react/next/server.tsx",
    "src/plugin/next.ts",
    "src/plugin/vite.ts",
    "src/plugin/webpack.ts",
    "src/plugin/rollup.ts",
    "src/plugin/esbuild.ts",
    "src/plugin/turbopack-loader.ts",
  ],
  outDir: "build",
  format: ["cjs", "esm"],
  dts: true,
  // When bundling, components lose the directives. As far as I see in other projects, like next-intl, they also use `preserveModules` which is kinda similar.
  unbundle: true,
});
