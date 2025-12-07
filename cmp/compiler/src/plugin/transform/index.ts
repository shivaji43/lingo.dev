import * as parser from "@babel/parser";
import path from "path";
import type { LingoConfig, TranslationEntry } from "../../types";
import { processFile } from "./process-file";
import { logger } from "../../utils/logger";
import { generate } from "./babel-compat";

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
  config: LingoConfig;
}

/**
 * Transform component code to inject translation calls
 */
export function transformComponent({
  code,
  filePath,
  config,
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

    logger.debug(`Transforming ${filePath}`);

    const translationEntries = processFile(ast, {
      relativeFilePath,
      needsDirective: config.useDirective,
    });

    const output = generate(
      ast,
      {
        sourceMaps: true,
      },
      code,
    );

    logger.debug(`Transformed ${filePath}. Code: ${output.code}`);

    return {
      code: output.code,
      map: output.map,
      newEntries: translationEntries,
      transformed: translationEntries.length > 0,
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
  config: LingoConfig,
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
