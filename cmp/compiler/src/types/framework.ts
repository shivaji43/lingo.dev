/**
 * Framework detection and configuration
 */

export type Framework =
  | "next"
  | "vite"
  | "webpack"
  | "rollup"
  | "esbuild"
  | "unknown";

export interface FrameworkConfig {
  /**
   * Framework type
   */
  framework: Framework;

  /**
   * How to detect server vs client components
   */
  componentDetection: "directive" | "all-client" | "all-server";
}

/**
 * Get framework-specific configuration
 */
export function getFrameworkConfig(framework: Framework): FrameworkConfig {
  switch (framework) {
    case "next":
      // Next.js uses directives to differentiate server/client components
      // Default is server component unless "use client" is present
      return {
        framework: "next",
        componentDetection: "directive",
      };

    case "vite":
    case "webpack":
    case "rollup":
    case "esbuild":
      // For other frameworks, assume all components are client-side
      // (In the future, we can add more sophisticated detection)
      return {
        framework,
        componentDetection: "all-client",
      };

    default:
      return {
        framework: "unknown",
        componentDetection: "all-client",
      };
  }
}

/**
 * Determine component type based on framework and directives
 */
export function detectComponentType(
  frameworkConfig: FrameworkConfig,
  hasUseClientDirective: boolean,
  hasUseServerDirective: boolean,
): "client" | "server" {
  switch (frameworkConfig.componentDetection) {
    case "directive":
      // Next.js: Check for directives
      if (hasUseClientDirective) {
        return "client";
      }
      // In Next.js App Router, default is Server Component
      return "server";

    case "all-client":
      // Everything is client-side (Vite, etc.)
      return "client";

    case "all-server":
      // Everything is server-side (future use case)
      return "server";

    default:
      return "client";
  }
}
