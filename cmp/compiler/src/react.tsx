import {
  createContext,
  use,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

interface LingoCompilerContextValue {
  locale: string;
  translations: Record<string, any>;
}

const LingoCompilerContext = createContext<LingoCompilerContextValue | null>(null);

interface LingoCompilerProps {
  locale: string;
  children: ReactNode;
}

// Cache to prevent duplicate fetches
const translationCache = new Map<string, Promise<Record<string, any>>>();

function fetchTranslations(locale: string): Promise<Record<string, any>> {
  if (translationCache.has(locale)) {
    return translationCache.get(locale)!;
  }

  const isDev = process.env.NODE_ENV === 'development';
  const url = isDev
    ? `http://localhost:3001/i18n?locale=${locale}`
    : `/i18n/${locale}.json`;

  const promise = fetch(url).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to fetch translations for locale: ${locale}`);
    }
    return res.json();
  });

  translationCache.set(locale, promise);
  return promise;
}

export function LingoCompiler({ locale, children }: LingoCompilerProps) {
  const i18nPromise = useMemo(() => fetchTranslations(locale), [locale]);
  const translations = use(i18nPromise);

  return (
    <LingoCompilerContext.Provider value={{ locale, translations }}>
      {children}
    </LingoCompilerContext.Provider>
  );
}

export function useLingoCompiler() {
  const context = useContext(LingoCompilerContext);
  if (!context) {
    throw new Error('useLingoCompiler must be used within LingoCompiler');
  }
  return context;
}
