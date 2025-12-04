"use client";
import {
  TranslationProvider as BaseTranslationProvider,
  type TranslationProviderProps,
} from "../shared/TranslationContext";
import { useRouter } from "next/navigation";
import { logger } from "../../utils/logger";

export type { TranslationProviderProps };

export const createNextCookieLocaleResolver = () => {
  return (locale: string) => {
    logger.warn("Is not supposed to run on client");
    return locale;
  };
};

export const TranslationProvider = (props: TranslationProviderProps) => {
  // So far we are just injecting the router to reload server components when the locale changes.
  return <BaseTranslationProvider {...props} router={useRouter()} />;
};
