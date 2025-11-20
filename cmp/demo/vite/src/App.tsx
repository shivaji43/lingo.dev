import { BrowserRouter, Routes, Route, Link, Outlet } from 'react-router';
import { useLingoCompiler } from '@compiler/core/react';

function Layout() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link> | <Link to="/about">About</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

function Home() {
  const { locale, translations } = useLingoCompiler();
  return (
    <div>
      <h1>Home Page</h1>
      <p>Current locale: {locale}</p>
      <p>Translations loaded: {JSON.stringify(translations)}</p>
    </div>
  );
}

function About() {
  return <h1>About Page</h1>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
