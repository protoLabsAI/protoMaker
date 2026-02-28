// Initialize Sentry for Electron renderer process FIRST (before React)
import { init as initSentryRenderer } from '@sentry/electron/renderer';

// Initialize immediately with environment variables
if (
  (window as unknown as Record<string, unknown>).process &&
  ((window as unknown as Record<string, unknown>).process as Record<string, Record<string, string>>)
    ?.env?.SENTRY_DSN_ELECTRON &&
  ((window as unknown as Record<string, unknown>).process as Record<string, Record<string, string>>)
    ?.env?.SENTRY_ENABLED !== 'false'
) {
  try {
    const proc = (window as unknown as Record<string, unknown>).process as Record<
      string,
      Record<string, string>
    >;
    initSentryRenderer({
      dsn: proc.env.SENTRY_DSN_ELECTRON,
      environment: proc.env.NODE_ENV || 'production',
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
