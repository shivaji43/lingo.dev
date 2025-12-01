"use client";

import { TranslationProvider, TranslationProviderProps } from "../";
import { useRouter } from "next/navigation";

/**
 * Next.js-specific Translation Provider
 *
 * @example
 * ```tsx
 * // app/layout.tsx (Server Component)
 * import { getServerTranslations } from '@lingo.dev/_compiler-beta/react/server';
 * import { NextTranslationProvider } from '@lingo.dev/_compiler-beta/react';
 *
 * export default async function RootLayout({ children }) {
 *   const { locale, t } = await getServerTranslations();
 *
 *   return (
 *     <html>
 *       <body>
 *         <NextTranslationProvider
 *           initialLocale={locale}
 *           initialTranslations={translations}
 *         >
 *           {children}
 *         </NextTranslationProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export const NextTranslationProvider = (props: TranslationProviderProps) => {
  // So far we are just injecting the router to reload server components when the locale changes.
  return <TranslationProvider {...props} router={useRouter()} />;
};
