/**
 * Widget injection utilities for bundler plugins
 */

import type { WidgetPosition } from "./types";
import fs from "fs";
import path from "path";

/**
 * Get the widget source code to inline
 * This reads the compiled widget file and returns it as a string
 */
export function getWidgetSource(): string {
  // In development, read from source
  // In production build, this will be replaced with the compiled output
  try {
    const widgetPath = path.join(__dirname, "lingo-dev-widget.ts");
    if (fs.existsSync(widgetPath)) {
      return fs.readFileSync(widgetPath, "utf-8");
    }
  } catch (error) {
    // Fallback: return empty string, widget won't work but won't break build
    console.warn("Could not load widget source:", error);
  }

  // TODO: This should be replaced with the actual compiled widget during build
  return `
    // Widget source will be inlined here during build
    console.warn('Lingo.dev widget source not available');
  `;
}

/**
 * Create the script tag that injects and initializes the widget
 */
export function createWidgetInjectionScript(config: {
  serverPort: number | null;
  position?: WidgetPosition;
}): string {
  const widgetSource = getWidgetSource();

  return `
<script type="module">
  ${widgetSource}

  // Create and append widget element
  if (typeof window !== 'undefined') {
    const widget = document.createElement('lingo-dev-widget');
    document.body.appendChild(widget);

    // Initialize state (will be updated by TranslationProvider)
    window.__LINGO_DEV_STATE__ = {
      isLoading: false,
      locale: 'en',
      sourceLocale: 'en',
      pendingCount: 0,
      serverPort: ${config.serverPort},
      position: '${config.position || "bottom-left"}'
    };

    // Trigger initial render
    if (window.__LINGO_DEV_UPDATE__) {
      window.__LINGO_DEV_UPDATE__();
    }
  }
</script>
  `;
}
