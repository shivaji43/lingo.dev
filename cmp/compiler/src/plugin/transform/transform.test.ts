/**
 * Transform Component Tests
 *
 * These tests verify the JSX transformation logic using in-memory mocks.
 * No actual files are created - all metadata and config stay in memory.
 *
 * The transformComponent function is pure - it takes code and metadata as input
 * and returns transformed code + new entries. It never touches the filesystem.
 */

import { describe, it, expect, beforeEach, assert } from "vitest";
import { transformComponent } from "./index";
import type { LoaderConfig, MetadataSchema } from "../../types";
import {
  createMockMetadata,
  createMockConfig,
} from "../../__test-utils__/mocks";

describe("transformComponent", () => {
  let config: LoaderConfig;
  let metadata: MetadataSchema;

  beforeEach(() => {
    // Create fresh in-memory mocks for each test
    // No actual files are created during tests
    config = createMockConfig();
    metadata = createMockMetadata();
  });

  describe("single component", () => {
    it("should transform a simple component with text", () => {
      const code = `
export function Welcome() {
  return <div>Hello World</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Welcome.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(1);
      expect(result.newEntries[0].sourceText).toBe("Hello World");
      expect(result.code).toMatchSnapshot();
    });

    it("should transform component with multiple text nodes", () => {
      const code = `
export function Card() {
  return (
    <div>
      <h1>Welcome</h1>
      <p>This is a description</p>
      <button>Click me</button>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Card.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(true);
      expect(result.newEntries).toHaveLength(3);
      assert.isDefined(result.newEntries);
      expect(result.newEntries.map((e) => e.sourceText)).toEqual([
        "Welcome",
        "This is a description",
        "Click me",
      ]);
      expect(result.code).toMatchSnapshot();
    });

    it("should skip whitespace-only text", () => {
      const code = `
export function Spacey() {
  return (
    <div>

      <h1>Title</h1>

    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Spacey.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(true);
      expect(result.newEntries).toHaveLength(1);
      expect(result.newEntries?.[0].sourceText).toBe("Title");
      expect(result.code).toMatchSnapshot();
    });
  });

  describe("multiple components in one file", () => {
    it("should transform multiple function components", () => {
      const code = `
export function Header() {
  return <header>Site Header</header>;
}

export function Footer() {
  return <footer>Site Footer</footer>;
}

export function Main() {
  return <main>Main Content</main>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Layout.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(3);
      expect(result.newEntries.map((e) => e.sourceText)).toEqual([
        "Site Header",
        "Site Footer",
        "Main Content",
      ]);

      // Each component should have correct context
      expect(result.newEntries[0].context.componentName).toBe("Header");
      expect(result.newEntries[1].context.componentName).toBe("Footer");
      expect(result.newEntries[2].context.componentName).toBe("Main");

      expect(result.code).toMatchSnapshot();
    });

    it("should transform arrow function components", () => {
      const code = `
const Welcome = () => {
  return <div>Welcome Message</div>;
};

const Goodbye = () => <div>Goodbye Message</div>;

export { Welcome, Goodbye };
`;

      const result = transformComponent({
        code,
        filePath: "src/Messages.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(2);
      expect(result.newEntries.map((e) => e.sourceText)).toEqual([
        "Welcome Message",
        "Goodbye Message",
      ]);

      // Each component has its own context
      expect(result.newEntries[0].context.componentName).toBe("Welcome");
      expect(result.newEntries[1].context.componentName).toBe("Goodbye");

      expect(result.code).toMatchSnapshot();
    });

    it("should transform mixed function and arrow components", () => {
      const code = `
export function Title() {
  return <h1>Page Title</h1>;
}

const Subtitle = () => {
  return <h2>Page Subtitle</h2>;
};

export const Description = () => <p>Page Description</p>;

export default function Container() {
  return (
    <div>
      <Title />
      <Subtitle />
      <Description />
      <footer>Footer Text</footer>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Page.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(4);
      expect(result.newEntries.map((e) => e.sourceText)).toEqual([
        "Page Title",
        "Page Subtitle",
        "Page Description",
        "Footer Text",
      ]);

      // Each component has its own context
      expect(result.newEntries[0].context.componentName).toBe("Title");
      expect(result.newEntries[1].context.componentName).toBe("Subtitle");
      expect(result.newEntries[2].context.componentName).toBe("Description");
      expect(result.newEntries[3].context.componentName).toBe("Container");

      expect(result.code).toMatchSnapshot();
    });

    it("should handle nested components", () => {
      const code = `
function OuterComponent() {
  function InnerComponent() {
    return <span>Inner Text</span>;
  }

  return (
    <div>
      <h1>Outer Text</h1>
      <InnerComponent />
    </div>
  );
}

export default OuterComponent;
`;

      const result = transformComponent({
        code,
        filePath: "src/Nested.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(2);
      // Note: Inner component is visited first during AST traversal
      expect(result.newEntries.map((e) => e.sourceText)).toEqual([
        "Inner Text",
        "Outer Text",
      ]);

      expect(result.code).toMatchSnapshot();
    });
  });

  describe("component with existing translation calls", () => {
    it("should not transform text that's already in expressions", () => {
      const code = `
export function AlreadyTranslated() {
  const text = "Some text";
  return <div>{text}</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Already.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(false);
      expect(result.newEntries).toHaveLength(0);
    });
  });

  describe("non-component files", () => {
    it("should not transform files without JSX", () => {
      const code = `
export function regularFunction() {
  return "Hello World";
}
`;

      const result = transformComponent({
        code,
        filePath: "src/utils.ts",
        config,
        metadata,
      });

      expect(result.transformed).toBe(false);
      expect(result.newEntries).toHaveLength(0);
    });

    it("should not transform functions that don't return JSX", () => {
      const code = `
export function notAComponent() {
  const element = document.createElement('div');
  element.textContent = 'Hello';
  return element;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/DomUtils.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(false);
      expect(result.newEntries).toHaveLength(0);
    });
  });

  describe("complex component scenarios", () => {
    it("should handle components with conditional rendering", () => {
      const code = `
export function ConditionalComponent({ showMessage }) {
  return (
    <div>
      <h1>Title</h1>
      {showMessage && <p>Optional Message</p>}
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Conditional.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(2);
      expect(result.newEntries.map((e) => e.sourceText)).toEqual([
        "Title",
        "Optional Message",
      ]);
      expect(result.code).toMatchSnapshot();
    });

    it("should handle components with map", () => {
      const code = `
export function ListComponent({ items }) {
  return (
    <div>
      <h1>List Title</h1>
      {items.map(item => <li key={item.id}>{item.name}</li>)}
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/List.tsx",
        config,
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      // Only the h1 should be transformed, not the expression in map
      expect(result.newEntries).toHaveLength(1);
      expect(result.newEntries[0].sourceText).toBe("List Title");
      expect(result.code).toMatchSnapshot();
    });
  });

  describe("metadata context", () => {
    it("should include correct file path in context", () => {
      const code = `
export function Test() {
  return <div>Test</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/components/Test.tsx",
        config,
        metadata,
      });

      assert.isDefined(result.newEntries);
      expect(result.newEntries[0].context.filePath).toBe("components/Test.tsx");
    });

    it("should include line and column information", () => {
      const code = `
export function Test() {
  return <div>Test</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Test.tsx",
        config,
        metadata,
      });
      assert.isDefined(result.newEntries);
      expect(result.newEntries[0].context.line).toBeDefined();
      expect(result.newEntries[0].context.column).toBeDefined();
    });

    it("should generate consistent hashes", () => {
      const code = `
export function Test() {
  return <div>Hello</div>;
}
`;

      const result1 = transformComponent({
        code,
        filePath: "src/Test.tsx",
        config,
        metadata,
      });

      const result2 = transformComponent({
        code,
        filePath: "src/Test.tsx",
        config,
        metadata,
      });

      assert.isDefined(result1.newEntries);
      assert.isDefined(result2.newEntries);
      expect(result1.newEntries[0].hash).toBe(result2.newEntries[0].hash);
    });
  });

  describe("use directive mode", () => {
    it("should skip files without directive when useDirective is true", () => {
      const directiveConfig = createMockConfig({ useDirective: true });

      const code = `
export function Test() {
  return <div>Hello</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Test.tsx",
        config: directiveConfig,
        metadata,
      });

      expect(result.transformed).toBe(false);
      expect(result.newEntries).toHaveLength(0);
    });

    it("should transform files with 'use i18n' directive", () => {
      const directiveConfig = createMockConfig({ useDirective: true });

      const code = `
"use i18n";

export function Test() {
  return <div>Hello</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Test.tsx",
        config: directiveConfig,
        metadata,
      });

      expect(result.transformed).toBe(true);
      expect(result.newEntries).toHaveLength(1);
      expect(result.code).toMatchSnapshot();
    });
  });

  describe("metadata transformation", () => {
    it("should transform static metadata export to generateMetadata", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Page Title",
  description: "This is my page description",
};

export default function Page() {
  return <div>Content</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/app/page.tsx",
        config: nextConfig,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should have 3 entries: 2 metadata strings + 1 component text
      expect(result.newEntries).toHaveLength(3);

      // Check metadata entries
      const metadataEntries = result.newEntries.filter(
        (e) => e.context.type === "metadata",
      );
      expect(metadataEntries).toHaveLength(2);
      expect(metadataEntries.map((e) => e.sourceText)).toEqual([
        "My Page Title",
        "This is my page description",
      ]);
      expect(metadataEntries[0].context.metadataField).toBe("title");
      expect(metadataEntries[1].context.metadataField).toBe("description");
      expect(metadataEntries[0].context.componentName).toBe("metadata");
      expect(metadataEntries[1].context.componentName).toBe("metadata");

      expect(result.code).toMatchSnapshot();
    });

    it("should transform existing generateMetadata function", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export async function generateMetadata({ params }) {
  return {
    title: "Dynamic Title",
    description: "Dynamic Description",
  };
}

export default function Page() {
  return <div>Content</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/app/page.tsx",
        config: nextConfig,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should have 3 entries: 2 metadata strings + 1 component text
      expect(result.newEntries).toHaveLength(3);

      // Check metadata entries
      const metadataEntries = result.newEntries.filter(
        (e) => e.context.type === "metadata",
      );
      expect(metadataEntries).toHaveLength(2);
      expect(metadataEntries.map((e) => e.sourceText)).toEqual([
        "Dynamic Title",
        "Dynamic Description",
      ]);

      expect(result.code).toMatchSnapshot();
    });

    it("should handle nested metadata objects (openGraph, twitter)", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export const metadata = {
  title: "Page Title",
  description: "Page Description",
  openGraph: {
    title: "OG Title",
    description: "OG Description",
  },
  twitter: {
    card: "summary_large_image",
    title: "Twitter Title",
    description: "Twitter Description",
  },
};
`;

      const result = transformComponent({
        code,
        filePath: "src/app/layout.tsx",
        config: nextConfig,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should extract only translatable fields (6 total, excluding "twitter.card")
      expect(result.newEntries).toHaveLength(6);

      const metadataEntries = result.newEntries.filter(
        (e) => e.context.type === "metadata",
      );
      expect(metadataEntries).toHaveLength(6);

      // Check field paths (twitter.card should be excluded)
      expect(metadataEntries.map((e) => e.context.metadataField)).toEqual([
        "title",
        "description",
        "openGraph.title",
        "openGraph.description",
        "twitter.title",
        "twitter.description",
      ]);

      expect(metadataEntries.map((e) => e.sourceText)).toEqual([
        "Page Title",
        "Page Description",
        "OG Title",
        "OG Description",
        "Twitter Title",
        "Twitter Description",
      ]);

      expect(result.code).toMatchSnapshot();
    });

    it("should handle metadata with template literals (static only)", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export const metadata = {
  title: \`Static Title\`,
  description: "Regular Description",
};
`;

      const result = transformComponent({
        code,
        filePath: "src/app/page.tsx",
        config: nextConfig,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should extract both strings
      expect(result.newEntries).toHaveLength(2);
      expect(result.newEntries.map((e) => e.sourceText)).toEqual([
        "Static Title",
        "Regular Description",
      ]);

      expect(result.code).toMatchSnapshot();
    });

    it("should skip metadata with no translatable strings", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export const metadata = {
  robots: { index: true, follow: true },
  viewport: { width: 1024 },
};

export default function Page() {
  return <div>Content</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/app/page.tsx",
        config: nextConfig,
        metadata,
      });

      // Only the component text should be transformed
      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(1);
      expect(result.newEntries[0].sourceText).toBe("Content");
      expect(result.newEntries[0].context.type).not.toBe("metadata");

      // Metadata export should remain unchanged
      expect(result.code).toContain("export const metadata");
      expect(result.code).not.toContain("generateMetadata");
    });

    it("should not transform generateMetadata without translatable content", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export async function generateMetadata() {
  return {
    robots: { index: true },
  };
}
`;

      const result = transformComponent({
        code,
        filePath: "src/app/layout.tsx",
        config: nextConfig,
        metadata,
      });

      expect(result.transformed).toBe(false);
      expect(result.newEntries).toHaveLength(0);

      // Code should remain unchanged
      expect(result.code).not.toContain("getServerTranslations");
    });

    it("should generate consistent hashes for metadata fields", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export const metadata = {
  title: "Test Title",
};
`;

      const result1 = transformComponent({
        code,
        filePath: "src/app/page.tsx",
        config: nextConfig,
        metadata,
      });

      const result2 = transformComponent({
        code,
        filePath: "src/app/page.tsx",
        config: nextConfig,
        metadata,
      });

      assert.isDefined(result1.newEntries);
      assert.isDefined(result2.newEntries);
      expect(result1.newEntries[0].hash).toBe(result2.newEntries[0].hash);
    });

    it("should translate title.template and title.default", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export const metadata = {
  title: {
    template: '%s | Acme',
    default: 'Acme',
  },
  description: "Company site",
};
`;

      const result = transformComponent({
        code,
        filePath: "src/app/layout.tsx",
        config: nextConfig,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(3);

      const metadataEntries = result.newEntries.filter(
        (e) => e.context.type === "metadata",
      );
      expect(metadataEntries.map((e) => e.context.metadataField)).toEqual([
        "title.template",
        "title.default",
        "description",
      ]);
      expect(metadataEntries.map((e) => e.sourceText)).toEqual([
        // TODO (AleksandrSl 27/11/2025): Ensure correct translation of this, so that the tempalte structure is preserved.
        "%s | Acme",
        "Acme",
        "Company site",
      ]);
    });

    it("should translate openGraph.images[].alt", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export const metadata = {
  openGraph: {
    images: [
      {
        url: 'https://example.com/image1.jpg',
        alt: 'First image description',
      },
      {
        url: 'https://example.com/image2.jpg',
        alt: 'Second image description',
      },
    ],
  },
};
`;

      const result = transformComponent({
        code,
        filePath: "src/app/page.tsx",
        config: nextConfig,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(2);

      const metadataEntries = result.newEntries.filter(
        (e) => e.context.type === "metadata",
      );
      expect(metadataEntries.map((e) => e.context.metadataField)).toEqual([
        "openGraph.images[0].alt",
        "openGraph.images[1].alt",
      ]);
      expect(metadataEntries.map((e) => e.sourceText)).toEqual([
        "First image description",
        "Second image description",
      ]);

      // URLs should NOT be translated
      expect(result.code).toContain("'https://example.com/image1.jpg'");
      expect(result.code).toContain("'https://example.com/image2.jpg'");
    });

    it("should translate twitter.images[].alt", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export const metadata = {
  twitter: {
    card: 'summary_large_image',
    images: [
      {
        url: 'https://example.com/twitter.jpg',
        alt: 'Twitter card image',
      },
    ],
  },
};
`;

      const result = transformComponent({
        code,
        filePath: "src/app/page.tsx",
        config: nextConfig,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(1);

      const metadataEntry = result.newEntries[0];
      expect(metadataEntry.context.metadataField).toBe("twitter.images[0].alt");
      expect(metadataEntry.sourceText).toBe("Twitter card image");

      // URL and card should NOT be translated
      expect(result.code).toContain("'https://example.com/twitter.jpg'");
      expect(result.code).toContain("'summary_large_image'");
    });

    it("should translate appleWebApp.title", () => {
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export const metadata = {
  appleWebApp: {
    title: 'Apple Web App',
    statusBarStyle: 'black-translucent',
  },
};
`;

      const result = transformComponent({
        code,
        filePath: "src/app/layout.tsx",
        config: nextConfig,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(1);

      const metadataEntry = result.newEntries[0];
      expect(metadataEntry.context.metadataField).toBe("appleWebApp.title");
      expect(metadataEntry.sourceText).toBe("Apple Web App");

      // statusBarStyle should NOT be translated
      expect(result.code).toContain("'black-translucent'");
    });
  });

  describe("mixed content (rich text)", () => {
    it("should transform JSX with text and expressions", () => {
      const code = `
export default function Welcome() {
  const name = "John";
  return <div>Hello {name}, welcome!</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Welcome.tsx",
        config: createMockConfig(),
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(1);

      const entry = result.newEntries[0];
      expect(entry.sourceText).toBe("Hello {name}, welcome!");
      expect(entry.context.componentName).toBe("Welcome");

      // Should generate rich text t() call
      expect(result.code).toContain("t(");
      expect(result.code).toContain('"Hello {name}, welcome!"');
      expect(result.code).toContain("name");
    });

    it("should transform JSX with text, expressions, and nested elements", () => {
      const code = `
export default function Message() {
  const name = "Alice";
  const count = 5;
  return <div>Hello {name}, you have <strong>{count}</strong> messages</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Message.tsx",
        config: createMockConfig(),
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(1);

      const entry = result.newEntries[0];
      expect(entry.sourceText).toBe(
        "Hello {name}, you have <strong0>{count}</strong0> messages",
      );
      expect(entry.context.componentName).toBe("Message");

      // TODO (AleksandrSl 28/11/2025): Use Snapshot
      // Should generate rich text t() call with component renderer
      expect(result.code).toContain("t(");
      expect(result.code).toContain(
        '"Hello {name}, you have <strong0>{count}</strong0> messages"',
      );
      expect(result.code).toContain("name");
      expect(result.code).toContain("count");
      expect(result.code).toContain("strong0:");
      expect(result.code).toContain("chunks =>");

      // Log the actual generated code for debugging
      console.log("Generated code for nested elements test:");
      console.log(result.code);
    });

    it("should handle multiple same-type nested elements", () => {
      const code = `
export default function Links() {
  return <p>Click <a href="/home">here</a> or <a href="/about">there</a></p>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Links.tsx",
        config: createMockConfig(),
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(1);

      const entry = result.newEntries[0];
      expect(entry.sourceText).toBe("Click <a0>here</a0> or <a1>there</a1>");

      // Should have two separate component renderers
      expect(result.code).toContain("a0:");
      expect(result.code).toContain("a1:");
    });

    it("should not transform simple text-only elements", () => {
      const code = `
export default function Simple() {
  return <div>Just plain text</div>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Simple.tsx",
        config: createMockConfig(),
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(1);

      const entry = result.newEntries[0];
      expect(entry.sourceText).toBe("Just plain text");

      // Should generate simple t() call, not rich text
      expect(result.code).toContain("t(");
      expect(result.code).not.toContain("chunks");
    });

    it('should handle string literal expressions like {" "}', () => {
      const code = `
export default function Spaced() {
  return <p>Click <a href="/home">here</a>{" "}or{" "}<a href="/about">there</a></p>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Spaced.tsx",
        config: createMockConfig(),
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(1);

      const entry = result.newEntries[0];
      // String literals like {" "} should be included directly in the text
      expect(entry.sourceText).toBe("Click <a0>here</a0> or <a1>there</a1>");
      expect(entry.sourceText).not.toContain("{expression}");

      // Should generate rich text t() call
      expect(result.code).toContain("t(");
      expect(result.code).toContain("a0:");
      expect(result.code).toContain("a1:");
    });

    it("should NOT treat void elements (like Image) as rich text", () => {
      const code = `
import Image from "next/image";

// TODO (AleksandrSl 28/11/2025): CHeck how this is transformed
export default function Button() {
  return (
    <a href="/deploy">
      <Image src="/icon.svg" alt="Icon" width={16} height={16} />
      Deploy Now
    </a>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Button.tsx",
        config: createMockConfig(),
        metadata,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should only translate "Deploy Now" as simple text, not as rich text
      // The Image should remain in its original position
      expect(result.newEntries).toHaveLength(1);
      const entry = result.newEntries[0];
      expect(entry.sourceText).toBe("Deploy Now");

      // Should NOT generate rich text with Image0
      expect(result.code).not.toContain("Image0:");
      expect(result.code).not.toContain("chunks =>");
    });
  });

  describe("server components", () => {
    it("should transform server component with multiple text nodes in paragraph", () => {
      // Use Next.js framework config for proper server component detection
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export default async function ServerPage() {
  return (
    <div>
      <h1>Welcome to our site</h1>
      <p>This is a paragraph with three short strings inside it.</p>
      <button>Click here</button>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/app/page.tsx",
        config: nextConfig,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(3);
      expect(result.newEntries.map((e) => e.sourceText)).toEqual([
        "Welcome to our site",
        "This is a paragraph with three short strings inside it.",
        "Click here",
      ]);

      // Should inject getServerTranslations import
      expect(result.code).toContain("import { getServerTranslations } from");

      // Should inject await getServerTranslations with hashes array
      expect(result.code).toContain("await getServerTranslations");
      expect(result.code).toContain("hashes:");

      // Should make component async
      expect(result.code).toContain("async function ServerPage");

      expect(result.code).toMatchSnapshot();
    });

    it("should inject correct hash array for server component", () => {
      // Use Next.js framework config for proper server component detection
      const nextConfig = createMockConfig({ framework: "next" });

      const code = `
export async function ServerCard() {
  return (
    <div>
      <h2>Title</h2>
      <p>Description</p>
      <span>Footer</span>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/components/ServerCard.tsx",
        config: nextConfig,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);
      expect(result.newEntries).toHaveLength(3);

      // Should have all three hashes in the array
      const hashes = result.newEntries.map((e) => e.hash);
      for (const hash of hashes) {
        expect(result.code).toContain(hash);
      }

      expect(result.code).toMatchSnapshot();
    });
  });

  // TODO (AleksandrSl 28/11/2025): I don't understand how these work too?
  describe("skip translation", () => {
    it("should skip translation for <code> elements", () => {
      const code = `
export function Example() {
  return (
    <div>
      <p>Install using <code>npm install package</code> command</p>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Example.tsx",
        config,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should only translate the outer text, not the code content
      expect(result.newEntries).toHaveLength(1);
      expect(result.newEntries[0].sourceText).toContain("Install using");
      expect(result.newEntries[0].sourceText).toContain("command");

      // Code element content should remain untransformed
      expect(result.code).toContain("<code>npm install package</code>");
    });

    it("should skip translation for <pre> elements", () => {
      const code = `
export function CodeBlock() {
  return (
    <div>
      <h2>Example Code</h2>
      <pre>const x = 10;
function test() {}</pre>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/CodeBlock.tsx",
        config,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should only translate the h2 text
      expect(result.newEntries).toHaveLength(1);
      expect(result.newEntries[0].sourceText).toBe("Example Code");

      // Pre element content should remain untransformed
      expect(result.code).toContain("<pre>const x = 10;");
    });

    it('should skip translation for elements with translate="no"', () => {
      const code = `
export function Product() {
  return (
    <div>
      <h1>Product Name</h1>
      <p translate="no">SKU-12345-XYZ</p>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Product.tsx",
        config,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should only translate the h1 text
      expect(result.newEntries).toHaveLength(1);
      expect(result.newEntries[0].sourceText).toBe("Product Name");

      // SKU should remain untransformed
      expect(result.code).toContain('translate="no">SKU-12345-XYZ</p>');
    });

    it("should skip translation for elements with data-lingo-skip", () => {
      const code = `
export function ApiDocs() {
  return (
    <div>
      <h1>API Documentation</h1>
      <div data-lingo-skip>
        POST /api/users
      </div>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/ApiDocs.tsx",
        config,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should only translate the h1 text
      expect(result.newEntries).toHaveLength(1);
      expect(result.newEntries[0].sourceText).toBe("API Documentation");

      // API endpoint should remain untransformed
      expect(result.code).toContain("POST /api/users");
    });

    it("should skip translation for multiple non-translatable element types", () => {
      const code = `
export function TechDoc() {
  return (
    <div>
      <p>Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy</p>
      <p>Variable <var>x</var> represents the value</p>
      <p>Sample output: <samp>Hello World</samp></p>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/TechDoc.tsx",
        config,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should translate the outer text but not kbd, var, samp content
      // The non-translatable elements are skipped from the translation string
      expect(result.newEntries).toHaveLength(3);
      const sourceTexts = result.newEntries.map((e) => e.sourceText);
      expect(sourceTexts[0]).toContain("Press");
      expect(sourceTexts[0]).toContain("to copy");
      expect(sourceTexts[1]).toContain("Variable");
      expect(sourceTexts[1]).toContain("represents the value");
      expect(sourceTexts[2]).toContain("Sample output:");

      // Technical elements should remain untransformed
      expect(result.code).toContain("<kbd>Ctrl</kbd>");
      expect(result.code).toContain("<kbd>C</kbd>");
      expect(result.code).toContain("<var>x</var>");
      expect(result.code).toContain("<samp>Hello World</samp>");
    });

    it("should skip translation for nested code in rich text", () => {
      const code = `
export function Tutorial() {
  return (
    <div>
      <p>
        Run the command <code>npm start</code> to begin.
        You can also use <code>yarn start</code> instead.
      </p>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Tutorial.tsx",
        config,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should translate the text but preserve code elements
      // Code elements are skipped from the translation string
      expect(result.newEntries).toHaveLength(1);
      const sourceText = result.newEntries[0].sourceText;
      expect(sourceText).toContain("Run the command");
      expect(sourceText).toContain("to begin");
      expect(sourceText).toContain("You can also use");
      expect(sourceText).toContain("instead");
      // Code content should NOT be in the translation string
      expect(sourceText).not.toContain("npm start");
      expect(sourceText).not.toContain("yarn start");

      // Code elements should remain untransformed in output
      expect(result.code).toContain("<code>npm start</code>");
      expect(result.code).toContain("<code>yarn start</code>");
    });

    it('should combine translate="no" with other attributes', () => {
      const code = `
export function Branded() {
  return (
    <div>
      <h1>Welcome to our app</h1>
      <span className="brand" translate="no">TechCorp™</span>
    </div>
  );
}
`;

      const result = transformComponent({
        code,
        filePath: "src/Branded.tsx",
        config,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should only translate the h1
      expect(result.newEntries).toHaveLength(1);
      expect(result.newEntries[0].sourceText).toBe("Welcome to our app");

      // Brand name should remain untransformed with className preserved
      expect(result.code).toContain('className="brand"');
      expect(result.code).toContain('translate="no"');
      expect(result.code).toContain("TechCorp™");
    });

    it('should not skip translation for translate="yes"', () => {
      const code = `
export function ExplicitTranslate() {
  return <p translate="yes">This should be translated</p>;
}
`;

      const result = transformComponent({
        code,
        filePath: "src/ExplicitTranslate.tsx",
        config,
        metadata,
        serverPort: 60000,
      });

      expect(result.transformed).toBe(true);
      assert.isDefined(result.newEntries);

      // Should translate the text
      expect(result.newEntries).toHaveLength(1);
      expect(result.newEntries[0].sourceText).toBe("This should be translated");
    });
  });
});
