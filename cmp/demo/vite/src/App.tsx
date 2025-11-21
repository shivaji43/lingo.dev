import { BrowserRouter, Link, Outlet, Route, Routes } from 'react-router';
import {
    getLocaleFromCookies,
    LocaleSwitcher,
    TranslationProvider,
    useTranslationContext
} from "@lingo.dev/_compiler/react";
import { PropsWithChildren, Suspense } from "react";


function Layout() {
    return (
        <div>
            <nav>
                <Link to="/">Home</Link> | <Link to="/about">About</Link>
            </nav>
            <main>
                <Outlet/>
            </main>
        </div>
    );
}

function Home() {
    const {
        locale,
        translations
    } = useTranslationContext()
    return (
        <div>
            <h1>Home Page</h1>
            <p>Current locale: {locale}</p>
            <p>Translations loaded: {JSON.stringify(translations)}</p>
        </div>
    );
}

function About() {
    return <h1>About Page8</h1>;
}

export function CookieTranslationProvider(props: PropsWithChildren) {
    const locale = getLocaleFromCookies();
    return <TranslationProvider initialLocale={locale}>
        {props.children}
    </TranslationProvider>;
}

export default function App() {
    return (
        <Suspense fallback={<div>Loading translations...</div>}>
            <div>
                <BrowserRouter>
                    <Routes>
                        <Route element={<Layout/>}>
                            <Route path="/" element={<Home/>}/>
                            <Route path="/about" element={<About/>}/>
                        </Route>
                    </Routes>
                </BrowserRouter>
                <LocaleSwitcher locales={[{
                    code: 'en',
                    label: 'English'
                }, {
                    code: 'de',
                    label: 'Deutsch'
                }]}/>
            </div>
        </Suspense>
    );
}
