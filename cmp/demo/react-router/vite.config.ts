import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import { lingoCompilerPlugin } from "@lingo.dev/_compiler/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    lingoCompilerPlugin({
      sourceRoot: "app",
      lingoDir: ".lingo",
      sourceLocale: "en",
      useDirective: false, // Set to true to require 'use i18n' directive
      translator: { type: "pseudo" }, // Enable pseudolocalization for testing
    }),
    reactRouter(),
    tailwindcss(),
  ],
});
