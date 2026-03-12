// WebSocket server setup: /api/events SSE bus and /api/terminal/ws PTY handler

import type * as http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import cookie from 'cookie';
import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from './services.js';
import { getTerminalService } from '../services/terminal-service.js';
import { validateWsConnectionToken, checkRawAuthentication } from '../lib/auth.js';
import {
  isTerminalEnabled,
  isTerminalPasswordRequired,
  validateTerminalToken,
} from '../routes/terminal/index.js';

const logger = createLogger('Server:WebSockets');

// WebSocket backpressure threshold (256KB)
const WS_BACKPRESSURE_THRESHOLD = 256 * 1024;

// Minimum 100ms between resize operations (prevents resize storm)
const RESIZE_MIN_INTERVAL_MS = 100;

/**
 * Authenticate WebSocket upgrade requests.
 * Checks for API key in header/query, session token in header/query, OR valid session cookie.
 */
function authenticateWebSocket(request: http.IncomingMessage): boolean {
  const url = new URL(request.url || '', `http://${request.headers.host}`);

  // Convert URL search params to query object
  const query: Record<string, string | undefined> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // Parse cookies from header
  const cookieHeader = request.headers.cookie;
  const cookies = cookieHeader ? cookie.parse(cookieHeader) : {};

  // Use shared authentication logic for standard auth methods
  if (
    checkRawAuthentication(
      request.headers as Record<string, string | string[] | undefined>,
      query,
      cookies
    )
  ) {
    return true;
  }

  // Additionally check for short-lived WebSocket connection token (WebSocket-specific)
  const wsToken = url.searchParams.get('wsToken');
  if (wsToken && validateWsConnectionToken(wsToken)) {
    return true;
  }

  return false;
}

/**
 * Set up both WebSocket servers (events bus + terminal) sharing a single http.Server upgrade handler.
 */
export function setupWebSockets(server: http.Server, services: ServiceContainer): void {
  const { events } = services;
  const terminalService = getTerminalService();

  // Both WSS instances use noServer mode to share the upgrade handler
  const wss = new WebSocketServer({ noServer: true });
  const terminalWss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade requests manually to route to correct WebSocket server
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

    // Authenticate all WebSocket connections
    if (!authenticateWebSocket(request)) {
      logger.info('Authentication failed, rejecting connection');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (pathname === '/api/events') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/api/terminal/ws') {
      terminalWss.handleUpgrade(request, socket, head, (ws) => {
        terminalWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Route scheduler:task-failed events to Discord #infra channel (non-fatal)
  const DISCORD_INFRA_CHANNEL = '1469109809939742814';
  events.on('scheduler:task-failed', (payload) => {
    const { discordBotService } = services;
    if (!discordBotService?.isConnected()) return;
    const p = payload as { taskId: string; taskName: string; error: string; timestamp: string };
    const message = `Scheduler task failed: **${p.taskName}** (${p.taskId})\nError: ${p.error}\nTime: ${p.timestamp}`;
    discordBotService.sendToChannel(DISCORD_INFRA_CHANNEL, message).catch((err: Error) => {
      logger.warn('Failed to send scheduler:task-failed to Discord:', err.message);
    });
  });

  // Events WebSocket connection handler
  wss.on('connection', (ws: WebSocket) => {
    logger.info('Client connected, ready state:', ws.readyState);

    // Subscribe to all events and forward to this client
    const unsubscribe = events.subscribe((type, payload) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // Check backpressure before sending
          if (ws.bufferedAmount > WS_BACKPRESSURE_THRESHOLD) {
            logger.warn('WebSocket backpressure, dropping event:', type);
            return;
          }

          const message = JSON.stringify({ type, payload });
          ws.send(message);
        } catch (err) {
          logger.warn('Failed to send WebSocket message:', {
            type,
            error: (err as Error).message,
          });
        }
      }
    });

    // Re-emit pending HITL forms so the UI dialog queue is restored after page refresh/reconnect
    services.hitlFormService.reEmitPending();

    ws.on('close', () => {
      logger.info('Client disconnected');
      unsubscribe();
    });

    ws.on('error', (error) => {
      logger.error('ERROR:', error);
      unsubscribe();
    });
  });

  // Track WebSocket connections per session
  const terminalConnections: Map<string, Set<WebSocket>> = new Map();
  // Track last resize dimensions per session to deduplicate resize messages
  const lastResizeDimensions: Map<string, { cols: number; rows: number }> = new Map();
  // Track last resize timestamp to rate-limit resize operations (prevents resize storm)
  const lastResizeTime: Map<string, number> = new Map();

  // Clean up resize tracking when sessions actually exit (not just when connections close)
  terminalService.onExit((sessionId) => {
    lastResizeDimensions.delete(sessionId);
    lastResizeTime.delete(sessionId);
    terminalConnections.delete(sessionId);
  });

  // Terminal WebSocket connection handler
  terminalWss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    // Parse URL to get session ID and token
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    const token = url.searchParams.get('token');

    logger.info(`Connection attempt for session: ${sessionId}`);

    // Check if terminal is enabled
    if (!isTerminalEnabled()) {
      logger.info('Terminal is disabled');
      ws.close(4003, 'Terminal access is disabled');
      return;
    }

    // Validate token if password is required
    if (isTerminalPasswordRequired() && !validateTerminalToken(token || undefined)) {
      logger.info('Invalid or missing token');
      ws.close(4001, 'Authentication required');
      return;
    }

    if (!sessionId) {
      logger.info('No session ID provided');
      ws.close(4002, 'Session ID required');
      return;
    }

    // Check if session exists
    const session = terminalService.getSession(sessionId);
    if (!session) {
      logger.info(`Session ${sessionId} not found`);
      ws.close(4004, 'Session not found');
      return;
    }

    logger.info(`Client connected to session ${sessionId}`);

    // Track this connection
    if (!terminalConnections.has(sessionId)) {
      terminalConnections.set(sessionId, new Set());
    }
    terminalConnections.get(sessionId)!.add(ws);

    // Send initial connection success FIRST
    ws.send(
      JSON.stringify({
        type: 'connected',
        sessionId,
        shell: session.shell,
        cwd: session.cwd,
      })
    );

    // Send scrollback buffer BEFORE subscribing to prevent race condition
    // Also clear pending output buffer to prevent duplicates from throttled flush
    const scrollback = terminalService.getScrollbackAndClearPending(sessionId);
    if (scrollback && scrollback.length > 0) {
      ws.send(
        JSON.stringify({
          type: 'scrollback',
          data: scrollback,
        })
      );
    }

    // NOW subscribe to terminal data (after scrollback is sent)
    const unsubscribeData = terminalService.onData((sid, data) => {
      if (sid === sessionId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    // Subscribe to terminal exit
    const unsubscribeExit = terminalService.onExit((sid, exitCode) => {
      if (sid === sessionId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', exitCode }));
        ws.close(1000, 'Session ended');
      }
    });

    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());

        switch (msg.type) {
          case 'input':
            // Validate input data type and length
            if (typeof msg.data !== 'string') {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid input type' }));
              break;
            }
            // Limit input size to 1MB to prevent memory issues
            if (msg.data.length > 1024 * 1024) {
              ws.send(JSON.stringify({ type: 'error', message: 'Input too large' }));
              break;
            }
            // Write user input to terminal
            terminalService.write(sessionId, msg.data);
            break;

          case 'resize':
            // Validate resize dimensions are positive integers within reasonable bounds
            if (
              typeof msg.cols !== 'number' ||
              typeof msg.rows !== 'number' ||
              !Number.isInteger(msg.cols) ||
              !Number.isInteger(msg.rows) ||
              msg.cols < 1 ||
              msg.cols > 1000 ||
              msg.rows < 1 ||
              msg.rows > 500
            ) {
              break; // Silently ignore invalid resize requests
            }
            // Resize terminal with deduplication and rate limiting
            if (msg.cols && msg.rows) {
              const now = Date.now();
              const lastTime = lastResizeTime.get(sessionId) || 0;
              const lastDimensions = lastResizeDimensions.get(sessionId);

              // Skip if resized too recently (prevents resize storm during splits)
              if (now - lastTime < RESIZE_MIN_INTERVAL_MS) {
                break;
              }

              // Check if dimensions are different from last resize
              if (
                !lastDimensions ||
                lastDimensions.cols !== msg.cols ||
                lastDimensions.rows !== msg.rows
              ) {
                // Only suppress output on subsequent resizes, not the first one
                // The first resize happens on terminal open and we don't want to drop the initial prompt
                const isFirstResize = !lastDimensions;
                terminalService.resize(sessionId, msg.cols, msg.rows, !isFirstResize);
                lastResizeDimensions.set(sessionId, {
                  cols: msg.cols,
                  rows: msg.rows,
                });
                lastResizeTime.set(sessionId, now);
              }
            }
            break;

          case 'ping':
            // Respond to ping
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

          default:
            logger.warn(`Unknown message type: ${msg.type}`);
        }
      } catch (error) {
        logger.error('Error processing message:', error);
      }
    });

    ws.on('close', () => {
      logger.info(`Client disconnected from session ${sessionId}`);
      unsubscribeData();
      unsubscribeExit();

      // Remove from connections tracking
      const connections = terminalConnections.get(sessionId);
      if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
          terminalConnections.delete(sessionId);
          // DON'T delete lastResizeDimensions/lastResizeTime here!
          // The session still exists, and reconnecting clients need to know
          // this isn't the "first resize" to prevent duplicate prompts.
          // These get cleaned up when the session actually exits.
        }
      }
    });

    ws.on('error', (error) => {
      logger.error(`Error on session ${sessionId}:`, error);
      unsubscribeData();
      unsubscribeExit();
    });
  });
}
