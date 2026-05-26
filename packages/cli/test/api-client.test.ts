import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, mapToApiError } from '../src/api-client.js';
import { resolveApiConfig } from '../src/config.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock resolveApiConfig
vi.mock('../src/config.js', () => ({
  resolveApiConfig: vi.fn(),
}));

const mockedResolveConfig = vi.mocked(resolveApiConfig);

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveConfig.mockReturnValue({
      apiUrl: 'http://localhost:3008',
      apiKey: 'test-key',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends x-api-key header on requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ status: 'ok' })),
    });

    const client = new ApiClient();
    await client.get('/health');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3008/api/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-automaker-client': 'cli',
        }),
      })
    );
  });

  it('returns typed response on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ status: 'ok', version: '1.0' })),
    });

    const client = new ApiClient();
    const result = await client.get<{ status: string; version: string }>('/health');

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ status: 'ok', version: '1.0' });
  });

  it('returns error on non-ok status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve(JSON.stringify({ error: 'internal error' })),
    });

    const client = new ApiClient();
    const result = await client.get('/health');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toBe('internal error');
  });

  it('sends JSON body on POST', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify({ id: '123' })),
    });

    const client = new ApiClient();
    await client.post('/features', { name: 'test' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3008/api/features',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      })
    );
  });

  it('does not send body on GET', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('[]'),
    });

    const client = new ApiClient();
    await client.get('/features');

    const call = mockFetch.mock.calls[0][1] as RequestInit;
    expect(call.body).toBeUndefined();
  });

  it('handles connection refused with friendly message', async () => {
    mockFetch.mockRejectedValueOnce(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      })
    );

    const client = new ApiClient();
    const result = await client.get('/health');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('server');
  });

  it('handles 401 with friendly message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: 'Authentication required.' })),
    });

    const client = new ApiClient();
    const result = await client.get('/features');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('handles invalid JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('not json'),
    });

    const client = new ApiClient();
    const result = await client.get('/health');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unexpected server response');
  });

  it('ping returns true when server responds', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const client = new ApiClient();
    const result = await client.ping();

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3008/health', expect.any(Object));
  });

  it('ping returns false when server is down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const client = new ApiClient();
    const result = await client.ping();

    expect(result).toBe(false);
  });

  it('accepts explicit config', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    });

    const client = new ApiClient({
      apiUrl: 'http://custom.example.com:9999',
      apiKey: 'custom-key',
    });
    await client.get('/health');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://custom.example.com:9999/api/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'custom-key',
        }),
      })
    );
  });

  it('strips trailing slash from baseUrl', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    });

    const client = new ApiClient({
      apiUrl: 'http://localhost:3008/',
      apiKey: 'test',
    });
    await client.get('/health');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3008/api/health', expect.any(Object));
  });
});

describe('mapToApiError', () => {
  it('maps ECONNREFUSED to connection_refused', () => {
    const err = mapToApiError(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      })
    );

    expect(err.category).toBe('connection_refused');
    expect(err.message).toContain('server');
  });

  it('maps 401 to bad_api_key', () => {
    const err = mapToApiError(new Error('unauthorized'), 401);

    expect(err.category).toBe('bad_api_key');
    expect(err.message).toContain('API key');
  });

  it('maps 403 to bad_api_key', () => {
    const err = mapToApiError(new Error('forbidden'), 403);

    expect(err.category).toBe('bad_api_key');
    expect(err.message).toContain('API key');
  });

  it('maps 500 to server_error', () => {
    const err = mapToApiError(new Error('internal'), 500);

    expect(err.category).toBe('server_error');
    expect(err.message).toContain('500');
  });

  it('maps unknown error to unknown category', () => {
    const err = mapToApiError(new Error('something weird'));

    expect(err.category).toBe('unknown');
    expect(err.message).toBe('something weird');
  });
});
