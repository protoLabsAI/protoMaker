/**
 * WebSocket sideband server — optional tool progress channel.
 *
 * Runs alongside the Express HTTP server to stream `tool:progress` events to
 * connected browser clients in real time.  The sideband is completely optional:
 * if the server is never started (or no clients connect), all `broadcast()`
 * calls are silent no-ops and chat continues to work normally via HTTP/SSE.
 *
 * ## Quick start
 *
 * In your server entry point (index.ts), call `startWebSocketServer()` after
 * the HTTP server is listening:
 *
 * ```typescript
 * import { startWebSocketServer } from './ws.js';
 *
 * const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
 * app.listen(PORT, () => {
 *   // Optional: start WS sideband on WS_PORT (default 3002)
 *   startWebSocketServer();
 * });
 * ```
 *
 * Clients can connect to `ws://localhost:<WS_PORT>` and will receive
 * `ToolProgressEvent` payloads as JSON strings.
 */

import { WebSocketServer, WebSocket } from 'ws';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Payload emitted to WebSocket clients for each tool progress update. */
export interface ToolProgressEvent {
  /** Discriminator — always `"tool:progress"`. */
  type: 'tool:progress';
  /** Name of the tool emitting the update. */
  toolName: string;
  /** Human-readable status message (e.g. "Fetching results…"). */
  message: string;
  /** Unix timestamp (ms) when this event was created. */
  timestamp: number;
  /** Optional structured payload — tool-specific metadata. */
  data?: unknown;
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _wss: WebSocketServer | null = null;
const _clients = new Set<WebSocket>();

// ─── Server lifecycle ─────────────────────────────────────────────────────────

/**
 * Start the WebSocket sideband server.
 *
 * Reads the port from the `WS_PORT` environment variable (default: `3002`).
 * Calling this more than once returns the existing server without creating a
 * duplicate.
 *
 * @returns The `WebSocketServer` instance.
 */
export function startWebSocketServer(
  port: number = parseInt(process.env['WS_PORT'] ?? '3002', 10)
): WebSocketServer {
  if (_wss) return _wss;

  _wss = new WebSocketServer({ port });

  _wss.on('connection', (ws: WebSocket) => {
    _clients.add(ws);

    ws.on('close', () => _clients.delete(ws));
    ws.on('error', () => _clients.delete(ws));
  });

  _wss.on('listening', () => {
    console.log(`WebSocket sideband listening on ws://localhost:${port}`);
  });

  _wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`WebSocket port ${port} already in use — sideband disabled`);
      _wss = null;
    } else {
      console.error('WebSocket server error:', err);
    }
  });

  return _wss;
}

/**
 * Stop the WebSocket server and close all client connections.
 * Primarily useful for graceful shutdown and testing.
 */
export function stopWebSocketServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!_wss) {
      resolve();
      return;
    }
    for (const ws of _clients) {
      ws.terminate();
    }
    _clients.clear();
    _wss.close((err) => {
      _wss = null;
      if (err) reject(err);
      else resolve();
    });
  });
}

// ─── Broadcasting ─────────────────────────────────────────────────────────────

/**
 * Broadcast a `ToolProgressEvent` to all connected WebSocket clients.
 *
 * **No-op** when:
 * - The WebSocket server has not been started (`startWebSocketServer()` was
 *   never called), or
 * - No clients are currently connected.
 *
 * This guarantee ensures that chat functions correctly without the sideband.
 */
export function broadcastProgress(event: ToolProgressEvent): void {
  if (_clients.size === 0) return;

  const payload = JSON.stringify(event);

  for (const ws of _clients) {
    // WebSocket.OPEN === 1; compare numerically to avoid importing the enum
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Return the number of currently connected WebSocket clients.
 * Useful for conditional logic in tools (e.g. skip heavy progress reporting
 * when no clients are listening).
 */
export function connectedClientCount(): number {
  return _clients.size;
}
