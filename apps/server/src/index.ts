/**
 * Automaker Backend Server
 *
 * Provides HTTP/WebSocket API for both web and Electron modes.
 * In Electron mode, this server runs locally.
 * In web mode, this server runs on a remote host.
 */

// Load environment variables FIRST, before any imports that depend on them
// (auth.ts reads AUTOMAKER_API_KEY at module load time)
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load .env from CWD (works with combined launcher from monorepo root)
dotenv.config();
// Also load from monorepo root as fallback (for workspace-based dev scripts
// where CWD is apps/server/ and the root .env isn't found by default)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../../.env') });

// Initialize Sentry EARLY (must be before other imports that might throw errors)
import { setupSentry } from './lib/sentry-setup.js';
setupSentry();

import { execSync } from 'node:child_process';
import express from 'express';
import { createServer } from 'http';
import { initAllowedPaths, loadProtoConfig } from '@protolabsai/platform';
import { createLogger, registerLogTransport } from '@protolabsai/utils';
import { MAX_SYSTEM_CONCURRENCY } from '@protolabsai/types';
import { createFileLogTransport } from './lib/server-log.js';
import { isTerminalEnabled, isTerminalPasswordRequired } from './routes/terminal/index.js';

import {
  setupMiddleware,
  setRequestLoggingEnabled,
  isRequestLoggingEnabled as _isRequestLoggingEnabled,
} from './server/middleware.js';
import { createServices } from './server/services.js';
import { wireServices } from './server/wiring.js';
import { registerRoutes } from './server/routes.js';
import { setupWebSockets } from './server/websockets.js';
import { runStartup } from './server/startup.js';
import { setupShutdown } from './server/shutdown.js';

// Register file log transport before creating any loggers that matter
registerLogTransport(createFileLogTransport());

const logger = createLogger('Server');

// Width for log box content (excluding borders)
const BOX_CONTENT_WIDTH = 67;

const PORT = parseInt(process.env.PORT || '3008', 10);
const HOST = process.env.HOST || '0.0.0.0';
const HOSTNAME = process.env.HOSTNAME || 'localhost';
const DATA_DIR = process.env.DATA_DIR || './data';
logger.info('[SERVER_STARTUP] process.env.DATA_DIR:', process.env.DATA_DIR);
logger.info('[SERVER_STARTUP] Resolved DATA_DIR:', DATA_DIR);
logger.info('[SERVER_STARTUP] process.cwd():', process.cwd());
logger.info(
  `[SERVER_STARTUP] MAX_SYSTEM_CONCURRENCY: ${MAX_SYSTEM_CONCURRENCY}${process.env.AUTOMAKER_MAX_CONCURRENCY ? ` (from AUTOMAKER_MAX_CONCURRENCY=${process.env.AUTOMAKER_MAX_CONCURRENCY})` : ' (default)'}`
);

// Determine the repository/project root directory
const REPO_ROOT =
  process.env.AUTOMAKER_PROJECT_PATH ||
  (() => {
    try {
      return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', timeout: 5000 }).trim();
    } catch {
      return process.cwd();
    }
  })();
logger.info('[SERVER_STARTUP] REPO_ROOT:', REPO_ROOT);

// Check for authentication (API key or OAuth/CLI auth)
if (process.env.ANTHROPIC_API_KEY) {
  logger.info('Claude auth: API key detected');
} else {
  // Check for OAuth/CLI auth before warning
  const { getClaudeAuthIndicators } = await import('@protolabsai/platform');
  const indicators = await getClaudeAuthIndicators();
  const hasOAuth =
    indicators.hasStatsCacheWithActivity ||
    (indicators.hasSettingsFile && indicators.hasProjectsSessions) ||
    !!indicators.credentials?.hasOAuthToken;

  if (hasOAuth) {
    logger.info('Claude auth: OAuth/CLI authentication detected');
  } else {
    const wHeader = 'WARNING: No Claude authentication configured'.padEnd(BOX_CONTENT_WIDTH);
    const w1 = 'The Claude Agent SDK requires authentication to function.'.padEnd(
      BOX_CONTENT_WIDTH
    );
    const w2 = 'Set your Anthropic API key:'.padEnd(BOX_CONTENT_WIDTH);
    const w3 = '  export ANTHROPIC_API_KEY="sk-ant-..."'.padEnd(BOX_CONTENT_WIDTH);
    const w4 = 'Or authenticate via: claude login'.padEnd(BOX_CONTENT_WIDTH);
    logger.warn(
      `\n╔${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╗\n║  ${wHeader}║\n╠${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╣\n║  ${w1}║\n║  ${w2}║\n║  ${w3}║\n║  ${w4}║\n╚${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╝`
    );
  }
}

// Initialize security
initAllowedPaths();

// Detect hivemind mode to decide whether to allow all CORS origins
const _protoConfig = await loadProtoConfig(REPO_ROOT).catch(() => null);
const _hivemindConfig = _protoConfig?.['hivemind'] as { enabled?: boolean } | undefined;
const hivemindEnabled = _hivemindConfig?.enabled === true;
if (hivemindEnabled) {
  logger.info('[SERVER_STARTUP] Hivemind enabled — CORS will accept requests from any origin');
}

// Create Express app and wire all server modules
const app = express();
setupMiddleware(app, { allowAllOrigins: hivemindEnabled });

const services = await createServices(DATA_DIR, REPO_ROOT);
await wireServices(services);
registerRoutes(app, services);

// Create HTTP server, configure WebSockets, start async initialization, register shutdown
const server = createServer(app);
setupWebSockets(server, services);
runStartup(services, setRequestLoggingEnabled).catch((err) =>
  logger.error('Startup sequence failed:', err)
);
setupShutdown(server, services);

// Start listening
server.listen(PORT, HOST, () => {
  const terminalStatus = !isTerminalEnabled()
    ? 'disabled'
    : isTerminalPasswordRequired()
      ? 'enabled (password protected)'
      : 'enabled';

  const sHeader = '🚀 Automaker Backend Server'.padEnd(BOX_CONTENT_WIDTH);
  const s1 = `Listening:    ${HOST}:${PORT}`.padEnd(BOX_CONTENT_WIDTH);
  const s2 = `HTTP API:     http://${HOSTNAME}:${PORT}`.padEnd(BOX_CONTENT_WIDTH);
  const s3 = `WebSocket:    ws://${HOSTNAME}:${PORT}/api/events`.padEnd(BOX_CONTENT_WIDTH);
  const s4 = `Terminal WS:  ws://${HOSTNAME}:${PORT}/api/terminal/ws`.padEnd(BOX_CONTENT_WIDTH);
  const s5 = `Health:       http://${HOSTNAME}:${PORT}/api/health`.padEnd(BOX_CONTENT_WIDTH);
  const s6 = `Terminal:     ${terminalStatus}`.padEnd(BOX_CONTENT_WIDTH);

  logger.info(`
╔═════════════════════════════════════════════════════════════════════╗
║  ${sHeader}║
╠═════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║  ${s1}║
║  ${s2}║
║  ${s3}║
║  ${s4}║
║  ${s5}║
║  ${s6}║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝
`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    const portStr = PORT.toString();
    const eHeader = `❌ ERROR: Port ${portStr} is already in use`.padEnd(BOX_CONTENT_WIDTH);
    const e1 = 'Another process is using this port. Options:'.padEnd(BOX_CONTENT_WIDTH);
    const e2 = `  Kill:        lsof -ti:${portStr} | xargs kill -9`.padEnd(BOX_CONTENT_WIDTH);
    const e3 = `  Other port:  PORT=${PORT + 1} npm run dev:server`.padEnd(BOX_CONTENT_WIDTH);
    const e4 = '  Use init.sh: ./init.sh (handles this automatically)'.padEnd(BOX_CONTENT_WIDTH);
    logger.error(
      `\n╔${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╗\n║  ${eHeader}║\n╠${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╣\n║  ${e1}║\n║  ${e2}║\n║  ${e3}║\n║  ${e4}║\n╚${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╝`
    );
    process.exit(1);
  } else {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
});

// Re-export for consumers that import setRequestLoggingEnabled from index.ts
export { setRequestLoggingEnabled, _isRequestLoggingEnabled as isRequestLoggingEnabled };
