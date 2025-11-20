import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { LingoCompiler } from '@compiler/core/react';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div>Loading translations...</div>}>
      <LingoCompiler locale="en">
        <App />
      </LingoCompiler>
    </Suspense>
  </StrictMode>
);
