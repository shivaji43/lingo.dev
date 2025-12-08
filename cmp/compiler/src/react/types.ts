import { type ReactNode } from "react";
import { type RichTextParams } from "./shared/render-rich-text";

export type TranslationHook = (hashes: string[]) => {
  t: TranslationFunction;
  locale: string;
};

/**
 * Translation function type
 */
export type TranslationFunction = (
  hash: string,
  source: string,
  params?: RichTextParams,
) => string | ReactNode;
