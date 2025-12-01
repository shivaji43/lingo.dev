/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderRichText } from "./render-rich-text";

describe("renderRichText", () => {
  it("should return plain text when only text (no placeholders)", () => {
    const result = renderRichText("Hello World", {});
    expect(result).toBe("Hello World");
  });

  it("should replace variable placeholders", () => {
    const result = renderRichText("Hello {name}", { name: "Alice" });
    expect(result).toBe("Hello Alice");
  });

  it("should replace multiple variable placeholders", () => {
    const result = renderRichText("Hello {name}, you have {count} messages", {
      name: "Bob",
      count: 5,
    });
    expect(result).toBe("Hello Bob, you have 5 messages");
  });

  it("should render component placeholders with JSX", () => {
    const result = renderRichText("Click <a0>here</a0>", {
      a0: (chunks) => <a href="/home">{chunks}</a>,
    });

    // Should return React elements, not a string
    expect(typeof result).not.toBe("string");
    expect(React.isValidElement(result)).toBe(true);
  });

  it("should render complex mixed content with variables and components", () => {
    const result = renderRichText(
      "Hello {name}, you have <strong0>{count}</strong0> messages",
      {
        name: "Alice",
        count: 5,
        strong0: (chunks) => <strong>{chunks}</strong>,
      },
    );

    expect(typeof result).not.toBe("string");
    expect(React.isValidElement(result)).toBe(true);
  });

  it("should render multiple same-type components", () => {
    const result = renderRichText("Click <a0>here</a0> or <a1>there</a1>", {
      a0: (chunks) => <a href="/home">{chunks}</a>,
      a1: (chunks) => <a href="/about">{chunks}</a>,
    });

    expect(typeof result).not.toBe("string");
    expect(React.isValidElement(result)).toBe(true);
  });

  it("should handle the page.tsx example case", () => {
    const result = renderRichText(
      "Looking for a starting points or more instructions? Head over to <a0>Templates</a0> or the <a1>Learning</a1> center.",
      {
        a0: (chunks) => (
          <a href="https://vercel.com/templates" className="font-medium">
            {chunks}
          </a>
        ),
        a1: (chunks) => (
          <a href="https://nextjs.org/learn" className="font-medium">
            {chunks}
          </a>
        ),
      },
    );

    // Should be React element, not string
    expect(typeof result).not.toBe("string");
    expect(React.isValidElement(result)).toBe(true);
  });

  it("should handle nested components inside component tags", () => {
    const result = renderRichText("You have <strong0>{count}</strong0> items", {
      count: 10,
      strong0: (chunks) => <strong>{chunks}</strong>,
    });

    expect(React.isValidElement(result)).toBe(true);
  });

  it("should handle whitespace around component tags", () => {
    const result = renderRichText(
      "Looking for help? Head over to <a0>Templates</a0> or the <a1>Learning</a1> center.",
      {
        a0: (chunks) => <a>{chunks}</a>,
        a1: (chunks) => <a>{chunks}</a>,
      },
    );

    expect(React.isValidElement(result)).toBe(true);
    expect(result).toMatchSnapshot();
  });

  it("should render untranslatable content as is", () => {
    const result = renderRichText("Install using <code0/> command", {
      code0: () => <code>npm install package</code>,
    });
    expect(result).toMatchSnapshot();
  });
});
