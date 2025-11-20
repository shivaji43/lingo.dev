import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import compiler from '@compiler/core/vite';

export default defineConfig({
  plugins: [compiler({}), react()],
});
