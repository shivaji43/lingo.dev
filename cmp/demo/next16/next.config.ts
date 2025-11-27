import type { NextConfig } from "next";
import { withLingo } from "@lingo.dev/_compiler/next";

const nextConfig: NextConfig = {};

export default withLingo(nextConfig, {
  sourceRoot: "./app",
  lingoDir: ".lingo",
  sourceLocale: "en",
  targetLocales: ["es", "de", "fr"],
  useDirective: false, // Set to true to require 'use i18n' directive
  translator: {
    type: "pseudo",
  },
  // If you want to see the real translations replace the translator above with the one below
  // translator: {
  //   type: "lcp",
  //   config: {
  //     models: "lingo.dev",
  //     sourceLocale: "en",
  //   },
  // },
});
