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
  getFrameworkConfig,
  detectComponentType as detectComponentTypeByFramework,
} from "../../types/framework";

/**
 * Plugin state to track transformation
 */
interface PluginState {
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
}

const root = "@lingo.dev/_compiler";

/**
 * Detect if a function is a React component
 */
function isReactComponent(
  path: NodePath<
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >,
): boolean {
  // Check if function returns JSX
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
 * Detect component type (Client vs Server) based on framework and directives
 */
function detectComponentType(
  path: NodePath<any>,
  config: LoaderConfig,
): ComponentType {
  // Get framework configuration
  const frameworkConfig = getFrameworkConfig(config.framework || "unknown");

  // Check for directives in the file
  const program = path.findParent((p) => p.isProgram());
  let hasUseClientDirective = false;
  let hasUseServerDirective = false;

  if (program && program.isProgram()) {
    const directives = program.node.directives || [];
    for (const directive of directives) {
      if (directive.value.value === "use client") {
        hasUseClientDirective = true;
      }
      if (directive.value.value === "use server") {
        hasUseServerDirective = true;
      }
    }
  }

  // Use framework-specific detection logic
  return detectComponentTypeByFramework(
    frameworkConfig,
    hasUseClientDirective,
    hasUseServerDirective,
  ) as ComponentType;
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

  // Export: export default function() {} or export const MyComponent = ...
  if (parent.type === "ExportDefaultDeclaration") {
    return "default";
  }

  return null;
}

/**
 * Check for 'use i18n' directive
 */
function hasUseI18nDirective(program: NodePath<t.Program>): boolean {
  const directives = program.node.directives || [];
  return directives.some(
    (directive: t.Directive) =>
      directive.value.value === "use i18n" ||
      directive.value.value === "use translation",
  );
}

/**
 * Create Babel visitors for auto-translation
 */
export function createBabelVisitors(
  config: LoaderConfig,
  metadata: MetadataSchema,
  filePath: string,
  visitorState: PluginState,
  serverPort?: number | null,
) {
  return {
    Program: {
      enter(path: NodePath<t.Program>) {
        // Initialize state
        visitorState.hasUseI18nDirective = hasUseI18nDirective(path);

        // Check if we should skip this file
        if (config.useDirective && !visitorState.hasUseI18nDirective) {
          // Skip transformation if directive is required but not present
          path.skip();
        }
      },

      exit(path: NodePath<t.Program>) {
        // Inject translation import if needed
        if (visitorState.needsTranslationImport) {
          injectTranslationImport(path, visitorState, serverPort);
        }
      },
    },

    // Capture component functions
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      if (isReactComponent(path)) {
        visitorState.componentName = inferComponentName(path);
        visitorState.componentType = detectComponentType(path, config);
      }
    },

    ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
      if (isReactComponent(path)) {
        visitorState.componentName = inferComponentName(path);
        visitorState.componentType = detectComponentType(path, config);
      }
    },

    FunctionExpression(path: NodePath<t.FunctionExpression>) {
      if (isReactComponent(path)) {
        visitorState.componentName = inferComponentName(path);
        visitorState.componentType = detectComponentType(path, config);
      }
    },

    // Transform JSX text nodes
    JSXText(path: NodePath<t.JSXText>) {
      // Skip if no component context
      if (!visitorState.componentName) {
        return;
      }

      const text = path.node.value.trim();

      // Skip empty or whitespace-only text
      if (!text) {
        return;
      }

      // Skip if text is just newlines/indentation
      if (/^[\s\n]*$/.test(text)) {
        return;
      }

      // Generate hash
      const hash = generateTranslationHash(
        text,
        visitorState.componentName,
        visitorState.filePath,
      );

      // Create translation entry
      const context: TranslationContext = {
        componentName: visitorState.componentName,
        filePath: visitorState.filePath,
        line: path.node.loc?.start.line,
        column: path.node.loc?.start.column,
      };

      const entry: TranslationEntry = {
        sourceText: text,
        context,
        hash,
        addedAt: new Date().toISOString(),
      };

      // Store new entry
      visitorState.newEntries.push(entry);

      // Replace text with {t("hash")}
      const tCall = t.callExpression(t.identifier("t"), [
        t.stringLiteral(hash),
        t.stringLiteral(text),
      ]);

      // path.replaceWith(t.stringLiteral(hash));
      path.replaceWith(t.jsxExpressionContainer(tCall));

      // Mark that we need translation import and track this component
      visitorState.needsTranslationImport = true;
      if (visitorState.componentName) {
        visitorState.componentsNeedingTranslation.add(
          visitorState.componentName,
        );
      }
    },
  };
}

/**
 * Inject appropriate translation import based on component type
 */
function injectTranslationImport(
  programPath: NodePath<t.Program>,
  state: PluginState,
  serverPort?: number | null,
): void {
  // Determine if we're dealing with a server or client component
  const isServerComponent = state.componentType === "server";

  if (isServerComponent) {
    // Import getServerTranslations for Server Components
    const getServerTranslationsImport = t.importDeclaration(
      [
        t.importSpecifier(
          t.identifier("getServerTranslations"),
          t.identifier("getServerTranslations"),
        ),
      ],
      t.stringLiteral(`${root}/react/server`),
    );

    // Import metadata JSON for bundling
    const metadataPath = `./${state.config.lingoDir}/metadata.json`;
    const metadataImport = t.importDeclaration(
      [t.importDefaultSpecifier(t.identifier("__lingoMetadata"))],
      t.stringLiteral(metadataPath),
    );

    programPath.node.body.unshift(metadataImport);
    programPath.node.body.unshift(getServerTranslationsImport);
  } else {
    // Import useTranslation for Client Components
    const importDeclaration = t.importDeclaration(
      [
        t.importSpecifier(
          t.identifier("useTranslation"),
          t.identifier("useTranslation"),
        ),
      ],
      t.stringLiteral(`${root}/react`),
    );
    programPath.node.body.unshift(importDeclaration);
  }

  // Find all component functions that need translation injection
  programPath.traverse({
    FunctionDeclaration(path) {
      const componentName = path.node.id?.name;
      if (
        componentName &&
        state.componentsNeedingTranslation.has(componentName)
      ) {
        if (isServerComponent) {
          injectServerTranslationCall(path, state.config, serverPort);
        } else {
          injectHookCall(path);
        }
      }
    },
    ArrowFunctionExpression(path) {
      // Check if this is one of our components
      const parent = path.parent;
      if (
        parent.type === "VariableDeclarator" &&
        parent.id.type === "Identifier"
      ) {
        const componentName = parent.id.name;
        if (state.componentsNeedingTranslation.has(componentName)) {
          if (isServerComponent) {
            injectServerTranslationCall(path, state.config, serverPort);
          } else {
            injectHookCall(path);
          }
        }
      }
    },
  });
}

/**
 * Inject const t = useTranslation() at the start of the component (Client Components)
 */
function injectHookCall(
  componentPath: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
): void {
  const body = componentPath.get("body");

  if (!body.isBlockStatement()) {
    return;
  }

  // useTranslation() takes no arguments - serverPort comes from context
  const hookCall = t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier("t"),
      t.callExpression(t.identifier("useTranslation"), []),
    ),
  ]);

  // Insert at the beginning of the function body
  body.node.body.unshift(hookCall);
}

/**
 * Inject const t = await getServerTranslations() at the start of the component (Server Components)
 * Also makes the component async if it isn't already
 */
function injectServerTranslationCall(
  componentPath: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
  config: any,
  serverPort?: number | null,
): void {
  const body = componentPath.get("body");

  if (!body.isBlockStatement()) {
    return;
  }

  // Make the component async if it isn't already
  if (!componentPath.node.async) {
    componentPath.node.async = true;
  }

  // Create options object for getServerTranslations
  const optionsProperties = [
    // Pass the imported metadata (required)
    t.objectProperty(t.identifier("metadata"), t.identifier("__lingoMetadata")),
  ];

  // Pass sourceLocale if configured
  if (config.sourceLocale) {
    optionsProperties.push(
      t.objectProperty(
        t.identifier("sourceLocale"),
        t.stringLiteral(config.sourceLocale),
      ),
    );
  }

  // Pass serverPort if available
  if (serverPort) {
    optionsProperties.push(
      t.objectProperty(
        t.identifier("serverPort"),
        t.numericLiteral(serverPort),
      ),
    );
  }

  const callArgs = [t.objectExpression(optionsProperties)];

  const serverCall = t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier("t"),
      t.awaitExpression(
        t.callExpression(t.identifier("getServerTranslations"), callArgs),
      ),
    ),
  ]);

  // Insert at the beginning of the function body
  body.node.body.unshift(serverCall);
}
