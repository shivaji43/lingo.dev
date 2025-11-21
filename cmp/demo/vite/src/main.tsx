import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { CookieTranslationProvider } from './App';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <CookieTranslationProvider>
            <App/>
        </CookieTranslationProvider>
    </StrictMode>
);
