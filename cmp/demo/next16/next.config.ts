import type { NextConfig } from "next";
import { withLingo } from "@lingo.dev/_compiler/next";

const nextConfig: NextConfig = {};

export default withLingo(nextConfig, {
  sourceRoot: "./app",
  lingoDir: ".lingo",
  sourceLocale: "en",
  useDirective: false, // Set to true to require 'use i18n' directive
  translator: { type: "pseudo" }, // Enable pseudolocalization for testing
});
