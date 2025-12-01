import * as t from "@babel/types";
import { VariableDeclaration } from "@babel/types";
import type { NodePath } from "@babel/traverse";
import type {
  ComponentType,
  LoaderConfig,
  MetadataSchema,
  TranslationContext,
  TranslationEntry,
} from "../../types";
import { generateTranslationHash } from "../../utils/hash";
import {
  detectComponentType as detectComponentTypeByFramework,
  getFrameworkConfig,
} from "../../types/framework";

/**
 * State shared between all the visitors.
 */
export interface VisitorsSharedState {
  componentName: string | null;
  componentType: ComponentType;
  needsTranslationImport: boolean;
  hasUseI18nDirective: boolean;
  newEntries: TranslationEntry[];
  config: LoaderConfig;
  metadata: MetadataSchema;
  filePath: string;
  serverUrl?: string;
  /** Track all components that need translation functions injected */
  componentsNeedingTranslation: Set<string>;
  /** Map component names to their translation hashes */
  componentHashes: Map<string, string[]>;
  /** Track metadata functions that need translation */
  metadataFunctionsNeedingTranslation: Set<string>;
  /** Map metadata function names to their translation hashes */
  metadataHashes: Map<string, string[]>;
}

const root = "@lingo.dev/_compiler";

// ============================================================================
// TEXT NORMALIZATION UTILITIES
// ============================================================================

// TODO (AleksandrSl 28/11/2025): See jsx-content.ts in the old compiler for future improvements.

/**
 * Normalize whitespace in translatable text.
 * - Collapses multiple spaces/tabs/newlines into a single space
 * - Preserves single spaces between words
 * - Trims leading and trailing whitespace
 *
 * Example: "Hello\n    world  \n  foo" → "Hello world foo"
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, " ") // Collapse all whitespace sequences to single space
    .trim(); // Remove leading/trailing whitespace
}

// ============================================================================
// DETECTION UTILITIES - Pure functions for component analysis
// ============================================================================

/**
 * Detect if a function is a React component by checking if it returns JSX
 */
function isReactComponent(
  path: NodePath<
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >,
): boolean {
  // Check for arrow function with JSX expression body: () => <div>...</div>
  if (path.isArrowFunctionExpression()) {
    const body = path.node.body;
    if (body.type === "JSXElement" || body.type === "JSXFragment") {
      return true;
    }
  }

  // TODO (AleksandrSl 25/11/2025): In which order does it traverse? If it's DFS it may find the incorrect return?
  // Check for explicit return statements with JSX
  let returnsJSX = false;
  path.traverse({
    ReturnStatement(returnPath) {
      const argument = returnPath.node.argument;
      if (
        argument &&
        (argument.type === "JSXElement" || argument.type === "JSXFragment")
      ) {
        returnsJSX = true;
      }
    },
  });

  return returnsJSX;
}

/**
 * Infer component name from various patterns
 */
function inferComponentName(path: NodePath<any>): string | null {
  // Named function: function MyComponent() {}
  if (path.node.id && path.node.id.name) {
    return path.node.id.name;
  }

  // Variable declaration: const MyComponent = () => {}
  const parent = path.parent;
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    return parent.id.name;
  }

  // TODO (AleksandrSl 25/11/2025): It should support export const $NAME$
  // Export: export default function() {} or export const MyComponent = ...
  if (parent.type === "ExportDefaultDeclaration") {
    return "default";
  }

  return null;
}

/**
 * Check for 'use i18n' directive at program level
 */
function hasUseI18nDirective(program: NodePath<t.Program>): boolean {
  const directives = program.node.directives || [];
  return directives.some(
    (directive: t.Directive) => directive.value.value === "use i18n",
  );
}

// TODO (AleksandrSl 25/11/2025): Allow to add support for other frameworks
/**
 * Detect component type (Client vs Server) based on framework and directives
 * If config.isServer is explicitly set, it overrides auto-detection
 */
function detectComponentType(
  path: NodePath<unknown>,
  config: LoaderConfig,
): ComponentType {
  // If isServer is explicitly set in config, use it to override detection
  if (config.isServer !== undefined) {
    return config.isServer ? "server" : "client";
  }

  const frameworkConfig = getFrameworkConfig(config.framework || "unknown");

  const program = path.findParent((p) => p.isProgram());
  let hasUseClientDirective = false;

  // TODO (AleksandrSl 25/11/2025): Nullish coalescence operator
  if (program && program.isProgram()) {
    const directives = program.node.directives || [];
    for (const directive of directives) {
      if (directive.value.value === "use client") {
        hasUseClientDirective = true;
      }
    }
  }

  return detectComponentTypeByFramework(
    frameworkConfig,
    hasUseClientDirective,
  ) as ComponentType;
}

// ============================================================================
// TEXT TRANSFORMATION - Handle JSX text node translation
// ============================================================================

function createTranslationEntry(
  text: string,
  componentName: string,
  filePath: string,
  line?: number,
  column?: number,
): TranslationEntry {
  const hash = generateTranslationHash(text, componentName, filePath);

  const context: TranslationContext = {
    componentName,
    filePath,
    line,
    column,
  };

  return {
    sourceText: text,
    context,
    hash,
    // TODO (AleksandrSl 25/11/2025): Consider removing this field.
    addedAt: new Date().toISOString(),
  };
}

/**
 * Create t("hash", "text") call expression
 */
function createTranslationCall(
  hash: string,
  text: string,
): t.JSXExpressionContainer {
  const tCall = t.callExpression(t.identifier("t"), [
    t.stringLiteral(hash),
    t.stringLiteral(text),
  ]);
  return t.jsxExpressionContainer(tCall);
}

// ============================================================================
// MIXED CONTENT HANDLING - Handle JSX elements with text + expressions + nested elements
// ============================================================================

/**
 * Elements whose content should not be translated by default.
 * These are typically code-related or technical elements where translation
 * would break functionality or meaning.
 */
const NON_TRANSLATABLE_ELEMENTS = new Set([
  "code", // Inline code
  "pre", // Preformatted text (usually code blocks)
  "script", // JavaScript code
  "style", // CSS styles
  "kbd", // Keyboard input
  "samp", // Sample output
  "var", // Variable name
]);

/**
 * Check if a JSX element is self-closing or empty
 */
function isVoidElement(element: t.JSXElement): boolean {
  return element.openingElement.selfClosing || element.children.length === 0;
}

// TODO (AleksandrSl 28/11/2025): make this more generic, and think about corner cases where only one part of the complex component is marked with no translate
/**
 * Check if a JSX element should skip translation based on:
 * 1. Element type (code, pre, script, style, etc.)
 * 2. translate="no" attribute (HTML standard)
 * 3. data-lingo-skip attribute
 */
function shouldSkipTranslation(element: t.JSXElement): boolean {
  const openingElement = element.openingElement;

  // Check element type
  if (openingElement.name.type === "JSXIdentifier") {
    if (NON_TRANSLATABLE_ELEMENTS.has(openingElement.name.name)) {
      return true;
    }
  }

  // Check attributes
  for (const attr of openingElement.attributes) {
    if (attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier") {
      // Check for translate="no" (HTML standard)
      if (attr.name.name === "translate") {
        if (attr.value?.type === "StringLiteral" && attr.value.value === "no") {
          return true;
        }
      }

      // Check for data-lingo-skip attribute (presence is enough)
      if (attr.name.name === "data-lingo-skip") {
        return true;
      }
    }
  }

  return false;
}

// TODO (AleksandrSl 28/11/2025): I believe this one could be a complex one.
//  Though it doesn't look recursively, so should be fine.
// Let's treat element as mixed content if:
// - Has non empty text node and has at least one translatable node
// - Has text that is interrupted with any other node.

// Given that we translate by component and components usually don't have tons of elements iterating over the children should be fine.
/**
 * Check if a JSX element has mixed content that needs rich text translation
 * Mixed content = text nodes + expressions + nested JSX elements (excluding void elements)
 */
function hasMixedContent(element: t.JSXElement): boolean {
  const children = element.children;
  if (children.length === 0) return false;
  // 001
  // 221
  // 101
  // States:
  // 0 - no text or translatable nodes
  // 1 - text node
  // 2 - expression or translatable element
  // 3 - interrupted text node
  // 4 - mixed
  //
  let state = 0;

  for (const child of children) {
    if (child.type === "JSXText") {
      if (child.value.trim().length > 0) {
        switch (state) {
          case 0:
            state = 1;
            break;
          case 1:
            break;
          case 2:
            return true;
          case 3:
            return true;
        }
      }
      // Expressions require a substitution of the placeholder and are usually a part of the text so should be translated in one context
    } else if (child.type === "JSXExpressionContainer") {
      switch (state) {
        case 0:
          state = 2;
          break;
        case 1:
          return true;
        case 2:
          break;
        case 3:
          return true;
      }
    } else if (child.type === "JSXElement") {
      if (!isVoidElement(child)) {
        switch (state) {
          case 0:
            state = 2;
            break;
          case 1:
            return true;
          case 2:
            break;
          case 3:
            return true;
        }
      } else {
        switch (state) {
          case 0:
            break;
          case 1:
            state = 3;
            break;
          case 2:
            break;
          case 3:
            break;
        }
      }
    }
  }
  return false;
}

/**
 * Result of serializing JSX children to a translation string
 */
interface SerializedJSX {
  /** The serialized string with placeholders, e.g. "Hello {name}, you have <strong0>{count}</strong0> messages" */
  text: string;
  /** Variable identifiers extracted from expressions, e.g. ["name", "count"] */
  variables: string[];
  expressions: Map<string, t.Expression>;
  /** Component mappings for nested elements, e.g. { strong0: <strong>...</strong> } */
  components: Map<string, t.JSXElement>;
}

// TODO (AleksandrSl 28/11/2025): Check whitespace logic, the rest seems reasonable
/**
 * Serialize JSX children to a translation string with placeholders
 */
function serializeJSXChildren(
  children: Array<
    | t.JSXText
    | t.JSXExpressionContainer
    | t.JSXElement
    | t.JSXSpreadChild
    | t.JSXFragment
  >,
): SerializedJSX {
  let text = "";
  const variables: string[] = [];
  const expressions = new Map<string, t.Expression>();
  const components = new Map<string, t.JSXElement>();
  const elementCounts = new Map<string, number>();

  for (const child of children) {
    if (child.type === "JSXText") {
      // Normalize whitespace within this text node
      let normalized = normalizeWhitespace(child.value);

      // If we have accumulated text and this node starts with whitespace,
      // ensure there's a space separator
      if (
        text.length > 0 &&
        child.value.match(/^\s/) &&
        normalized.length > 0
      ) {
        if (!text.endsWith(" ")) {
          text += " ";
        }
      }

      text += normalized;

      // If this node ends with whitespace and has content, add trailing space
      if (normalized.length > 0 && child.value.match(/\s$/)) {
        if (!text.endsWith(" ")) {
          text += " ";
        }
      }
    } else if (child.type === "JSXExpressionContainer") {
      // Extract variable name from expression
      const expr = child.expression;
      if (expr.type === "Identifier") {
        text += `{${expr.name}}`;
        if (!variables.includes(expr.name)) {
          variables.push(expr.name);
        }
      } else if (expr.type === "StringLiteral") {
        // String literal (like {" "}) - include the literal text directly
        text += expr.value;
      } else if (expr.type !== "JSXEmptyExpression") {
        // TODO (AleksandrSl 28/11/2025): Should we implement something here?
        // Complex expression - for now, skip or use a placeholder
        const name = `expression${expressions.size}`;
        text += `{${name}}`;
        expressions.set(name, expr);
      }
    } else if (child.type === "JSXElement") {
      let shouldTranslate = true;
      // Skip void elements (they cannot have children and shouldn't be in rich text)
      if (isVoidElement(child)) {
        // Void elements are ignored in the translation string
        // They will remain in their original position in the JSX tree
        shouldTranslate = false;
      }

      // Skip elements that should not be translated (code, pre, etc.)
      // These elements remain in the JSX tree but are not included in translation
      if (shouldSkipTranslation(child)) {
        shouldTranslate = false;
      }

      // Get element name
      const openingElement = child.openingElement;
      let elementName = "";
      if (openingElement.name.type === "JSXIdentifier") {
        elementName = openingElement.name.name;
      } else {
        // TODO (AleksandrSl 28/11/2025): What is this corner case?
        elementName = "element";
      }

      // Generate unique tag name with index
      const count = elementCounts.get(elementName) || 0;
      elementCounts.set(elementName, count + 1);
      const tagName = `${elementName}${count}`;

      if (shouldTranslate) {
        // Recursively serialize nested content
        const nested = serializeJSXChildren(child.children);
        text += `<${tagName}>${nested.text}</${tagName}>`;

        // Merge nested variables
        for (const v of nested.variables) {
          if (!variables.includes(v)) {
            variables.push(v);
          }
        }

        // Merge nested component mappings with prefixes to avoid conflicts
        for (const [nestedTag, nestedElement] of nested.components) {
          components.set(`${tagName}_${nestedTag}`, nestedElement);
        }
      } else {
        text += `<${tagName}/>`;
        child.extra = {
          ...child.extra,
          shouldTranslate: false,
        };
      }

      // Store component mapping
      components.set(tagName, child);
    }
  }

  return { text, variables, expressions, components };
}

/**
 * Create a rich text translation call: t(hash, fallback, { var1, var2, tag0: (chunks) => <Tag>{chunks}</Tag> })
 */
function createRichTextTranslationCall(
  hash: string,
  fallbackText: string,
  variables: string[],
  expressions: Map<string, t.Expression>,
  components: Map<string, t.JSXElement>,
): t.CallExpression {
  const properties: t.ObjectProperty[] = [];

  // Add variable properties (shorthand)
  for (const varName of variables) {
    properties.push(
      t.objectProperty(
        t.identifier(varName),
        t.identifier(varName),
        false,
        true, // shorthand
      ),
    );
  }

  for (const [name, expr] of expressions) {
    properties.push(t.objectProperty(t.identifier(name), expr, false, false));
  }

  // Add component renderer functions
  for (const [tagName, element] of components) {
    const renderFn =
      element.extra?.shouldTranslate === false
        ? t.arrowFunctionExpression([], element)
        : // Create: tagName: (chunks) => <Element>{chunks}</Element>
          t.arrowFunctionExpression(
            // TODO (AleksandrSl 28/11/2025): Use content instead of the chunks later
            [t.identifier("chunks")],
            t.jsxElement(
              t.jsxOpeningElement(
                element.openingElement.name,
                element.openingElement.attributes,
                false,
              ),
              t.jsxClosingElement(
                element.closingElement?.name || element.openingElement.name,
              ),
              [t.jsxExpressionContainer(t.identifier("chunks"))],
              false,
            ),
          );

    properties.push(
      t.objectProperty(t.identifier(tagName), renderFn, false, false),
    );
  }

  // Build the call: t(hash, fallback, params)
  const args: t.Expression[] = [
    t.stringLiteral(hash),
    t.stringLiteral(fallbackText),
  ];

  if (properties.length > 0) {
    args.push(t.objectExpression(properties));
  }

  return t.callExpression(t.identifier("t"), args);
}

// TODO (AleksandrSl 28/11/2025): Make sure we translate attributes on the nested elements since they are processed only here.
/**
 * Transform a JSX element with mixed content into a translation call
 */
function transformMixedJSXElement(
  path: NodePath<t.JSXElement>,
  state: VisitorsSharedState,
): void {
  // Check if this element should skip translation
  if (shouldSkipTranslation(path.node)) {
    return;
  }

  // Find the nearest component ancestor
  const componentPath = getNearestComponentAncestor(path);
  if (!componentPath) return;

  const componentName = inferComponentName(componentPath);
  if (!componentName) return;

  // Serialize the JSX children
  const serialized = serializeJSXChildren(path.node.children);
  const text = serialized.text.trim();
  if (text.length === 0) return;

  // Create translation entry
  const entry = createTranslationEntry(
    text,
    componentName,
    state.filePath,
    path.node.loc?.start.line,
    path.node.loc?.start.column,
  );
  state.newEntries.push(entry);

  // Track component needs translation
  state.needsTranslationImport = true;
  state.componentsNeedingTranslation.add(componentName);

  const hashes = state.componentHashes.get(componentName) || [];
  hashes.push(entry.hash);
  state.componentHashes.set(componentName, hashes);

  // Create the rich text translation call
  const tCall = createRichTextTranslationCall(
    entry.hash,
    text,
    serialized.variables,
    serialized.expressions,
    serialized.components,
  );

  // Replace the children of the JSX element with the translation call
  path.node.children = [t.jsxExpressionContainer(tCall)];
}

/**
 * Transform a JSX text node into a translation call
 */
function transformJSXText(
  path: NodePath<t.JSXText>,
  state: VisitorsSharedState,
): void {
  const text = normalizeWhitespace(path.node.value);
  if (text.length == 0) return;

  // TODO (AleksandrSl 28/11/2025): If we find the element that is skip translation we should skip all its children
  // Check if parent JSX element should skip translation
  const parentPath = path.parentPath;
  if (parentPath?.isJSXElement()) {
    if (shouldSkipTranslation(parentPath.node)) {
      return;
    }
  }

  // TODO (AleksandrSl 25/11/2025): Ideally we can keep a stack of nested components, to skip this search.
  // Find the nearest component ancestor
  const componentPath = getNearestComponentAncestor(path);
  if (!componentPath) return;

  const componentName = inferComponentName(componentPath);
  // TODO (AleksandrSl 25/11/2025): WHy do we require component name? We should be able to transform the default export as well.
  if (!componentName) return;

  const entry = createTranslationEntry(
    text,
    componentName,
    state.filePath,
    path.node.loc?.start.line,
    path.node.loc?.start.column,
  );
  state.newEntries.push(entry);

  // TODO (AleksandrSl 25/11/2025): How do we use this?
  // Track component needs translation
  state.needsTranslationImport = true;
  state.componentsNeedingTranslation.add(componentName);

  const hashes = state.componentHashes.get(componentName) || [];
  hashes.push(entry.hash);
  state.componentHashes.set(componentName, hashes);

  path.replaceWith(createTranslationCall(entry.hash, text));
}

// ============================================================================
// IMPORT INJECTION - Add translation imports
// ============================================================================

/**
 * Create unified import: import { useTranslation } from "@lingo.dev/_compiler/react"
 *
 * Via conditional exports, this resolves to:
 * - server.ts in Server Components (React cache + use)
 * - index.ts in Client Components (Context)
 */
function createUnifiedImport(): t.ImportDeclaration {
  return t.importDeclaration(
    [
      t.importSpecifier(
        t.identifier("useTranslation"),
        t.identifier("useTranslation"),
      ),
    ],
    t.stringLiteral(`${root}/react`),
  );
}

/**
 * Create import for server components: import { getServerTranslations } from "..."
 */
function createServerImport(): t.ImportDeclaration {
  return t.importDeclaration(
    [
      t.importSpecifier(
        t.identifier("getServerTranslations"),
        t.identifier("getServerTranslations"),
      ),
    ],
    t.stringLiteral(`${root}/react/server`),
  );
}

// ============================================================================
// HOOK INJECTION - Add translation calls to components
// ============================================================================

/**
 * Inject unified `const t = useTranslation([...hashes])` at component start
 *
 * This hook works in BOTH Server and Client Components via conditional exports:
 * - In Server Components: loads server.ts (uses React cache() + use())
 * - In Client Components: loads index.ts (uses Context)
 *
 * This is the new default for non-async components!
 */
function injectUnifiedHook(
  componentPath: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
  hashes: string[],
  translationServerUrl?: string,
): void {
  const body = componentPath.get("body");

  // Handle arrow functions with expression bodies: () => <jsx>
  // Convert to block statement: () => { const t = ...; return <jsx>; }
  if (!body.isBlockStatement()) {
    if (componentPath.isArrowFunctionExpression() && body.isExpression()) {
      const returnStatement = t.returnStatement(body.node as t.Expression);
      componentPath.node.body = t.blockStatement([returnStatement]);
      // TODO (AleksandrSl 30/11/2025): Why do we need this? why not just componentPath.node.body
      // Re-get the body after conversion
      const newBody = componentPath.get("body") as NodePath<t.BlockStatement>;

      const hashArray = t.arrayExpression(
        hashes.map((hash) => t.stringLiteral(hash)),
      );

      const hookCall = t.variableDeclaration("const", [
        t.variableDeclarator(
          t.identifier("t"),
          t.callExpression(t.identifier("useTranslation"), [hashArray]),
        ),
      ]);

      newBody.node.body.unshift(hookCall);
    }
    return;
  }

  const hashArray = t.arrayExpression(
    hashes.map((hash) => t.stringLiteral(hash)),
  );

  const callArgs = translationServerUrl
    ? [hashArray, t.stringLiteral(translationServerUrl)]
    : [hashArray];

  const hookCall = t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier("t"),
      t.callExpression(t.identifier("useTranslation"), callArgs),
    ),
  ]);

  body.node.body.unshift(hookCall);
}

/**
 * Constructs a server translation hook call using provided configuration, server port, and hashes.
 * const { t } = await getServerTranslations({ ... })
 *
 * @param {Object} options - The input parameters.
 * @param {Object} options.config - Configuration options for the server translation hook.
 * @param {string} [options.config.sourceLocale] - Optional source locale for translations.
 * @param {string} [options.serverUrl] - Optional server port where the translation hook is hosted.
 * @param {string[]} options.hashes - An array of hash strings related to translations.
 * @return {VariableDeclaration} - Returns an object containing the constructed translation hook code to be used on the server.
 */
function constructServerTranslationHookCall({
  config,
  serverUrl,
  hashes,
}: {
  config: { sourceLocale?: string };
  serverUrl?: string;
  hashes: string[];
}): VariableDeclaration {
  const optionsProperties = [];

  if (config.sourceLocale) {
    optionsProperties.push(
      t.objectProperty(
        t.identifier("sourceLocale"),
        t.stringLiteral(config.sourceLocale),
      ),
    );
  }

  if (serverUrl) {
    optionsProperties.push(
      t.objectProperty(t.identifier("serverUrl"), t.stringLiteral(serverUrl)),
    );
  }

  const hashArray = t.arrayExpression(
    hashes.map((hash) => t.stringLiteral(hash)),
  );
  optionsProperties.push(t.objectProperty(t.identifier("hashes"), hashArray));

  return t.variableDeclaration("const", [
    t.variableDeclarator(
      t.objectPattern([
        t.objectProperty(
          t.identifier("t"),
          t.identifier("t"),
          false,
          true, // shorthand
        ),
      ]),
      t.awaitExpression(
        t.callExpression(t.identifier("getServerTranslations"), [
          t.objectExpression(optionsProperties),
        ]),
      ),
    ),
  ]);
}

/**
 * Inject `const { t } = await getServerTranslations([...hashes])` at component start (Server Components)
 * Makes the component async if needed
 */
function injectServerHook(
  componentPath: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
  config: LoaderConfig,
  serverUrl: string | undefined,
  hashes: string[],
): void {
  const body = componentPath.get("body");

  // Handle arrow functions with expression bodies: () => <jsx>
  // Convert to block statement: async () => { const { t } = await ...; return <jsx>; }
  if (!body.isBlockStatement()) {
    if (componentPath.isArrowFunctionExpression() && body.isExpression()) {
      const returnStatement = t.returnStatement(body.node as t.Expression);
      componentPath.node.body = t.blockStatement([returnStatement]);
      componentPath.node.async = true;
      // Re-get the body after conversion
      const newBody = componentPath.get("body") as NodePath<t.BlockStatement>;

      // Create: const { t } = await getServerTranslations({ ... })
      const serverCall = constructServerTranslationHookCall({
        config,
        serverUrl,
        hashes,
      });

      newBody.node.body.unshift(serverCall);
    }
    return;
  }

  if (!componentPath.node.async) {
    componentPath.node.async = true;
  }

  // Create: const { t } = await getServerTranslations({ ... })
  const serverCall = constructServerTranslationHookCall({
    config,
    serverUrl,
    hashes,
  });

  body.node.body.unshift(serverCall);
}

/**
 * Inject translation imports and hooks into all components
 * This runs after all hashes have been collected
 */
function injectTranslations(
  programPath: NodePath<t.Program>,
  state: VisitorsSharedState,
): void {
  // Detect which imports are needed based on component types
  let hasAsyncComponent = false; // Needs getServerTranslations (async API)
  let hasNonAsyncComponent = false; // Needs useTranslation (unified hook)

  programPath.traverse({
    FunctionDeclaration(path) {
      const componentName = path.node.id?.name;
      if (
        componentName &&
        state.componentsNeedingTranslation.has(componentName)
      ) {
        if (path.node.async === true) {
          hasAsyncComponent = true;
        } else {
          hasNonAsyncComponent = true;
        }
      }
    },
    ArrowFunctionExpression(path) {
      const parent = path.parent;
      if (
        parent.type === "VariableDeclarator" &&
        parent.id.type === "Identifier"
      ) {
        const componentName = parent.id.name;
        if (state.componentsNeedingTranslation.has(componentName)) {
          if (path.node.async === true) {
            hasAsyncComponent = true;
          } else {
            hasNonAsyncComponent = true;
          }
        }
      }
    },
  });

  // Add appropriate import(s)
  // A file can have both async and non-async components!
  if (hasAsyncComponent) {
    programPath.node.body.unshift(createServerImport());
  }
  if (hasNonAsyncComponent) {
    programPath.node.body.unshift(createUnifiedImport());
  }

  // Inject hooks into all components that need translation
  programPath.traverse({
    FunctionDeclaration(path) {
      const componentName = path.node.id?.name;
      if (
        componentName &&
        state.componentsNeedingTranslation.has(componentName)
      ) {
        const hashes = state.componentHashes.get(componentName) || [];
        // Async functions need the async API (getServerTranslations)
        // Non-async functions use the unified hook (works for both server/client via conditional exports)
        if (path.node.async === true) {
          injectServerHook(path, state.config, state.serverUrl, hashes);
        } else {
          injectUnifiedHook(path, hashes, state.serverUrl);
        }
      }
    },
    ArrowFunctionExpression(path) {
      const parent = path.parent;
      if (
        parent.type === "VariableDeclarator" &&
        parent.id.type === "Identifier"
      ) {
        const componentName = parent.id.name;
        if (state.componentsNeedingTranslation.has(componentName)) {
          const hashes = state.componentHashes.get(componentName) || [];
          if (path.node.async === true) {
            injectServerHook(path, state.config, state.serverUrl, hashes);
          } else {
            injectUnifiedHook(path, hashes, state.serverUrl);
          }
        }
      }
    },
  });
}

// ============================================================================
// METADATA TRANSFORMATION - Handle metadata exports and generateMetadata
// ============================================================================

/**
 * Whitelist of metadata fields that should be translated.
 * Other fields (like technical configurations, URLs, etc.) are left unchanged.
 */
const TRANSLATABLE_METADATA_FIELDS = new Set([
  // Top-level fields
  "title",
  "description",

  // Title object fields (template and default)
  "title.template",
  "title.default",

  // OpenGraph fields
  "openGraph.title",
  "openGraph.description",
  "openGraph.images[*].alt",

  // Twitter fields
  "twitter.title",
  "twitter.description",
  "twitter.images[*].alt",

  // Apple Web App
  "appleWebApp.title",
]);

/**
 * Check if a field path matches a pattern with array indices.
 * For example: "openGraph.images[0].alt" matches "openGraph.images[*].alt"
 */
function matchesArrayPattern(fieldPath: string, pattern: string): boolean {
  // Replace [number] with [*] for comparison
  const normalizedPath = fieldPath.replace(/\[\d+\]/g, "[*]");
  return normalizedPath === pattern;
}

/**
 * Check if a metadata field path should be translated
 */
function isTranslatableMetadataField(fieldPath: string): boolean {
  // Direct match
  if (TRANSLATABLE_METADATA_FIELDS.has(fieldPath)) {
    return true;
  }

  // Check for array pattern matches (e.g., images[0].alt matches images[*].alt)
  for (const pattern of TRANSLATABLE_METADATA_FIELDS) {
    if (pattern.includes("[*]") && matchesArrayPattern(fieldPath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Create a translation entry for metadata
 */
function createMetadataTranslationEntry(
  text: string,
  fieldPath: string,
  filePath: string,
  line?: number,
  column?: number,
): TranslationEntry {
  const hash = generateTranslationHash(text, `metadata:${fieldPath}`, filePath);

  const context: TranslationContext = {
    componentName: "metadata",
    filePath,
    line,
    column,
    type: "metadata",
    metadataField: fieldPath,
  };

  return {
    sourceText: text,
    context,
    hash,
    addedAt: new Date().toISOString(),
  };
}

/**
 * Transform metadata object properties to use t() calls
 */
function transformMetadataObject(
  objectExpression: t.ObjectExpression,
  state: VisitorsSharedState,
  hashes: string[],
  parentPath: string = "",
): void {
  for (const prop of objectExpression.properties) {
    if (prop.type !== "ObjectProperty") continue;

    // Get the key name
    let keyName: string | null = null;
    if (prop.key.type === "Identifier") {
      keyName = prop.key.name;
    } else if (prop.key.type === "StringLiteral") {
      keyName = prop.key.value;
    }

    if (!keyName) continue;

    const fieldPath = parentPath ? `${parentPath}.${keyName}` : keyName;

    // Check if this field should be translated
    const shouldTranslate = isTranslatableMetadataField(fieldPath);

    // Transform string values (only if whitelisted)
    if (prop.value.type === "StringLiteral" && shouldTranslate) {
      const text = prop.value.value;
      const entry = createMetadataTranslationEntry(
        text,
        fieldPath,
        state.filePath,
        prop.value.loc?.start.line,
        prop.value.loc?.start.column,
      );
      state.newEntries.push(entry);
      hashes.push(entry.hash);

      // Replace with t(hash, fallback) call
      prop.value = t.callExpression(t.identifier("t"), [
        t.stringLiteral(entry.hash),
        t.stringLiteral(text),
      ]);
    }
    // Transform nested objects (always recurse to check nested fields)
    else if (prop.value.type === "ObjectExpression") {
      transformMetadataObject(prop.value, state, hashes, fieldPath);
    }
    // Handle arrays (e.g., images: [{url: '...', alt: '...'}])
    else if (prop.value.type === "ArrayExpression") {
      prop.value.elements.forEach((element, index) => {
        if (element && element.type === "ObjectExpression") {
          transformMetadataObject(
            element,
            state,
            hashes,
            `${fieldPath}[${index}]`,
          );
        }
      });
    }
    // Handle template literals (basic support, only if whitelisted)
    else if (prop.value.type === "TemplateLiteral" && shouldTranslate) {
      if (
        prop.value.expressions.length === 0 &&
        prop.value.quasis.length === 1
      ) {
        const staticValue = prop.value.quasis[0].value.cooked;
        if (staticValue) {
          const entry = createMetadataTranslationEntry(
            staticValue,
            fieldPath,
            state.filePath,
            prop.value.loc?.start.line,
            prop.value.loc?.start.column,
          );
          state.newEntries.push(entry);
          hashes.push(entry.hash);

          // Replace with t(hash, fallback) call
          prop.value = t.callExpression(t.identifier("t"), [
            t.stringLiteral(entry.hash),
            t.stringLiteral(staticValue),
          ]);
        }
      }
    }
  }
}

/**
 * Convert static metadata export to generateMetadata function
 */
function convertStaticMetadataToFunction(
  path: NodePath<t.ExportNamedDeclaration>,
  state: VisitorsSharedState,
): void {
  const declaration = path.node.declaration;
  if (!declaration || declaration.type !== "VariableDeclaration") return;

  const declarator = declaration.declarations[0];
  if (!declarator || declarator.id.type !== "Identifier") return;
  if (declarator.id.name !== "metadata") return;

  const init = declarator.init;
  if (!init || init.type !== "ObjectExpression") return;

  // Extract and transform metadata strings
  const hashes: string[] = [];
  const metadataObject = t.cloneNode(init, true);
  transformMetadataObject(metadataObject, state, hashes);

  if (hashes.length === 0) {
    // No strings to translate, skip transformation
    return;
  }

  // Create generateMetadata function
  const generateMetadataFunction = t.functionDeclaration(
    t.identifier("generateMetadata"),
    [],
    t.blockStatement([
      // const { t } = await getServerTranslations({ hashes: [...] })
      t.variableDeclaration("const", [
        t.variableDeclarator(
          t.objectPattern([
            t.objectProperty(
              t.identifier("t"),
              t.identifier("t"),
              false,
              true, // shorthand
            ),
          ]),
          t.awaitExpression(
            t.callExpression(t.identifier("getServerTranslations"), [
              t.objectExpression(
                [
                  state.config.sourceLocale
                    ? t.objectProperty(
                        t.identifier("sourceLocale"),
                        t.stringLiteral(state.config.sourceLocale),
                      )
                    : null,
                  state.serverUrl
                    ? t.objectProperty(
                        t.identifier("serverUrl"),
                        t.stringLiteral(state.serverUrl),
                      )
                    : null,
                  t.objectProperty(
                    t.identifier("hashes"),
                    t.arrayExpression(
                      hashes.map((hash) => t.stringLiteral(hash)),
                    ),
                  ),
                ].filter((prop): prop is t.ObjectProperty => prop !== null),
              ),
            ]),
          ),
        ),
      ]),
      // return { ... }
      t.returnStatement(metadataObject),
    ]),
    false,
    true, // async
  );

  // Replace the export
  path.replaceWith(t.exportNamedDeclaration(generateMetadataFunction, []));

  state.needsTranslationImport = true;
  state.metadataFunctionsNeedingTranslation.add("generateMetadata");
  state.metadataHashes.set("generateMetadata", hashes);
}

/**
 * Transform existing generateMetadata function
 */
function transformGenerateMetadataFunction(
  path: NodePath<t.FunctionDeclaration>,
  state: VisitorsSharedState,
): void {
  const body = path.get("body");
  if (!body.isBlockStatement()) return;

  // Find the return statement with metadata object
  // The cast of the value seems stupid, but otherwise typescript infers metadataReturn to always be null, since it doesn't process the callback.
  let metadataReturn: NodePath<t.ReturnStatement> | null =
    null as NodePath<t.ReturnStatement> | null;
  body.traverse({
    ReturnStatement(returnPath) {
      if (!metadataReturn) {
        metadataReturn = returnPath;
      }
    },
  });

  // TODO (AleksandrSl 27/11/2025): Seems like a TS bug? We do assign the value in the callback
  if (metadataReturn == null || !metadataReturn.node.argument) return;
  if (metadataReturn.node.argument.type !== "ObjectExpression") return;

  // Extract and transform metadata strings
  const hashes: string[] = [];
  const metadataObject = metadataReturn.node.argument;
  transformMetadataObject(metadataObject, state, hashes);

  if (hashes.length === 0) {
    // No strings to translate, skip transformation
    return;
  }

  // Make function async if not already
  if (!path.node.async) {
    path.node.async = true;
  }

  const serverCall = constructServerTranslationHookCall({
    config: state.config,
    serverUrl: state.serverUrl,
    hashes,
  });

  body.node.body.unshift(serverCall);

  state.needsTranslationImport = true;
  state.metadataFunctionsNeedingTranslation.add("generateMetadata");
  state.metadataHashes.set("generateMetadata", hashes);
}

// ============================================================================
// VISITOR FACTORY - Compose all visitors into single-pass transformation
// ============================================================================

/**
 * Get the nearest component ancestor of a given path
 */
function getNearestComponentAncestor(
  path: NodePath<any>,
): NodePath<
  t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
> | null {
  let current = path.parentPath;

  while (current) {
    if (
      current.isFunctionDeclaration() ||
      current.isFunctionExpression() ||
      current.isArrowFunctionExpression()
    ) {
      // Check if this function is a React component
      if (isReactComponent(current)) {
        return current;
      }
    }
    current = current.parentPath;
  }

  return null;
}

/**
 * Handle component function detection and state update
 */
function handleComponentFunction(
  path: NodePath<
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >,
  state: VisitorsSharedState,
  // TODO (AleksandrSl 25/11/2025): Remove the param
  config: LoaderConfig,
): void {
  if (!isReactComponent(path)) return;

  const componentName = inferComponentName(path);
  if (!componentName) return;

  // Store component info for later hook injection
  // We don't set state.componentName here because JSXText visitors will handle that
  if (!state.componentHashes.has(componentName)) {
    state.componentHashes.set(componentName, []);
  }
}

/**
 * Create Babel visitors for auto-translation (single-pass transformation)
 */
export function createBabelVisitors({
  config,
  visitorState,
}: {
  config: LoaderConfig;
  visitorState: VisitorsSharedState;
}) {
  return {
    Program: {
      enter(path: NodePath<t.Program>) {
        visitorState.hasUseI18nDirective = hasUseI18nDirective(path);

        // Skip if directive required but not present
        if (config.useDirective && !visitorState.hasUseI18nDirective) {
          path.skip();
        }
      },

      exit(path: NodePath<t.Program>) {
        // Inject imports and hooks after collecting all translations
        if (visitorState.needsTranslationImport) {
          injectTranslations(path, visitorState);
        }
      },
    },

    // Handle static metadata exports: export const metadata = { ... }
    ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
      const declaration = path.node.declaration;
      if (!declaration || declaration.type !== "VariableDeclaration") return;

      const declarator = declaration.declarations[0];
      if (!declarator || declarator.id.type !== "Identifier") return;
      if (declarator.id.name !== "metadata") return;

      convertStaticMetadataToFunction(path, visitorState);
    },

    // All component function types share the same handler
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      // Check if it's generateMetadata first
      if (path.node.id?.name === "generateMetadata") {
        // Check if it's exported
        const parent = path.parent;
        if (
          parent.type === "ExportNamedDeclaration" ||
          parent.type === "Program"
        ) {
          transformGenerateMetadataFunction(path, visitorState);
          return; // Don't process as component
        }
      }

      // Otherwise, handle as component
      handleComponentFunction(path, visitorState, config);
    },

    ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
      handleComponentFunction(path, visitorState, config);
    },

    FunctionExpression(path: NodePath<t.FunctionExpression>) {
      handleComponentFunction(path, visitorState, config);
    },

    // Transform JSX elements with mixed content (text + expressions + nested elements)
    // This runs BEFORE JSXText visitor due to traversal order
    JSXElement(path: NodePath<t.JSXElement>) {
      if (shouldSkipTranslation(path.node)) {
        path.skip();
        return;
      }
      if (hasMixedContent(path.node)) {
        transformMixedJSXElement(path, visitorState);
        // Skip traversing children since we've already processed them
        path.skip();
      }
    },

    // TODO (AleksandrSl 28/11/2025): How do we skip this for the mixed cases?
    // Transform JSX text nodes - finds nearest component ancestor
    // This only runs for simple text nodes (not part of mixed content)
    JSXText(path: NodePath<t.JSXText>) {
      transformJSXText(path, visitorState);
    },
  };
}
