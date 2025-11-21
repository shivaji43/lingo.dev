import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  target: "esnext",
  entry: [
    "src/index.ts",
    "src/react/index.ts",
    "src/react/client/*.tsx",
    "src/react/client/*.ts",
    "src/react/server/*.ts",
    "src/translate/index.ts",
    "src/plugin/next.ts",
    "src/plugin/vite.ts",
    "src/plugin/webpack.ts",
    "src/plugin/rollup.ts",
    "src/plugin/esbuild.ts",
  ],
  outDir: "build",
  format: ["cjs", "esm"],
  dts: true,
});
