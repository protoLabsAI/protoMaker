import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite configuration for the AI Agent App frontend.
 *
 * In development, the Vite dev server proxies /api/* requests to the Express
 * backend running on port 3001.  In production, ensure the backend and frontend
 * are served from the same origin or configure CORS accordingly.
 */
export default defineConfig({
  plugins: [tailwindcss(), react()],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
