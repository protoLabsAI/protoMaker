/**
 * Base HTTP client with WebSocket infrastructure and HTTP helpers.
 *
 * Domain-specific client mixins extend this class via the mixin pattern:
 *   export const withFooClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
 *     class extends Base { foo = { ... }; };
 */
import { createLogger } from '@protolabsai/utils/logger';
import {
  getApiKey,
  getSessionToken,
  waitForApiKeyInit,
  isElectronMode,
  handleUnauthorized,
  getServerUrl,
  NO_STORE_CACHE_MODE,
} from './auth';

const logger = createLogger('HttpClient');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS2545 requires any[] for mixin constructors
export type Constructor<T = object> = new (...args: any[]) => T;

export type EventType =
  | 'agent:stream'
  | 'auto-mode:event'
  | 'suggestions:event'
  | 'spec-regeneration:event'
  | 'issue-validation:event'
  | 'backlog-plan:event'
  | 'worktree:init-started'
  | 'worktree:init-output'
  | 'worktree:init-completed'
  | 'dev-server:started'
  | 'dev-server:output'
  | 'dev-server:stopped'
  | 'notification:created'
  | 'hitl:form-requested'
  | 'hitl:form-responded'
  | 'actionable-item:created'
  | 'actionable-item:status-changed'
  | 'chat:tool-progress'
  | 'scheduler:task-failed'
  | 'feature:created'
  | 'feature:updated'
  | 'feature:deleted'
  | 'feature:status-changed';

export type EventCallback = (payload: unknown) => void;

export class BaseHttpClient {
  protected serverUrl: string;
  private ws: WebSocket | null = null;
  private eventCallbacks: Map<EventType, Set<EventCallback>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private isConnecting = false;
  private recentEventIds: Set<string> = new Set();
  private eventIdOrder: string[] = [];
  private readonly MAX_DEDUP_ENTRIES = 1000;
  private readonly EVICT_BATCH_SIZE = 200;

  constructor() {
    this.serverUrl = getServerUrl();
    if (isElectronMode()) {
      waitForApiKeyInit()
        .then(() => {
          this.connectWebSocket();
        })
        .catch((error) => {
          logger.error('API key initialization failed:', error);
          this.connectWebSocket();
        });
    }
  }

  // -- WebSocket infrastructure -----------------------------------------------

  private async fetchWsToken(): Promise<string | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sessionToken = getSessionToken();
      if (sessionToken) headers['X-Session-Token'] = sessionToken;

      const response = await fetch(`${this.serverUrl}/api/auth/token`, {
        headers,
        credentials: 'include',
        cache: NO_STORE_CACHE_MODE,
      });
      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return null;
      }
      if (!response.ok) {
        logger.warn('Failed to fetch wsToken:', response.status);
        return null;
      }
      const data = await response.json();
      return data.success && data.token ? data.token : null;
    } catch (error) {
      logger.error('Error fetching wsToken:', error);
      return null;
    }
  }

  private connectWebSocket(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;
    this.isConnecting = true;
    waitForApiKeyInit()
      .then(() => this.doConnectWebSocketInternal())
      .catch((error) => {
        logger.error('Failed to initialize for WebSocket connection:', error);
        this.isConnecting = false;
      });
  }

  private doConnectWebSocketInternal(): void {
    if (isElectronMode()) {
      const apiKey = getApiKey();
      if (!apiKey) {
        logger.warn('Electron mode: API key missing, attempting wsToken/cookie auth for WebSocket');
        this.fetchWsToken()
          .then((wsToken) => {
            const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/api/events';
            if (wsToken) {
              this.establishWebSocket(`${wsUrl}?wsToken=${encodeURIComponent(wsToken)}`);
            } else {
              logger.warn('No wsToken available, attempting WebSocket connection anyway');
              this.establishWebSocket(wsUrl);
            }
          })
          .catch((error) => {
            logger.error('Failed to prepare WebSocket connection (electron fallback):', error);
            this.isConnecting = false;
          });
        return;
      }
      const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/api/events';
      this.establishWebSocket(`${wsUrl}?apiKey=${encodeURIComponent(apiKey)}`);
      return;
    }

    this.fetchWsToken()
      .then((wsToken) => {
        const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/api/events';
        if (wsToken) {
          this.establishWebSocket(`${wsUrl}?wsToken=${encodeURIComponent(wsToken)}`);
        } else {
          logger.warn('No wsToken available, attempting connection anyway');
          this.establishWebSocket(wsUrl);
        }
      })
      .catch((error) => {
        logger.error('Failed to prepare WebSocket connection:', error);
        this.isConnecting = false;
      });
  }

  private establishWebSocket(wsUrl: string): void {
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        logger.info('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempt = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!this.checkAndTrackEventId(data.type, data.payload, data.id || data.eventId)) return;
          logger.info(
            'WebSocket message:',
            data.type,
            'hasPayload:',
            !!data.payload,
            'callbacksRegistered:',
            this.eventCallbacks.has(data.type)
          );
          const callbacks = this.eventCallbacks.get(data.type);
          if (callbacks) {
            logger.info('Dispatching to', callbacks.size, 'callbacks');
            callbacks.forEach((cb) => cb(data.payload));
          }
          const wildcardCallbacks = this.eventCallbacks.get('__all__' as EventType);
          if (wildcardCallbacks) {
            wildcardCallbacks.forEach((cb) => cb(data));
          }
        } catch (error) {
          logger.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        logger.info('WebSocket disconnected');
        this.isConnecting = false;
        this.ws = null;
        if (event.code === 4100) logger.info('Server shutting down, will reconnect shortly');
        if (!this.reconnectTimer) {
          const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
          const jitter = baseDelay * Math.random() * 0.2;
          const delay = Math.round(baseDelay + jitter);
          this.reconnectAttempt++;
          logger.info(`WebSocket reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWebSocket();
          }, delay);
        }
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error:', error);
        this.isConnecting = false;
      };
    } catch (error) {
      logger.error('Failed to create WebSocket:', error);
      this.isConnecting = false;
    }
  }

  private generateEventHash(type: string, payload: unknown): string {
    const contentStr = type + JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < contentStr.length; i++) {
      const char = contentStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `hash-${Math.abs(hash).toString(36)}`;
  }

  private checkAndTrackEventId(type: string, payload: unknown, serverEventId?: string): boolean {
    const eventId = serverEventId || this.generateEventHash(type, payload);
    if (this.recentEventIds.has(eventId)) {
      logger.debug('Duplicate event detected, skipping:', eventId);
      return false;
    }
    this.recentEventIds.add(eventId);
    this.eventIdOrder.push(eventId);
    if (this.recentEventIds.size > this.MAX_DEDUP_ENTRIES) {
      const toRemove = this.eventIdOrder.splice(0, this.EVICT_BATCH_SIZE);
      toRemove.forEach((id) => this.recentEventIds.delete(id));
      logger.debug(`Event dedup window evicted ${toRemove.length} old entries`);
    }
    return true;
  }

  // -- Event subscription (protected so mixins can use it) --------------------

  protected subscribeToEvent(type: EventType, callback: EventCallback): () => void {
    if (!this.eventCallbacks.has(type)) this.eventCallbacks.set(type, new Set());
    this.eventCallbacks.get(type)!.add(callback);
    this.connectWebSocket();
    return () => {
      const callbacks = this.eventCallbacks.get(type);
      if (callbacks) callbacks.delete(callback);
    };
  }

  /** Subscribe to ALL WebSocket events with a single callback. */
  public subscribeToEvents(callback: (type: EventType, payload: unknown) => void): () => void {
    const WILDCARD = '__all__' as EventType;
    if (!this.eventCallbacks.has(WILDCARD)) this.eventCallbacks.set(WILDCARD, new Set());
    const wrappedCb = (data: unknown) => {
      const msg = data as { type: EventType; payload: unknown };
      callback(msg.type, msg.payload);
    };
    this.eventCallbacks.get(WILDCARD)!.add(wrappedCb);
    this.connectWebSocket();
    return () => {
      this.eventCallbacks.get(WILDCARD)?.delete(wrappedCb);
    };
  }

  // -- HTTP helpers (protected so mixins can use them) ------------------------

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = getApiKey();
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
      return headers;
    }
    const sessionToken = getSessionToken();
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    return headers;
  }

  protected async post<T>(endpoint: string, body?: unknown): Promise<T> {
    await waitForApiKeyInit();
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const d = await response.json();
        if (d.error) errorMessage = d.error;
      } catch {
        /* use status */
      }
      throw new Error(errorMessage);
    }
    return response.json();
  }

  protected async get<T>(endpoint: string): Promise<T> {
    await waitForApiKeyInit();
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      headers: this.getHeaders(),
      credentials: 'include',
      cache: NO_STORE_CACHE_MODE,
    });
    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const d = await response.json();
        if (d.error) errorMessage = d.error;
      } catch {
        /* use status */
      }
      throw new Error(errorMessage);
    }
    return response.json();
  }

  protected async put<T>(endpoint: string, body?: unknown): Promise<T> {
    await waitForApiKeyInit();
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const d = await response.json();
        if (d.error) errorMessage = d.error;
      } catch {
        /* use status */
      }
      throw new Error(errorMessage);
    }
    return response.json();
  }

  protected async httpDelete<T>(endpoint: string, body?: unknown): Promise<T> {
    await waitForApiKeyInit();
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const d = await response.json();
        if (d.error) errorMessage = d.error;
      } catch {
        /* use status */
      }
      throw new Error(errorMessage);
    }
    return response.json();
  }

  protected async postBinary<T>(endpoint: string, data: ArrayBuffer): Promise<T> {
    await waitForApiKeyInit();
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    const apiKey = getApiKey();
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    } else {
      const sessionToken = getSessionToken();
      if (sessionToken) headers['X-Session-Token'] = sessionToken;
    }
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: data,
    });
    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const d = await response.json();
        if (d.error) errorMessage = d.error;
      } catch {
        /* use status */
      }
      throw new Error(errorMessage);
    }
    return response.json();
  }
}
