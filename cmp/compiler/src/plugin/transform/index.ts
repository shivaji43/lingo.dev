import * as parser from "@babel/parser";
import traverseDefault from "@babel/traverse";
import generateDefault from "@babel/generator";
import path from "path";
import { LoaderConfig, MetadataSchema, TranslationEntry } from "../../types";
import { createBabelVisitors, VisitorsSharedState } from "./visitors";
import { logger } from "../../utils/logger";

// Handle ESM/CJS interop - these packages may export differently
// @ts-expect-error - Handle both default and named exports
const traverse = traverseDefault.default ?? traverseDefault;
// @ts-expect-error - Handle both default and named exports
const generate = generateDefault.default ?? generateDefault;

export interface TransformResult {
  code: string;
  map?: any;
  newEntries?: TranslationEntry[];
  transformed: boolean;
}

/**
 * Options for the Babel transformation
 */
export interface BabelTransformOptions {
  /**
   * Source code to transform
   */
  code: string;

  /**
   * File path being transformed
   */
  filePath: string;

  /**
   * Loader configuration
   */
  config: LoaderConfig;

  /**
   * Current metadata
   */
  metadata: MetadataSchema;
}

/**
 * Transform component code to inject translation calls
 */
export function transformComponent({
  code,
  filePath,
  config,
  metadata,
}: BabelTransformOptions): TransformResult {
  // Get relative file path for consistent hashing
  const relativeFilePath = path
    .relative(path.resolve(config.sourceRoot), filePath)
    .split(path.sep)
    // '/' is used as a cross-platform path separator
    .join("/");

  try {
    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    // TODO (AleksandrSl 01/12/2025): Search for use i18n directives with regex, probably will be faster to skip the files

    const visitorState = {
      filePath: relativeFilePath,
      metadata,
      config,
      newEntries: [] as any[],
    } satisfies VisitorsSharedState;

    logger.debug(`Transforming ${filePath}, isServer: ${config.isServer}`);

    // TODO (AleksandrSl 02/12/2025): Can I pass state to the traverse here as well?
    const visitors = createBabelVisitors({
      visitorState,
    });

    traverse(ast, visitors);

    const output = generate(
      ast,
      {
        sourceMaps: true,
        retainLines: false,
      },
      code,
    );

    return {
      code: output.code,
      map: output.map,
      newEntries: visitorState.newEntries,
      transformed: visitorState.newEntries.length > 0,
    };
  } catch (error) {
    logger.error(`Failed to transform ${filePath}:`, error);
    // Return original code on error
    return {
      code,
      transformed: false,
    };
  }
}

/**
 * Check if a file should be transformed
 */
export function shouldTransformFile(
  filePath: string,
  config: LoaderConfig,
): boolean {
  // Only transform .tsx and .jsx files
  if (!filePath.match(/\.(tsx|jsx)$/)) {
    return false;
  }

  // Check skip patterns
  if (config.skipPatterns) {
    for (const pattern of config.skipPatterns) {
      if (pattern.test(filePath)) {
        return false;
      }
    }
  }

  return true;
}
