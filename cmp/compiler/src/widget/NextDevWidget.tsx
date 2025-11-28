"use client";

import { useEffect } from "react";
import type { WidgetPosition } from "./types";

// TypeScript declaration for custom element
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lingo-dev-widget": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

/**
 * Next.js wrapper component for the Lingo.dev Web Component widget
 *
 * This component:
 * 1. Loads the Web Component definition
 * 2. Creates the <lingo-dev-widget> element
 * 3. Works with Next.js App Router and Server Components
 *
 * The widget automatically reads state from TranslationProvider via window globals.
 * No configuration needed beyond optional position prop.
 *
 * @example
 * ```tsx
 * // In your root layout.tsx
 * import { NextDevWidget } from '@lingo.dev/_compiler/react';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <NextTranslationProvider>
 *           {children}
 *           <NextDevWidget />
 *         </NextTranslationProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function NextDevWidget({
  position = "bottom-left",
}: {
  position?: WidgetPosition;
}) {
  useEffect(() => {
    // Only run in development
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    // Check if widget is already registered
    if (customElements.get("lingo-dev-widget")) {
      return;
    }

    // Load and register the Web Component
    import("./lingo-dev-widget").then(() => {
      // Web Component is now registered
      // The element will be mounted by JSX below
    });
  }, []);

  // Only render in development
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  // Note: position is managed via window.__LINGO_DEV_STATE__.position
  // which is set by TranslationProvider based on devWidget.position prop
  return <lingo-dev-widget />;
}
