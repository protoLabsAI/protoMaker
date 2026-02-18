import * as path from 'path';
import * as fs from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version;

export default defineConfig(({ command }) => {
  // Skip electron plugin when VITE_SKIP_ELECTRON is set (Docker web/storybook builds)
  // or during dev server in CI (no display available for Electron).
  // Electron desktop builds (build:electron) don't set this env var.
  const skipElectron =
    process.env.VITE_SKIP_ELECTRON === 'true' || (command === 'serve' && process.env.CI === 'true');

  return {
    plugins: [
      // Only include electron plugin when not in CI/headless dev mode
      ...(skipElectron
        ? []
        : [
            electron({
              main: {
                entry: 'src/main.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
              preload: {
                input: 'src/preload.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
            }),
          ]),
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
      tailwindcss(),
      react(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@protolabs/ui': path.resolve(__dirname, '../../libs/ui/src'),
      },
    },
    server: {
      host: process.env.HOST || '0.0.0.0',
      port: parseInt(process.env.TEST_PORT || '3007', 10),
      allowedHosts: true,
      proxy: {
        '/api': {
          target: process.env.VITE_SERVER_URL || 'http://localhost:3008',
          changeOrigin: true,
          ws: true,
        },
      },
      watch: {
        // Ignore automaker data directories to prevent hot reload during agent work
        // Use absolute paths since Vite runs from apps/ui/
        ignored: [
          path.resolve(__dirname, '../../.automaker/**'),
          path.resolve(__dirname, '../../.worktrees/**'),
        ],
      },
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        external: [
          'child_process',
          'fs',
          'path',
          'crypto',
          'http',
          'net',
          'os',
          'util',
          'stream',
          'events',
          'readline',
        ],
      },
    },
    optimizeDeps: {
      exclude: ['@automaker/platform'],
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
  };
});
