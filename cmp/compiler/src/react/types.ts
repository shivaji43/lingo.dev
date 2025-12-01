import { type ReactNode } from "react";
import { type RichTextParams } from "./render-rich-text";

export type TranslationHook = (
  hashes: string[],
  serverUrl?: string,
) => TranslationFunction;

/**
 * Translation function type
 */
export type TranslationFunction = (
  hash: string,
  source: string,
  params?: RichTextParams,
) => string | ReactNode;
