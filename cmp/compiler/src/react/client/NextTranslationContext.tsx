"use client";

import {
  TranslationProvider,
  TranslationProviderProps,
} from "./TranslationContext";
import { useRouter } from "next/navigation";

// TODO (AleksandrSl 21/11/2025): Is it a temporary solution? Check next-intl
export const NextTranslationProvider = (props: TranslationProviderProps) => {
  return <TranslationProvider {...props} router={useRouter()} />;
};
