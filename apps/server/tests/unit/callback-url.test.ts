/**
 * Unit tests for the push-callback URL resolver.
 *
 * Covers the three key scenarios:
 *   (a) Tailscale agent  → Tailscale URL
 *   (b) External agent with PUBLIC_CALLBACK_URL configured → fallback URL
 *   (c) External agent without any fallback and strict mode → clear error
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock 'os' so we can control hostname() and networkInterfaces() per test.
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    hostname: vi.fn(),
    networkInterfaces: vi.fn(),
  };
});

import os from 'os';
import {
  resolveCallbackUrl,
  detectTailscale,
  CallbackUrlNotConfiguredError,
} from '@protolabsai/platform';

const mockHostname = vi.mocked(os.hostname);
const mockNetworkInterfaces = vi.mocked(os.networkInterfaces);

// Helpers
function setHostname(h: string) {
  mockHostname.mockReturnValue(h);
}
function setNetworkInterfaces(ifaces: ReturnType<typeof os.networkInterfaces>) {
  mockNetworkInterfaces.mockReturnValue(ifaces);
}
function clearEnv() {
  delete process.env['PUBLIC_CALLBACK_URL'];
  delete process.env['HOSTNAME'];
}

describe('detectTailscale', () => {
  beforeEach(() => {
    setNetworkInterfaces({});
  });

  afterEach(() => {
    clearEnv();
    vi.restoreAllMocks();
  });

  it('detects a .ts.net hostname as Tailscale', () => {
    setHostname('myhost.tailnet.ts.net');
    const result = detectTailscale();
    expect(result.isTailscale).toBe(true);
    expect(result.tailscaleUrl).toBe('http://myhost.tailnet.ts.net');
  });

  it('detects a .tailnet.ts.net hostname as Tailscale', () => {
    setHostname('runner.my-corp.tailnet.ts.net');
    const result = detectTailscale();
    expect(result.isTailscale).toBe(true);
    expect(result.tailscaleUrl).toBe('http://runner.my-corp.tailnet.ts.net');
  });

  it('detects a Tailscale IP in the 100.64/10 range', () => {
    setHostname('worker-node');
    setNetworkInterfaces({
      eth0: [
        {
          address: '192.168.1.1',
          family: 'IPv4',
          internal: false,
          netmask: '255.255.255.0',
          mac: '',
        },
      ],
      tailscale0: [
        {
          address: '100.100.5.12',
          family: 'IPv4',
          internal: false,
          netmask: '255.192.0.0',
          mac: '',
        },
      ],
    } as ReturnType<typeof os.networkInterfaces>);
    const result = detectTailscale();
    expect(result.isTailscale).toBe(true);
    expect(result.tailscaleUrl).toBe('http://100.100.5.12');
  });

  it('does NOT detect a regular hostname as Tailscale', () => {
    setHostname('runner-123');
    setNetworkInterfaces({
      eth0: [
        {
          address: '192.168.1.5',
          family: 'IPv4',
          internal: false,
          netmask: '255.255.255.0',
          mac: '',
        },
      ],
    } as ReturnType<typeof os.networkInterfaces>);
    const result = detectTailscale();
    expect(result.isTailscale).toBe(false);
    expect(result.tailscaleUrl).toBeUndefined();
  });

  it('does NOT mistake 100.128.x.x (outside CGNAT range) as Tailscale IP', () => {
    setHostname('runner-456');
    setNetworkInterfaces({
      eth0: [
        { address: '100.128.0.1', family: 'IPv4', internal: false, netmask: '255.0.0.0', mac: '' },
      ],
    } as ReturnType<typeof os.networkInterfaces>);
    const result = detectTailscale();
    expect(result.isTailscale).toBe(false);
  });

  it('accepts an explicit hostname override instead of os.hostname()', () => {
    setHostname('real-hostname');
    const result = detectTailscale('agent.mynet.ts.net');
    expect(result.isTailscale).toBe(true);
    expect(result.tailscaleUrl).toBe('http://agent.mynet.ts.net');
  });
});

describe('resolveCallbackUrl', () => {
  beforeEach(() => {
    setNetworkInterfaces({});
    clearEnv();
  });

  afterEach(() => {
    clearEnv();
    vi.restoreAllMocks();
  });

  // ── (a) Tailscale agent ───────────────────────────────────────────────────

  it('(a) Tailscale agent via .ts.net hostname → returns Tailscale URL', () => {
    setHostname('ava.tailnet.ts.net');
    const url = resolveCallbackUrl({ port: 3008 });
    expect(url).toBe('http://ava.tailnet.ts.net:3008');
  });

  it('(a) Tailscale agent via 100.x.x.x IP → returns Tailscale URL', () => {
    setHostname('runner');
    setNetworkInterfaces({
      ts0: [
        {
          address: '100.80.1.42',
          family: 'IPv4',
          internal: false,
          netmask: '255.192.0.0',
          mac: '',
        },
      ],
    } as ReturnType<typeof os.networkInterfaces>);
    const url = resolveCallbackUrl({ port: 3008 });
    expect(url).toBe('http://100.80.1.42:3008');
  });

  it('(a) tailscaleDetection:"force-on" treats any host as Tailscale', () => {
    setHostname('plain-ci-runner');
    const url = resolveCallbackUrl({ port: 3008, tailscaleDetection: 'force-on' });
    expect(url).toBe('http://plain-ci-runner:3008');
  });

  // ── (b) External agent with PUBLIC_CALLBACK_URL configured ───────────────

  it('(b) PUBLIC_CALLBACK_URL env var takes highest priority over Tailscale', () => {
    // Even though the host looks like Tailscale, the explicit env var wins.
    setHostname('ava.tailnet.ts.net');
    process.env['PUBLIC_CALLBACK_URL'] = 'https://ava.example.com';
    const url = resolveCallbackUrl({ port: 3008 });
    // The explicit URL does not have a port, so our port should be appended.
    expect(url).toBe('https://ava.example.com:3008');
  });

  it('(b) explicit publicCallbackUrl option takes highest priority', () => {
    setHostname('ava.tailnet.ts.net');
    const url = resolveCallbackUrl({
      port: 3008,
      publicCallbackUrl: 'https://ci.example.org',
    });
    expect(url).toBe('https://ci.example.org:3008');
  });

  it('(b) PUBLIC_CALLBACK_URL with existing port does not double-append', () => {
    process.env['PUBLIC_CALLBACK_URL'] = 'https://ava.example.com:9000';
    setHostname('plain-runner');
    const url = resolveCallbackUrl({ port: 3008 });
    // Port already present — should be kept as-is.
    expect(url).toBe('https://ava.example.com:9000');
  });

  it('(b) HOSTNAME env var (non-localhost) used when no Tailscale and no PUBLIC_CALLBACK_URL', () => {
    setHostname('regular-hostname');
    process.env['HOSTNAME'] = 'reachable.internal';
    setNetworkInterfaces({});
    const url = resolveCallbackUrl({ port: 3008 });
    expect(url).toBe('http://reachable.internal:3008');
  });

  it('(b) tailscaleDetection:"force-off" skips Tailscale and falls through to HOSTNAME', () => {
    setHostname('ava.tailnet.ts.net');
    process.env['HOSTNAME'] = 'public-host.example.com';
    const url = resolveCallbackUrl({ port: 3008, tailscaleDetection: 'force-off' });
    expect(url).toBe('http://public-host.example.com:3008');
  });

  // ── (c) External agent without fallback → clear error (strict mode) ───────

  it('(c) strict mode throws CallbackUrlNotConfiguredError when only localhost is available', () => {
    setHostname('localhost');
    setNetworkInterfaces({
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true, netmask: '255.0.0.0', mac: '' }],
    } as ReturnType<typeof os.networkInterfaces>);

    expect(() =>
      resolveCallbackUrl({ port: 3008, strict: true, tailscaleDetection: 'force-off' })
    ).toThrow(CallbackUrlNotConfiguredError);
  });

  it('(c) error message includes actionable hints for operators', () => {
    setHostname('localhost');
    setNetworkInterfaces({});

    let errorMessage = '';
    try {
      resolveCallbackUrl({ port: 3008, strict: true, tailscaleDetection: 'force-off' });
    } catch (err) {
      if (err instanceof CallbackUrlNotConfiguredError) {
        errorMessage = err.message;
      }
    }

    expect(errorMessage).toContain('PUBLIC_CALLBACK_URL');
    expect(errorMessage).toContain('HOSTNAME');
  });

  it('(c) non-strict mode (default) returns localhost fallback instead of throwing', () => {
    setHostname('localhost');
    setNetworkInterfaces({});

    const url = resolveCallbackUrl({ port: 3008, tailscaleDetection: 'force-off' });
    expect(url).toBe('http://localhost:3008');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('omits port suffix when port is not provided', () => {
    setHostname('ava.ts.net');
    const url = resolveCallbackUrl();
    expect(url).toBe('http://ava.ts.net');
  });

  it('uses https protocol when specified', () => {
    setHostname('ava.ts.net');
    const url = resolveCallbackUrl({ port: 443, protocol: 'https' });
    expect(url).toBe('https://ava.ts.net:443');
  });
});
