/**
 * Typed API client for the protoLabs.studio backend.
 *
 * Reads configuration from environment variables:
 *   AUTOMAKER_API_URL   — base URL (default: http://localhost:3008)
 *   AUTOMAKER_API_KEY   — API key for authentication
 *
 * Falls back to `.env` file in the project root if env vars are not set.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface APIClientConfig {
  /** Base URL for the API (e.g. http://localhost:3008). */
  baseUrl: string;
  /** API key for authentication. */
  apiKey: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export class APIError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class AuthError extends APIError {
  constructor(message: string) {
    super(message, 401, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

export class ConnectionError extends APIError {
  constructor(message: string) {
    super(message, undefined, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'http://localhost:3008';
const DEFAULT_API_KEY = 'protoLabs_studio_key';

/**
 * Resolve API config from environment variables.
 *
 * Priority:
 *   1. Environment variables (AUTOMAKER_API_URL, AUTOMAKER_API_KEY)
 *   2. Defaults
 */
export function resolveAPIConfig(): APIClientConfig {
  return {
    baseUrl: process.env.AUTOMAKER_API_URL ?? DEFAULT_BASE_URL,
    apiKey: process.env.AUTOMAKER_API_KEY ?? DEFAULT_API_KEY,
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Lightweight, typed HTTP client for the Automaker API.
 *
 * Uses the native `fetch` API (Node 22+).
 */
export class APIClient {
  constructor(private config: APIClientConfig) {}

  /** Create a client from environment variables. */
  static fromEnv(): APIClient {
    return new APIClient(resolveAPIConfig());
  }

  /**
   * Make a typed API request.
   *
   * @param path - API path (e.g. `/api/projects`)
   * @param options - Fetch options (method, body, headers)
   */
  async request<T>(path: string, options: RequestInit = {}): Promise<APIResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey,
      ...(options.headers as Record<string, string> | undefined),
    };

    try {
      const response = await fetch(url, { ...options, headers });

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type') ?? '';
      let body: unknown = null;

      if (contentType.includes('application/json')) {
        body = await response.json().catch(() => null);
      } else {
        body = { message: await response.text() };
      }

      if (!response.ok) {
        // Authentication failure
        if (response.status === 401) {
          throw new AuthError(`Authentication failed. Check AUTOMAKER_API_KEY.`);
        }

        // Server error
        const errorMessage =
          (body as { error?: string; message?: string })?.error ??
          (body as { error?: string; message?: string })?.message ??
          `HTTP ${response.status}`;

        throw new APIError(errorMessage, response.status, (body as { code?: string })?.code);
      }

      return {
        success: true,
        data: body as T,
      };
    } catch (error) {
      // Re-throw our typed errors
      if (error instanceof APIError) {
        throw error;
      }

      // Network / connection errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ConnectionError(
          `Cannot connect to ${this.config.baseUrl}. ` + `Is the server running?`
        );
      }

      // Unexpected errors
      throw new APIError(error instanceof Error ? error.message : String(error));
    }
  }

  /** GET request helper. */
  async get<T>(path: string): Promise<APIResponse<T>> {
    return this.request<T>(path, { method: 'GET' });
  }

  /** POST request helper. */
  async post<T>(path: string, body: unknown): Promise<APIResponse<T>> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** PUT request helper. */
  async put<T>(path: string, body: unknown): Promise<APIResponse<T>> {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /** DELETE request helper. */
  async delete<T>(path: string): Promise<APIResponse<T>> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}
