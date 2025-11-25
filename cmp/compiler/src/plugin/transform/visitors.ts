import * as t from "@babel/types";
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
  serverPort?: number | null;
  /** Track all components that need translation functions injected */
  componentsNeedingTranslation: Set<string>;
  /** Map component names to their translation hashes */
  componentHashes: Map<string, string[]>;
}

const root = "@lingo.dev/_compiler";

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
 */
function detectComponentType(
  path: NodePath<unknown>,
  config: LoaderConfig,
): ComponentType {
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

/**
 * Transform a JSX text node into a translation call
 */
function transformJSXText(
  path: NodePath<t.JSXText>,
  state: VisitorsSharedState,
): void {
  const text = path.node.value.trim();
  if (text.length == 0 || /^[\s\n]*$/.test(text)) return;

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
 * Create import for client components: import { useTranslation } from "..."
 */
function createClientImport(): t.ImportDeclaration {
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
 * Inject `const t = useTranslation([...hashes])` at component start (Client Components)
 */
function injectClientHook(
  componentPath: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
  hashes: string[],
): void {
  const body = componentPath.get("body");

  // Handle arrow functions with expression bodies: () => <jsx>
  // Convert to block statement: () => { const t = ...; return <jsx>; }
  if (!body.isBlockStatement()) {
    if (componentPath.isArrowFunctionExpression() && body.isExpression()) {
      const returnStatement = t.returnStatement(body.node as t.Expression);
      componentPath.node.body = t.blockStatement([returnStatement]);
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
 * Inject `const { t } = await getServerTranslations([...hashes])` at component start (Server Components)
 * Makes the component async if needed
 */
function injectServerHook(
  componentPath: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
  config: LoaderConfig,
  serverPort: number | null | undefined,
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

      const optionsProperties = [];

      if (config.sourceLocale) {
        optionsProperties.push(
          t.objectProperty(
            t.identifier("sourceLocale"),
            t.stringLiteral(config.sourceLocale),
          ),
        );
      }

      if (serverPort) {
        optionsProperties.push(
          t.objectProperty(
            t.identifier("serverPort"),
            t.numericLiteral(serverPort),
          ),
        );
      }

      const hashArray = t.arrayExpression(
        hashes.map((hash) => t.stringLiteral(hash)),
      );
      optionsProperties.push(
        t.objectProperty(t.identifier("hashes"), hashArray),
      );

      // Create: const { t } = await getServerTranslations({ ... })
      const serverCall = t.variableDeclaration("const", [
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

      newBody.node.body.unshift(serverCall);
    }
    return;
  }

  if (!componentPath.node.async) {
    componentPath.node.async = true;
  }

  const optionsProperties = [];

  if (config.sourceLocale) {
    optionsProperties.push(
      t.objectProperty(
        t.identifier("sourceLocale"),
        t.stringLiteral(config.sourceLocale),
      ),
    );
  }

  if (serverPort) {
    optionsProperties.push(
      t.objectProperty(
        t.identifier("serverPort"),
        t.numericLiteral(serverPort),
      ),
    );
  }

  const hashArray = t.arrayExpression(
    hashes.map((hash) => t.stringLiteral(hash)),
  );
  optionsProperties.push(t.objectProperty(t.identifier("hashes"), hashArray));

  // Create: const { t } = await getServerTranslations({ ... })
  const serverCall = t.variableDeclaration("const", [
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

  body.node.body.unshift(serverCall);
}

/**
 * Inject translation imports and hooks into all components
 * This runs after all hashes have been collected
 */
function injectTranslations(
  programPath: NodePath<t.Program>,
  state: VisitorsSharedState,
  config: LoaderConfig,
  serverPort?: number | null,
): void {
  // Detect if any component is a server component
  let hasServerComponent = false;
  let hasClientComponent = false;

  programPath.traverse({
    FunctionDeclaration(path) {
      const componentName = path.node.id?.name;
      if (
        componentName &&
        state.componentsNeedingTranslation.has(componentName)
      ) {
        const componentType = detectComponentType(path, config);
        if (componentType === "server") {
          hasServerComponent = true;
        } else {
          hasClientComponent = true;
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
          const componentType = detectComponentType(path, config);
          if (componentType === "server") {
            hasServerComponent = true;
          } else {
            hasClientComponent = true;
          }
        }
      }
    },
  });

  // Add appropriate import(s)
  // For now, we assume a file has either server or client components, not both
  if (hasServerComponent) {
    programPath.node.body.unshift(createServerImport());
  } else if (hasClientComponent) {
    programPath.node.body.unshift(createClientImport());
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
        const componentType = detectComponentType(path, config);
        if (componentType === "server") {
          injectServerHook(path, state.config, serverPort, hashes);
        } else {
          injectClientHook(path, hashes);
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
          const componentType = detectComponentType(path, config);
          if (componentType === "server") {
            injectServerHook(path, state.config, serverPort, hashes);
          } else {
            injectClientHook(path, hashes);
          }
        }
      }
    },
  });
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
  serverPort,
}: {
  config: LoaderConfig;
  visitorState: VisitorsSharedState;
  serverPort?: number | null;
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
          injectTranslations(path, visitorState, config, serverPort);
        }
      },
    },

    // All component function types share the same handler
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      handleComponentFunction(path, visitorState, config);
    },

    ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
      handleComponentFunction(path, visitorState, config);
    },

    FunctionExpression(path: NodePath<t.FunctionExpression>) {
      handleComponentFunction(path, visitorState, config);
    },

    // Transform JSX text nodes - finds nearest component ancestor
    JSXText(path: NodePath<t.JSXText>) {
      transformJSXText(path, visitorState);
    },
  };
}
