import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import {
  getLocaleFromCookies,
  LocaleSwitcher,
  TranslationProvider,
} from "@lingo.dev/_compiler/react";
import "./app.css";

// TODO (AleksandrSl 29/11/2025): Fix the problem when TranslationProvider cannot be used in the root component.
function App(props: { locale: string }) {
  return (
    <html lang={props.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="font-sans antialiased">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <nav className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-blue-600">Acme</span>
            </div>

            <div className="flex gap-8 items-center">
              <a
                href="/"
                className="font-medium text-gray-700 hover:text-blue-600 transition-colors"
              >
                Home
              </a>
              <a
                href="/pricing"
                className="font-medium text-gray-700 hover:text-blue-600 transition-colors"
              >
                Pricing
              </a>
              <a
                href="/contact"
                className="font-medium text-gray-700 hover:text-blue-600 transition-colors"
              >
                Contact
              </a>
            </div>

            <LocaleSwitcher
              locales={[
                { code: "en", label: "English" },
                { code: "de", label: "Deutsch" },
                { code: "fr", label: "Français" },
                { code: "es", label: "Español" },
              ]}
            />
          </nav>
        </header>

        <main>
          <Outlet />
        </main>

        <footer className="bg-gray-900 text-white py-12 mt-16">
          <div className="max-w-7xl mx-auto px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div>
                <h3 className="text-xl font-bold mb-4">Acme</h3>
                <p className="text-gray-400">
                  Building the future, one line at a time.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Product</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>Features</li>
                  <li>Pricing</li>
                  <li>Documentation</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Company</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>About Us</li>
                  <li>Careers</li>
                  <li>Contact</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Legal</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>Privacy Policy</li>
                  <li>Terms of Service</li>
                  <li>Cookie Policy</li>
                </ul>
              </div>
            </div>
            <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
              <p>&copy; 2025 Acme Corporation. All rights reserved.</p>
            </div>
          </div>
        </footer>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  const locale = getLocaleFromCookies();

  return (
    <TranslationProvider initialLocale={locale}>
      <App locale={locale} />
    </TranslationProvider>
  );
}
