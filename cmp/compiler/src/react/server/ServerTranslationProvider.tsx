import {
  TranslationProvider as BaseTranslationProvider,
  TranslationProviderProps,
} from "../shared/TranslationContext";
import { getServerTranslations } from "../server-only";
import { logger } from "../../utils/logger";

export async function TranslationProvider({
  initialLocale,
  initialTranslations = {},
  ...rest
}: TranslationProviderProps) {
  const { locale, translations } = await getServerTranslations({
    locale: initialLocale,
  });

  logger.debug(`Server. TranslationProvider. Resolved locale: ${locale}`);

  return (
    <BaseTranslationProvider
      initialLocale={locale}
      initialTranslations={translations}
      {...rest}
    />
  );
}
