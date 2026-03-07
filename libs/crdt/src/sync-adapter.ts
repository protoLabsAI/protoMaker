/**
 * WebSocket sync adapter for Tailscale peer connections.
 *
 * Provides factory functions for creating automerge-repo network adapters
 * that connect to peers via WebSocket (typically over Tailscale IPs).
 */

import { WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';

// WebSocketServerAdapter is imported for use when acting as a server node.
// The server must create a ws.WebSocketServer and pass it to createSyncServer().
export { WebSocketServerAdapter } from '@automerge/automerge-repo-network-websocket';

const DEFAULT_RETRY_INTERVAL_MS = 5000;

/**
 * Create a client-side WebSocket sync adapter that connects to a peer.
 *
 * @param url - WebSocket URL of the peer (e.g., ws://100.x.x.x:PORT for Tailscale)
 * @param retryIntervalMs - Reconnect interval on disconnect. Default: 5000ms
 */
export function createSyncClientAdapter(
  url: string,
  retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS
): WebSocketClientAdapter {
  return new WebSocketClientAdapter(url, retryIntervalMs);
}

/**
 * Type alias for the ws WebSocketServer used by WebSocketServerAdapter.
 * Consumers can import WebSocketServerAdapter directly and construct it
 * with their own ws.Server instance:
 *
 *   import { WebSocketServerAdapter } from '@protolabsai/crdt';
 *   import { WebSocketServer } from 'ws';
 *   const wss = new WebSocketServer({ port: 8080 });
 *   const adapter = new WebSocketServerAdapter(wss);
 */
export type { WebSocketClientAdapter };
