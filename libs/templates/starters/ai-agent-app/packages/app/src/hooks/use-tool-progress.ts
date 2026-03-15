/**
 * useToolProgress — Subscribe to tool progress events from the WebSocket sideband.
 *
 * Opens a WebSocket connection to the tool-progress sideband server and
 * maintains a map of toolName → latest progress message string.
 *
 * The sideband is **optional** — if the WebSocket server is not running the
 * hook silently handles connection failures and returns empty state.  Chat
 * continues to function normally without progress updates.
 *
 * ## Usage
 *
 * ```tsx
 * const { getProgressByToolName } = useToolProgress();
 *
 * // Pass to ChatMessageList:
 * <ChatMessageList
 *   messages={messages}
 *   getToolProgressLabel={(toolCallId) => {
 *     const toolName = resolveToolName(toolCallId, messages);
 *     return getProgressByToolName(toolName);
 *   }}
 * />
 * ```
 *
 * ## WebSocket URL
 *
 * Defaults to `ws://localhost:3002` (the default `WS_PORT` of the sideband
 * server).  Override by passing a `wsUrl` argument or setting the
 * `VITE_WS_URL` environment variable in your `.env` file.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of events broadcast by the WebSocket sideband server. */
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

export interface UseToolProgressResult {
  /**
   * Latest progress message keyed by tool name.
   *
   * Example: `{ "get_weather": "Fetching forecast for London…" }`
   */
  progressByTool: Record<string, string>;

  /**
   * Look up the latest progress label for a given tool name.
   * Returns `undefined` when no progress has been received for the tool.
   */
  getProgressByToolName: (toolName: string) => string | undefined;

  /** Whether the WebSocket connection is currently open. */
  connected: boolean;
}

// ─── Default URL ──────────────────────────────────────────────────────────────

const DEFAULT_WS_URL =
  // Allow apps to override via VITE_WS_URL environment variable
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL) ||
  'ws://localhost:3002';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the WebSocket tool-progress sideband.
 *
 * @param wsUrl - WebSocket server URL (default: `ws://localhost:3002`)
 */
export function useToolProgress(wsUrl: string = DEFAULT_WS_URL): UseToolProgressResult {
  const [progressByTool, setProgressByTool] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | undefined;

    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      ws.onclose = () => {
        if (!cancelled) setConnected(false);
      };

      ws.onerror = () => {
        // Connection failed (e.g. sideband server not started) — no-op
        if (!cancelled) setConnected(false);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data) as ToolProgressEvent;
          if (data.type === 'tool:progress' && typeof data.toolName === 'string') {
            setProgressByTool((prev) => ({
              ...prev,
              [data.toolName]: data.message,
            }));
          }
        } catch {
          // Ignore malformed messages
        }
      };
    } catch {
      // WebSocket constructor threw (unsupported env, bad URL) — no-op
    }

    return () => {
      cancelled = true;
      wsRef.current = null;
      ws?.close();
    };
  }, [wsUrl]);

  const getProgressByToolName = useCallback(
    (toolName: string): string | undefined => progressByTool[toolName],
    [progressByTool]
  );

  return { progressByTool, getProgressByToolName, connected };
}
