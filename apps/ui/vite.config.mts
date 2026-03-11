import * as path from 'path';
import * as fs from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'url';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';

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
      // PWA: in web mode, use the real plugin; in Electron mode, stub the virtual
      // modules so imports resolve without error in dev server.
      ...(skipElectron
        ? [
            VitePWA({
              registerType: 'prompt',
              includeAssets: ['favicon.ico', 'logo_larger.png'],
              manifest: {
                name: 'protoLabs.studio',
                short_name: 'protoLabs',
                description: 'Autonomous AI Development Studio',
                theme_color: '#0a0a0a',
                background_color: '#0a0a0a',
                display: 'standalone',
                icons: [
                  {
                    src: '/logo_larger.png',
                    sizes: '512x512',
                    type: 'image/png',
                  },
                ],
              },
              workbox: {
                // Allow larger files to be cached (default is 2MB)
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
                // Shell-first strategy for SPA shell
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//],
                runtimeCaching: [
                  {
                    // Cache-first for static hashed assets (js/css/fonts)
                    urlPattern: /\/assets\/.*/i,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: `static-assets-${Date.now()}`,
                      expiration: {
                        maxEntries: 500,
                        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                      },
                      cacheableResponse: {
                        statuses: [0, 200],
                      },
                    },
                  },
                  {
                    // Network-first for API routes
                    urlPattern: /^\/api\/.*/i,
                    handler: 'NetworkFirst',
                    options: {
                      cacheName: `api-cache-${Date.now()}`,
                      expiration: {
                        maxEntries: 100,
                        maxAgeSeconds: 60 * 60, // 1 hour
                      },
                      networkTimeoutSeconds: 10,
                      cacheableResponse: {
                        statuses: [0, 200],
                      },
                    },
                  },
                ],
              },
            }),
          ]
        : [
            {
              name: 'pwa-virtual-stub',
              resolveId(id: string) {
                if (id === 'virtual:pwa-register/react' || id === 'virtual:pwa-register') {
                  return `\0${id}`;
                }
              },
              load(id: string) {
                if (id === '\0virtual:pwa-register/react') {
                  return 'export function useRegisterSW() { return { needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} }; }';
                }
                if (id === '\0virtual:pwa-register') {
                  return 'export function registerSW() { return () => {}; }';
                }
              },
            },
          ]),
      // Sentry plugin must be LAST - uploads source maps after build
      // Only in production builds when SENTRY_AUTH_TOKEN is available
      ...(command === 'build' &&
      process.env.SENTRY_AUTH_TOKEN &&
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT_ELECTRON
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT_ELECTRON,
              authToken: process.env.SENTRY_AUTH_TOKEN,
              sourcemaps: {
                assets: './dist/**',
                ignore: ['node_modules'],
              },
              release: {
                name: `automaker-electron@${appVersion}`,
              },
              // Disable telemetry
              telemetry: false,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@protolabsai/ui': path.resolve(__dirname, '../../libs/ui/src'),
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
      // Generate source maps for Sentry (hidden - not exposed publicly)
      sourcemap: 'hidden',
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
          // Add PWA virtual modules as external in Electron mode
          // They won't be imported at runtime since isWebMode checks prevent it
          ...(skipElectron ? [] : ['virtual:pwa-register', 'virtual:pwa-register/react']),
        ],
      },
    },
    optimizeDeps: {
      exclude: ['@protolabsai/platform'],
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
  };
});
