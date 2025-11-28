import { isValidElement, type ReactNode } from "react";

/**
 * Component renderer function for rich text translation
 */
export type ComponentRenderer = (chunks: ReactNode) => ReactNode;

/**
 * Rich text parameters for translation
 */
export type RichTextParams = Record<
  string,
  string | number | ComponentRenderer
>;

/**
 * Parse rich text translation string with placeholders (server-side version)
 *
 * Supports:
 * - Variable placeholders: {name}
 * - Component placeholders: <tag0>content</tag0>
 *
 * @param text - The translation string with placeholders
 * @param params - Object with variable values and component renderers
 * @returns React nodes or string
 */
export function renderRichText(
  text: string,
  params: RichTextParams,
): ReactNode {
  // Create a new regex for each call to avoid state conflicts in recursive calls
  // We can't reuse a shared regex because recursive calls would corrupt the parent's state
  const regex = /\{(\w+)}|<(\w+)>(.*?)<\/\2>/gs;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (match[1]) {
      // Variable placeholder: {varName}
      const varName = match[1];
      const value = params[varName];
      if (value !== undefined && typeof value !== "function") {
        parts.push(value);
      } else {
        parts.push(match[0]); // Keep placeholder if not found
      }
    } else if (match[2]) {
      // Component placeholder: <tag0>content</tag0>
      const tagName = match[2];
      const content = match[3];
      const renderer = params[tagName];

      if (typeof renderer === "function") {
        // Recursively parse the content
        const parsedContent = renderRichText(content, params);
        parts.push(renderer(parsedContent));
      } else {
        parts.push(match[0]); // Keep placeholder if not found
      }
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  // If no parts were created (no matches), return original text
  if (parts.length === 0) {
    return text;
  }

  // Check if any part is a React element
  const hasReactElements = parts.some((part) => isValidElement(part));

  // If no React elements, concatenate all parts into a string
  if (!hasReactElements) {
    return parts.join("");
  }

  // Return single element if only one part
  if (parts.length === 1) {
    return parts[0];
  }

  // Return array of nodes wrapped in Fragment
  return <>{parts}</>;
}
