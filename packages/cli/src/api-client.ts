/**
 * Typed API client for the protomaker CLI.
 *
 * Sends `x-api-key` with every request and maps common failures to
 * friendly, actionable messages:
 *   - ECONNREFUSED / connection error → "server not running"
 *   - 401 / 403 → "bad / missing API key"
 *   - JSON parse failures → "unexpected server response"
 */

import { resolveApiConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** HTTP methods the client supports. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Structured API response. */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

/** Friendly error categories. */
export type ApiErrorCategory =
  | 'connection_refused'
  | 'bad_api_key'
  | 'server_error'
  | 'parse_error'
  | 'unknown';

/** Friendly error with a human-readable message. */
export interface ApiError {
  category: ApiErrorCategory;
  message: string;
  status?: number;
  cause?: unknown;
}

/** Client configuration. */
export interface ApiClientConfig {
  apiUrl: string;
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/**
 * Map a raw error / response to a friendly ApiError.
 */
export function mapToApiError(error: unknown, status?: number): ApiError {
  // Connection refused / network unreachable
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const cause = (error as any).cause;
    const causeMsg =
      typeof cause === 'object' && cause !== null && 'code' in cause
        ? String((cause as any).code).toLowerCase()
        : '';

    if (
      msg.includes('econnrefused') ||
      msg.includes('connection refused') ||
      msg.includes('fetch failed') ||
      causeMsg === 'econnrefused'
    ) {
      return {
        category: 'connection_refused',
        message:
          'Cannot connect to the server. Make sure the protoLabs.studio server is running.\n' +
          `  Expected at: ${error.message}`,
        cause: error,
      };
    }
  }

  // HTTP status-based mapping
  if (status === 401 || status === 403) {
    return {
      category: 'bad_api_key',
      message:
        'Authentication failed. Check that your API key is correct.\n' +
        '  Set AUTOMAKER_API_KEY in your environment or .env file.',
      status,
      cause: error,
    };
  }

  if (status && status >= 500) {
    return {
      category: 'server_error',
      message: `Server error (${status}). Please try again later.`,
      status,
      cause: error,
    };
  }

  // JSON parse error
  if (error instanceof Error && error.message.includes('JSON')) {
    return {
      category: 'parse_error',
      message: 'Unexpected server response. The server returned invalid JSON.',
      status,
      cause: error,
    };
  }

  return {
    category: 'unknown',
    message: error instanceof Error ? error.message : String(error),
    status,
    cause: error,
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Lightweight, typed HTTP client for the Automaker API.
 *
 * Uses native `fetch` (Node 22+). No external HTTP library required.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(config?: ApiClientConfig) {
    const resolved = config ?? resolveApiConfig();
    this.baseUrl = resolved.apiUrl.replace(/\/+$/, '');
    this.apiKey = resolved.apiKey;
  }

  /**
   * Build headers for a request.
   */
  private headers(extra?: Record<string, string>): Record<string, string> {
    const base: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-automaker-client': 'cli',
    };

    if (this.apiKey) {
      base['x-api-key'] = this.apiKey;
    }

    return { ...base, ...extra };
  }

  /**
   * Make a request and parse JSON.
   *
   * @returns ApiResponse with typed `data` on success, or `error` on failure.
   */
  async request<T = unknown>(
    method: HttpMethod,
    endpoint: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    try {
      const fetchInit: RequestInit = {
        method,
        headers: this.headers(),
      };

      if (body !== undefined && method !== 'GET') {
        fetchInit.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchInit);
      const raw = await response.text();

      // Try to parse JSON
      let data: T | undefined;
      try {
        data = raw as unknown as T;
        if (raw) {
          data = JSON.parse(raw) as T;
        }
      } catch {
        return {
          ok: false,
          status: response.status,
          error: `Unexpected server response (status ${response.status}). Body: ${raw.slice(0, 200)}`,
        };
      }

      if (response.ok) {
        return { ok: true, status: response.status, data };
      }

      // Non-ok status — extract error message from response if possible
      const errorData = data as Record<string, unknown> | undefined;
      const errorMessage =
        (typeof errorData?.error === 'string' && errorData.error) ||
        `Request failed with status ${response.status}`;

      return {
        ok: false,
        status: response.status,
        error: errorMessage,
      };
    } catch (err) {
      const apiError = mapToApiError(err);
      return {
        ok: false,
        status: 0,
        error: apiError.message,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Typed helpers
  // -----------------------------------------------------------------------

  /** GET /api/:endpoint */
  async get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint);
  }

  /** POST /api/:endpoint */
  async post<T = unknown>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, body);
  }

  /** PUT /api/:endpoint */
  async put<T = unknown>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', endpoint, body);
  }

  /** PATCH /api/:endpoint */
  async patch<T = unknown>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', endpoint, body);
  }

  /** DELETE /api/:endpoint */
  async del<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint);
  }

  /**
   * Check server connectivity.
   * Returns true if the server responds to /health.
   */
  async ping(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/health`;
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
