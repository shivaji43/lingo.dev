import {
  TranslationProvider as BaseTranslationProvider,
  type TranslationProviderProps,
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
  const { locale, translations } = await getServerTranslations({
    locale: initialLocale,
  });

  logger.debug(
    `Server. TranslationProvider. Initial locale: ${initialLocale}. Resolved locale: ${locale}. Translations: ${JSON.stringify(translations)}`,
  );

  return (
    <BaseTranslationProvider
      initialLocale={locale}
      initialTranslations={translations}
      {...rest}
    />
  );
}
