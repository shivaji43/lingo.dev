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

    expect(result).toMatchSnapshot();
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

    expect(result).toMatchSnapshot();
  });

  it("should render multiple same-type components", () => {
    const result = renderRichText("Click <a0>here</a0> or <a1>there</a1>", {
      a0: (chunks) => <a href="/home">{chunks}</a>,
      a1: (chunks) => <a href="/about">{chunks}</a>,
    });

    expect(result).toMatchSnapshot();
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

    expect(result).toMatchSnapshot();
  });

  it("should handle nested components inside component tags", () => {
    const result = renderRichText("You have <strong0>{count}</strong0> items", {
      count: 10,
      strong0: (chunks) => <strong>{chunks}</strong>,
    });

    expect(result).toMatchSnapshot();
  });

  it("should handle whitespace around component tags", () => {
    const result = renderRichText(
      "Looking for help? Head over to <a0>Templates</a0> or the <a1>Learning</a1> center.",
      {
        a0: (chunks) => <a>{chunks}</a>,
        a1: (chunks) => <a>{chunks}</a>,
      },
    );

    expect(result).toMatchSnapshot();
  });

  it("should render untranslatable content as is", () => {
    const result = renderRichText("Install using <code0/> command", {
      code0: () => <code>npm install package</code>,
    });
    expect(result).toMatchSnapshot();
  });

  it("should render fragments with expressions", () => {
    const translatableMixedContextFragment = (
      <>
        {renderRichText("<b0>Mixed</b0> content <i0>fragment</i0>", {
          b0: (chunks) => <b>{chunks}</b>,
          i0: (chunks) => <i>{chunks}</i>,
        })}
      </>
    );

    const result = renderRichText(
      "Content that has text and other tags inside will br translated as a single entity: {translatableMixedContextFragment}",
      {
        translatableMixedContextFragment,
      },
    );
    expect(result).toMatchSnapshot();
  });
});
