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

      // Should extract all nested strings (7 total including "summary_large_image")
      expect(result.newEntries).toHaveLength(7);

      const metadataEntries = result.newEntries.filter(
        (e) => e.context.type === "metadata",
      );
      expect(metadataEntries).toHaveLength(7);

      // Check field paths
      expect(metadataEntries.map((e) => e.context.metadataField)).toEqual([
        "title",
        "description",
        "openGraph.title",
        "openGraph.description",
        "twitter.card",
        "twitter.title",
        "twitter.description",
      ]);

      expect(metadataEntries.map((e) => e.sourceText)).toEqual([
        "Page Title",
        "Page Description",
        "OG Title",
        "OG Description",
        "summary_large_image",
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
});
