// Initialize Sentry for Electron renderer process FIRST (before React)
import { init as initSentryRenderer } from '@sentry/electron/renderer';

// Initialize immediately with environment variables
// @ts-expect-error - window.process is injected by Electron preload
if (window.process?.env?.SENTRY_DSN_ELECTRON && window.process?.env?.SENTRY_ENABLED !== 'false') {
  try {
    initSentryRenderer({
      // @ts-expect-error - window.process is injected by Electron preload
      dsn: window.process.env.SENTRY_DSN_ELECTRON,
      // @ts-expect-error - window.process is injected by Electron preload
      environment: window.process.env.NODE_ENV || 'production',
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  } catch (error) {
    // Never let Sentry initialization crash the app
    console.error('[Sentry] Failed to initialize Electron renderer:', error);
  }
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
