import * as path from 'path';
import * as fs from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'url';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version;

export default defineConfig(({ command }) => {
  return {
    plugins: [
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
      tailwindcss(),
      react(),
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
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /\/assets\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: `static-assets-${Date.now()}`,
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: `api-cache-${Date.now()}`,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60,
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
      // Sentry plugin must be LAST - uploads source maps after build
      ...(command === 'build' &&
      process.env.SENTRY_AUTH_TOKEN &&
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              authToken: process.env.SENTRY_AUTH_TOKEN,
              sourcemaps: {
                assets: './dist/**',
                ignore: ['node_modules'],
              },
              release: {
                name: `protolabs-studio@${appVersion}`,
              },
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
        ignored: [
          path.resolve(__dirname, '../../.automaker/**'),
          path.resolve(__dirname, '../../.worktrees/**'),
        ],
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: 'hidden',
    },
    optimizeDeps: {
      exclude: ['@protolabsai/platform'],
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
  };
});
