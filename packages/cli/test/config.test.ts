import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveApiConfig } from '../src/config.js';
import { readFileSync } from 'node:fs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

describe('resolveApiConfig', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.AUTOMAKER_API_URL;
    delete process.env.AUTOMAKER_API_KEY;
    // Reset the mock so queued mockReturnValueOnce calls don't leak
    vi.mocked(readFileSync).mockReset();
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('reads both values from process.env', () => {
    process.env.AUTOMAKER_API_URL = 'http://env.example.com:9999';
    process.env.AUTOMAKER_API_KEY = 'env-key';

    const result = resolveApiConfig();

    expect(result.apiUrl).toBe('http://env.example.com:9999');
    expect(result.apiKey).toBe('env-key');
    // When both env vars are set, .env should not be read
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it('reads values from .env fallback when env vars are missing', () => {
    vi.mocked(readFileSync).mockReturnValue(
      'AUTOMAKER_API_URL=http://dotenv.example.com:4000\nAUTOMAKER_API_KEY=dotenv-key\n'
    );

    const result = resolveApiConfig();

    expect(result.apiUrl).toBe('http://dotenv.example.com:4000');
    expect(result.apiKey).toBe('dotenv-key');
  });

  it('prefers process.env over .env', () => {
    process.env.AUTOMAKER_API_URL = 'http://env.example.com:9999';
    process.env.AUTOMAKER_API_KEY = 'env-key';

    const result = resolveApiConfig();

    expect(result.apiUrl).toBe('http://env.example.com:9999');
    expect(result.apiKey).toBe('env-key');
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it('falls back to default URL when .env is empty', () => {
    vi.mocked(readFileSync).mockReturnValue('');

    const result = resolveApiConfig();

    expect(result.apiUrl).toBe('http://localhost:3008');
    expect(result.apiKey).toBeUndefined();
  });

  it('handles .env with quoted values', () => {
    vi.mocked(readFileSync).mockReturnValue(
      'AUTOMAKER_API_URL="http://quoted.example.com:5000"\nAUTOMAKER_API_KEY=\'quoted-key\'\n'
    );

    const result = resolveApiConfig();

    expect(result.apiUrl).toBe('http://quoted.example.com:5000');
    expect(result.apiKey).toBe('quoted-key');
  });

  it('ignores comments and blank lines in .env', () => {
    vi.mocked(readFileSync).mockReturnValue(
      '# comment\n\nAUTOMAKER_API_KEY=real-key\nOTHER_VAR=ignored\n'
    );

    const result = resolveApiConfig();

    expect(result.apiUrl).toBe('http://localhost:3008');
    expect(result.apiKey).toBe('real-key');
  });

  it('returns default config when .env read fails', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    const result = resolveApiConfig();

    expect(result.apiUrl).toBe('http://localhost:3008');
    expect(result.apiKey).toBeUndefined();
  });
});
