import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { lingoCompilerPlugin } from "@lingo.dev/_compiler/vite";

export default defineConfig({
  plugins: [
    lingoCompilerPlugin({
      sourceRoot: "src",
      lingoDir: ".lingo",
      sourceLocale: "en",
      useDirective: false, // Set to true to require 'use i18n' directive
      translator: { type: "pseudo" }, // Enable pseudolocalization for testing
    }),
    react(),
  ],
});
