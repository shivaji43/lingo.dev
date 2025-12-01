import {
  TranslationProvider as BaseTranslationProvider,
  TranslationProviderProps,
} from "./client";
import { getServerTranslations } from "../server-only";
import { logger } from "../../utils/logger";
import { createNextCookieLocaleResolver } from "./cookie-locale-resolver";

export { createNextCookieLocaleResolver };

export async function TranslationProvider({
  initialLocale,
  initialTranslations = {},
  ...rest
}: TranslationProviderProps) {
  logger.debug(
    `Server. TranslationProvider. Provided locale: ${initialLocale}`,
  );
  const { locale, translations } = await getServerTranslations({
    locale: initialLocale,
  });

  return (
    <BaseTranslationProvider
      initialLocale={locale}
      initialTranslations={translations}
      {...rest}
    />
  );
}
