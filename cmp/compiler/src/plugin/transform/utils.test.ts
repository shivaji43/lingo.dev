/**
 * Tests for ICU MessageFormat escaping utility
 */
import { describe, expect, it } from "vitest";
import IntlMessageFormat from "intl-messageformat";
import { escapeTextForICU } from "./utils";

describe("escapeTextForICU", () => {
  it.each([
    // [input, expectedEscaped, expectedRendered]
    ["It's a test", "It''s a test", "It's a test"],
    [
      "Use {braces} in code",
      "Use '{'braces'}' in code",
      "Use {braces} in code",
    ],
    [
      "Use <>content</> for fragments",
      "Use '<'>content'<'/> for fragments",
      "Use <>content</> for fragments",
    ],
    ["Use #hashtags", "Use '#'hashtags", "Use '#'hashtags"], // ICU doesn't unescape #
    [
      "It's {test} with <tags> and #hash",
      "It''s '{'test'}' with '<'tags> and '#'hash",
      "It's {test} with <tags> and '#'hash",
    ],
    [
      "Use <Fragment>content</Fragment>",
      "Use '<'Fragment>content'<'/Fragment>",
      "Use <Fragment>content</Fragment>",
    ],
    ["Plain text", "Plain text", "Plain text"],
    [
      "Write <>text</> or <Fragment>text</Fragment>",
      "Write '<'>text'<'/> or '<'Fragment>text'<'/Fragment>",
      "Write <>text</> or <Fragment>text</Fragment>",
    ],
    ["<>", "'<'>", "<>"],
    ["</>", "'<'/>", "</>"],
  ])(
    "should escape %s correctly",
    (input, expectedEscaped, expectedRendered) => {
      const escaped = escapeTextForICU(input);
      expect(escaped).toBe(expectedEscaped);

      const formatter = new IntlMessageFormat(escaped, "en");
      const result = formatter.format();
      expect(result).toBe(expectedRendered);
    },
  );
});
