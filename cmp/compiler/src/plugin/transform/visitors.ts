/**
 * Keep mutations to the current node and children. e.g. do not mutate program inserting imports when processing the component. This should be done in the end.
 */
import * as t from "@babel/types";
import type { VariableDeclaration } from "@babel/types";
import type { NodePath, TraverseOptions } from "@babel/traverse";
import type { ComponentType, LingoConfig, TranslationEntry } from "../../types";
import { generateTranslationHash } from "../../utils/hash";
import { logger } from "../../utils/logger";

type ComponentEntry = {
  name: string;
  type: ComponentType;
  isAsync: boolean;
};

export interface VisitorsSharedState {
  newEntries: TranslationEntry[];
  filePath: string;
  config: LingoConfig;
}

/**
 * State shared between all the visitors.
 */
export interface VisitorsInternalState extends VisitorsSharedState {
  componentsStack: ComponentEntry[];
  /** Map component names to their translation hashes */
  componentHashes: Map<string, string[]>;
  /** Track metadata functions that need translation */
  metadataFunctionsNeedingTranslation: Set<string>;
  /** Map metadata function names to their translation hashes */
  metadataHashes: Map<string, string[]>;
  /** Track if we need the unified hook import */
  needsUnifiedImport: boolean;
  /** Track if we need the async API import */
  needsAsyncImport: boolean;
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
  // We could also check for the first JSX?
  let returnsJSX = false;
  path.traverse({
    ReturnStatement(returnPath) {
      const argument = returnPath.node.argument;
      logger.debug(`Found return statement: ${argument?.type}`);
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
  // Export: export default function() {}
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

// ============================================================================
// TEXT TRANSFORMATION - Handle JSX text node translation
// ============================================================================
function createTranslationEntry(
  text: string,
  filePath: string,
  context: Record<string, any>,
  line?: number,
  column?: number,
): TranslationEntry {
  const hash = generateTranslationHash(text, context);

  return {
    sourceText: text,
    context,
    hash,
    location: {
      filePath,
      line,
      column,
    },
    // TODO (AleksandrSl 25/11/2025): Consider removing this field.
    addedAt: new Date().toISOString(),
  };
}

/**
 * Create {t("hash", "text")} call expression
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

const TRANSLATABLE_ATTRIBUTES = new Set([
  "title",
  "aria-label",
  "aria-description",
  "alt",
  "label",
  "description",
  "placeholder",
  "content",
  "subtitle",
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
function shouldSkipTranslation(element: t.JSXElement | t.JSXFragment): boolean {
  // We always translate fragments
  if (element.type === "JSXFragment") {
    return false;
  }
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

// Called even on the element which are not translatable.
function translateAttributes(
  node: t.JSXElement,
  state: VisitorsInternalState,
): void {
  const openingElement = node.openingElement;

  const component = state.componentsStack.at(-1);
  if (!component) return;

  for (const attr of openingElement.attributes) {
    if (
      attr.type === "JSXAttribute" &&
      attr.name.type === "JSXIdentifier" &&
      TRANSLATABLE_ATTRIBUTES.has(attr.name.name) &&
      attr.value?.type === "StringLiteral"
    ) {
      const text = normalizeWhitespace(attr.value.value);
      if (text.length == 0) continue;

      const entry = createTranslationEntry(
        text,
        state.filePath,
        // TODO (AleksandrSl 02/12/2025): Do we need the component name here?
        {
          attributeName: attr.name.name,
          componentName: component.name,
        },
        node.loc?.start.line,
        node.loc?.start.column,
      );
      state.newEntries.push(entry);

      // Add hash to component's hash list
      const hashes = state.componentHashes.get(component.name) || [];
      hashes.push(entry.hash);
      state.componentHashes.set(component.name, hashes);

      attr.value = createTranslationCall(entry.hash, text);
    }
  }
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
function hasMixedContent(element: t.JSXElement | t.JSXFragment): boolean {
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
  state: VisitorsInternalState,
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
        // TODO (AleksandrSl 02/12/2025): What is this corner case?
        //  I thought it may be a fragment, but it seems that fragment is a separate JSXFragment node.
        elementName = "element";
      }

      // Generate unique tag name with index
      const count = elementCounts.get(elementName) || 0;
      elementCounts.set(elementName, count + 1);
      const tagName = `${elementName}${count}`;

      translateAttributes(child, state);

      if (shouldTranslate) {
        // Recursively serialize nested content
        const nested = serializeJSXChildren(child.children, state);
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

/**
 * Transform a JSX element with mixed content into a translation call
 */
function transformMixedJSXElement(
  path: NodePath<t.JSXElement | t.JSXFragment>,
  state: VisitorsInternalState,
): void {
  // Check if this element should skip translation
  if (shouldSkipTranslation(path.node)) {
    path.skip();
    return;
  }

  // Find the nearest component ancestor
  const component = state.componentsStack.at(-1);
  if (!component) return;

  // Serialize the JSX children
  const serialized = serializeJSXChildren(path.node.children, state);
  const text = serialized.text.trim();
  if (text.length === 0) return;

  // Create translation entry
  const entry = createTranslationEntry(
    text,
    state.filePath,
    { componentName: component.name },
    path.node.loc?.start.line,
    path.node.loc?.start.column,
  );
  state.newEntries.push(entry);

  const hashes = state.componentHashes.get(component.name) || [];
  hashes.push(entry.hash);
  state.componentHashes.set(component.name, hashes);

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
  state: VisitorsInternalState,
): void {
  const text = normalizeWhitespace(path.node.value);
  if (text.length == 0) return;

  // This function is not called for the nodes that should be skipped. So we don't have to make the check here.

  // Find the nearest component ancestor
  const component = state.componentsStack.at(-1);
  if (!component) return;

  const entry = createTranslationEntry(
    text,
    state.filePath,
    { componentName: component.name },
    path.node.loc?.start.line,
    path.node.loc?.start.column,
  );
  state.newEntries.push(entry);

  const hashes = state.componentHashes.get(component.name) || [];
  hashes.push(entry.hash);
  state.componentHashes.set(component.name, hashes);

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
  componentPath: NodePath<
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >,
  hashes: string[],
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

  const hookCall = t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier("t"),
      t.callExpression(t.identifier("useTranslation"), [hashArray]),
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
 * @param {string[]} options.hashes - An array of hash strings related to translations.
 * @return {VariableDeclaration} - Returns an object containing the constructed translation hook code to be used on the server.
 */
function constructServerTranslationHookCall({
  config,
  hashes,
}: {
  config: { sourceLocale?: string };
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
  componentPath: NodePath<
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >,
  config: LingoConfig,
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
    hashes,
  });

  body.node.body.unshift(serverCall);
}

/**
 * Inject translation hook into a component when it's done processing
 * Called when popping component from stack
 */
function injectTranslationHook(
  path: NodePath<
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >,
  component: ComponentEntry,
  state: VisitorsInternalState,
): void {
  const hashes = state.componentHashes.get(component.name);
  if (!hashes || hashes.length === 0) {
    return; // No translations needed
  }

  // Determine which hook to use based on async status
  if (component.isAsync) {
    // Async component uses getServerTranslations
    injectServerHook(path, state.config, hashes);
    state.needsAsyncImport = true;
  } else {
    // Non-async component uses unified hook (useTranslation)
    injectUnifiedHook(path, hashes);
    state.needsUnifiedImport = true;
  }
}

/**
 * Add translation imports at the top of the file
 * Called on Program exit after all components have been processed
 */
function addTranslationImports(
  programPath: NodePath<t.Program>,
  state: VisitorsInternalState,
): void {
  // Add imports based on what was needed during traversal
  // A file can have both async and non-async components!
  if (
    state.needsAsyncImport ||
    state.metadataFunctionsNeedingTranslation.size > 0
  ) {
    programPath.node.body.unshift(createServerImport());
  }
  if (state.needsUnifiedImport) {
    programPath.node.body.unshift(createUnifiedImport());
  }
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
  return createTranslationEntry(
    text,
    filePath,
    { type: "metadata", metadataField: fieldPath },
    line,
    column,
  );
}

/**
 * Transform metadata object properties to use t() calls
 */
function transformMetadataObject(
  objectExpression: t.ObjectExpression,
  state: VisitorsInternalState,
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
  state: VisitorsInternalState,
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

  state.metadataFunctionsNeedingTranslation.add("generateMetadata");
  state.metadataHashes.set("generateMetadata", hashes);
}

/**
 * Transform existing generateMetadata function
 */
function transformGenerateMetadataFunction(
  path: NodePath<t.FunctionDeclaration>,
  state: VisitorsInternalState,
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
    hashes,
  });

  body.node.body.unshift(serverCall);

  state.metadataFunctionsNeedingTranslation.add("generateMetadata");
  state.metadataHashes.set("generateMetadata", hashes);
}

// ============================================================================
// VISITOR FACTORY - Compose all visitors into single-pass transformation
// ============================================================================

/**
 * Handle component function detection and state update
 */
function handleComponentFunction(
  path: NodePath<
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >,
  state: VisitorsInternalState,
): void {
  if (!isReactComponent(path)) {
    path.skip();
    logger.debug(`Skipping non-React component: ${path.node.type}`);
    return;
  }

  const componentName = inferComponentName(path);
  if (!componentName) {
    path.skip();
    return;
  }

  // Store component info for later hook injection
  if (!state.componentHashes.has(componentName)) {
    state.componentHashes.set(componentName, []);
  }

  // Push component to stack with async info and path reference
  const componentEntry: ComponentEntry = {
    name: componentName,
    type: "unknown",
    isAsync: path.node.async,
  };
  state.componentsStack.push(componentEntry);
  console.debug(`Component ${JSON.stringify(componentEntry)} entered`);

  path.setData("componentName", componentName);
  path.traverse(componentVisitors, { visitorState: state });
  const component = state.componentsStack.pop();
  if (component) {
    injectTranslationHook(path, component, state);
  }
  // We have already traversed the path's children so the main traverse can skip it.
  path.skip();
}

const componentVisitors = {
  FunctionDeclaration: {
    enter(path: NodePath<t.FunctionDeclaration>) {
      handleComponentFunction(path, this.visitorState);
    },
  },

  ArrowFunctionExpression: {
    enter(path: NodePath<t.ArrowFunctionExpression>) {
      handleComponentFunction(path, this.visitorState);
    },
  },

  FunctionExpression: {
    enter(path: NodePath<t.FunctionExpression>) {
      handleComponentFunction(path, this.visitorState);
    },
  },

  JSXFragment(path: NodePath<t.JSXFragment>) {
    path.skip();

    if (hasMixedContent(path.node)) {
      transformMixedJSXElement(path, this.visitorState);
      // Skip traversing children since we've already processed them
      path.skip();
    }
  },

  // Transform JSX elements with mixed content (text + expressions + nested elements)
  // This runs BEFORE JSXText visitor due to traversal order
  JSXElement(path: NodePath<t.JSXElement>) {
    translateAttributes(path.node, this.visitorState);

    if (shouldSkipTranslation(path.node)) {
      path.skip();
      return;
    }
    if (hasMixedContent(path.node)) {
      transformMixedJSXElement(path, this.visitorState);
      // Skip traversing children since we've already processed them
      path.skip();
    }
  },

  // Transform JSX text nodes - finds nearest component ancestor
  // This only runs for simple text nodes (not part of mixed content)
  JSXText(path: NodePath<t.JSXText>) {
    transformJSXText(path, this.visitorState);
  },
} satisfies TraverseOptions<{ visitorState: VisitorsInternalState }>;

const fileVisitors = {
  // Handle static metadata exports: export const metadata = { ... }
  ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
    const declaration = path.node.declaration;
    if (!declaration || declaration.type !== "VariableDeclaration") return;

    const declarator = declaration.declarations[0];
    if (!declarator || declarator.id.type !== "Identifier") return;
    if (declarator.id.name !== "metadata") return;

    convertStaticMetadataToFunction(path, this.visitorState);
  },

  // All component function types share the same handler
  FunctionDeclaration: {
    enter(path: NodePath<t.FunctionDeclaration>) {
      // Check if it's generateMetadata first
      if (path.node.id?.name === "generateMetadata") {
        // Check if it's exported
        const parent = path.parent;
        if (
          parent.type === "ExportNamedDeclaration" ||
          parent.type === "Program"
        ) {
          transformGenerateMetadataFunction(path, this.visitorState);
          return; // Don't process as component
        }
      }

      // Otherwise, handle as component
      handleComponentFunction(path, this.visitorState);
    },
  },

  // export const MyComponent = () => {}
  ArrowFunctionExpression: {
    enter(path: NodePath<t.ArrowFunctionExpression>) {
      handleComponentFunction(path, this.visitorState);
    },
  },

  // All these are considered function expressions
  // const myFunction = function() {
  //   return 'hello';
  // };
  //
  // const myFunction2 = function namedFunc() {
  //   return 'hello';
  // };
  //
  // setTimeout(function() {
  //   console.log('hello');
  // }, 1000);
  // While
  // export default function() {}
  // is not
  FunctionExpression: {
    enter(path: NodePath<t.FunctionExpression>) {
      handleComponentFunction(path, this.visitorState);
    },
  },
} satisfies TraverseOptions<{ visitorState: VisitorsInternalState }>;

/**
 * Create Babel visitors for auto-translation (single-pass transformation)
 */
export function createBabelVisitors({
  visitorState,
}: {
  visitorState: VisitorsSharedState;
}) {
  const state: VisitorsInternalState = {
    ...visitorState,
    componentsStack: [],
    componentHashes: new Map<string, string[]>(),
    metadataFunctionsNeedingTranslation: new Set<string>(),
    metadataHashes: new Map<string, string[]>(),
    needsUnifiedImport: false,
    needsAsyncImport: false,
  };
  return {
    Program: {
      enter(path: NodePath<t.Program>) {
        // Skip if directive required but not present
        if (visitorState.config.useDirective && !hasUseI18nDirective(path)) {
          path.skip();
          return;
        }

        path.traverse(fileVisitors, {
          visitorState: state,
        });
      },

      exit(path: NodePath<t.Program>) {
        // Add imports if any translations were processed
        if (
          state.needsUnifiedImport ||
          state.needsAsyncImport ||
          state.metadataFunctionsNeedingTranslation.size > 0
        ) {
          addTranslationImports(path, state);
        }
      },
    },
  };
}
