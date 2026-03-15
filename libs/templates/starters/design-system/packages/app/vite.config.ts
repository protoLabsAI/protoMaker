import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    open: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
