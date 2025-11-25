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
  // TODO (AleksandrSl 25/11/2025): WHy do we require component name? We should be able to transform the default export as well.
  // Require component context
  if (!state.componentName) return;

  const text = path.node.value.trim();
  if (text.length == 0 || /^[\s\n]*$/.test(text)) return;

  const entry = createTranslationEntry(
    text,
    state.componentName,
    state.filePath,
    path.node.loc?.start.line,
    path.node.loc?.start.column,
  );
  state.newEntries.push(entry);

  // TODO (AleksandrSl 25/11/2025): How do we use this?
  // Track component needs translation
  state.needsTranslationImport = true;
  state.componentsNeedingTranslation.add(state.componentName);

  const hashes = state.componentHashes.get(state.componentName) || [];
  hashes.push(entry.hash);
  state.componentHashes.set(state.componentName, hashes);

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
  if (!body.isBlockStatement()) return;

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
  if (!body.isBlockStatement()) return;

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
  serverPort?: number | null,
): void {
  const isServerComponent = state.componentType === "server";

  // Add appropriate import
  const importDeclaration = isServerComponent
    ? createServerImport()
    : createClientImport();
  programPath.node.body.unshift(importDeclaration);

  // Inject hooks into all components that need translation
  programPath.traverse({
    FunctionDeclaration(path) {
      const componentName = path.node.id?.name;
      if (
        componentName &&
        state.componentsNeedingTranslation.has(componentName)
      ) {
        const hashes = state.componentHashes.get(componentName) || [];
        if (isServerComponent) {
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
          if (isServerComponent) {
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
 * Handle component function detection and state update
 */
function handleComponentFunction(
  path: NodePath<
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >,
  state: VisitorsSharedState,
  config: LoaderConfig,
): void {
  if (!isReactComponent(path)) return;

  state.componentName = inferComponentName(path);
  state.componentType = detectComponentType(path, config);
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
          injectTranslations(path, visitorState, serverPort);
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

    // Transform JSX text nodes
    JSXText(path: NodePath<t.JSXText>) {
      transformJSXText(path, visitorState);
    },
  };
}
