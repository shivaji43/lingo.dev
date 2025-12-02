import { type ReactNode } from "react";
import { type RichTextParams } from "./shared/render-rich-text";

export type TranslationHook = (hashes: string[]) => TranslationFunction;

/**
 * Translation function type
 */
export type TranslationFunction = (
  hash: string,
  source: string,
  params?: RichTextParams,
) => string | ReactNode;
