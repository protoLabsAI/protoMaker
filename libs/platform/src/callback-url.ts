/**
 * Push-callback URL resolution for agent-to-agent and webhook callbacks.
 *
 * Agents that need to advertise a reachable callback URL face an ambiguity:
 *   - Agents running inside a Tailscale network can reach each other via
 *     Tailscale magic-DNS (hostname.tailnet.ts.net) or 100.x.x.x addresses.
 *   - Agents running outside Tailscale (public CI runners, external peers)
 *     cannot reach those addresses. They need a publicly routable URL.
 *
 * This module provides `resolveCallbackUrl()` — a single function that
 * resolves the correct callback base URL given the agent's environment.
 *
 * Resolution order:
 *   1. Explicit `PUBLIC_CALLBACK_URL` env var (always wins when set).
 *   2. Tailscale agent detected → use the Tailscale-derived URL.
 *   3. HOSTNAME env var present and plausible (non-localhost) → use it.
 *   4. No usable URL: throw CallbackUrlNotConfiguredError with a clear message.
 *
 * "Tailscale agent" detection is intentionally heuristic-based and exposed
 * as a configurable option (`tailscaleDetection`) so operators can override it
 * in environments where the heuristic gives false positives or false negatives.
 *
 * Settings-first: all detection thresholds are configurable via options.
 * Never hardcode environment-specific assumptions in callers.
 */

import os from 'os';

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when no routable callback URL can be determined from the environment.
 *
 * Callers may catch this to emit a clear operator-facing error rather than
 * silently advertising a non-routable address.
 */
export class CallbackUrlNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CallbackUrlNotConfiguredError';
  }
}

// ─── Tailscale detection ─────────────────────────────────────────────────────

/**
 * Heuristic result from Tailscale detection.
 */
export interface TailscaleDetectionResult {
  /** Whether this agent appears to be running inside a Tailscale network. */
  isTailscale: boolean;
  /** The derived Tailscale base URL if detected, e.g. `http://hostname.tailnet.ts.net`. */
  tailscaleUrl?: string;
}

/**
 * Detect whether the current host is a Tailscale node by inspecting its hostname.
 *
 * Heuristics applied (in order):
 *   1. Hostname ends in `.ts.net` — official Tailscale magic-DNS TLD.
 *   2. Hostname ends in `.tailnet.ts.net` — common magic-DNS variant.
 *   3. A Tailscale IP address (100.64.0.0/10 range) is found among the host's
 *      network interfaces.
 *
 * @param hostname - Override the hostname to test (default: `os.hostname()`).
 */
export function detectTailscale(hostname?: string): TailscaleDetectionResult {
  const host = hostname ?? os.hostname();

  // Heuristic 1 & 2: DNS-name based detection
  if (host.endsWith('.ts.net') || host.endsWith('.tailnet.ts.net')) {
    return { isTailscale: true, tailscaleUrl: `http://${host}` };
  }

  // Heuristic 3: Look for a Tailscale IP on a network interface.
  // Tailscale addresses live in the RFC 6598 CGNAT range: 100.64.0.0/10
  // (100.64.0.0 – 100.127.255.255).
  const ifaces = os.networkInterfaces();
  for (const addresses of Object.values(ifaces)) {
    if (!addresses) continue;
    for (const addr of addresses) {
      if (addr.family !== 'IPv4') continue;
      const tsIp = isTailscaleIpv4(addr.address);
      if (tsIp) {
        return { isTailscale: true, tailscaleUrl: `http://${addr.address}` };
      }
    }
  }

  return { isTailscale: false };
}

/**
 * Return true if the IPv4 address is in the Tailscale CGNAT range (100.64.0.0/10).
 */
function isTailscaleIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const first = parseInt(parts[0], 10);
  const second = parseInt(parts[1], 10);
  // 100.64.0.0/10 covers 100.64.0.0 – 100.127.255.255
  return first === 100 && second >= 64 && second <= 127;
}

// ─── Resolution options ───────────────────────────────────────────────────────

/**
 * Options for `resolveCallbackUrl()`.
 */
export interface ResolveCallbackUrlOptions {
  /**
   * Port to include in the resolved URL.
   * Omitted from the URL when not provided (allows callers to handle ports separately).
   */
  port?: number;

  /**
   * Explicit public callback URL override — takes highest priority.
   * Falls back to the `PUBLIC_CALLBACK_URL` environment variable when omitted.
   */
  publicCallbackUrl?: string;

  /**
   * Control Tailscale detection behaviour.
   *   - `'auto'` (default): run the hostname + network-interface heuristic.
   *   - `'force-on'`:  treat this host as a Tailscale node regardless of heuristics.
   *   - `'force-off'`: skip Tailscale detection entirely.
   */
  tailscaleDetection?: 'auto' | 'force-on' | 'force-off';

  /**
   * Override the hostname used for Tailscale detection and URL construction.
   * Defaults to `os.hostname()`.
   */
  hostname?: string;

  /**
   * Protocol to use when building the URL. Defaults to `'http'`.
   */
  protocol?: 'http' | 'https';

  /**
   * When `true`, throw `CallbackUrlNotConfiguredError` if no routable URL
   * can be determined (e.g. only localhost/127.0.0.1 is available).
   * When `false` (default), return the best-effort URL even if it may not be
   * externally routable.
   */
  strict?: boolean;
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve the base callback URL for this agent.
 *
 * See module-level docs for the full resolution order.
 *
 * @returns The resolved base URL (e.g. `http://my-host:3008`).
 * @throws CallbackUrlNotConfiguredError when `strict: true` and no routable URL found.
 */
export function resolveCallbackUrl(options: ResolveCallbackUrlOptions = {}): string {
  const {
    port,
    publicCallbackUrl,
    tailscaleDetection = 'auto',
    hostname,
    protocol = 'http',
    strict = false,
  } = options;

  const portSuffix = port != null ? `:${port}` : '';

  // ── 1. Explicit PUBLIC_CALLBACK_URL always wins ───────────────────────────
  const explicitPublicUrl = publicCallbackUrl ?? process.env['PUBLIC_CALLBACK_URL'];
  if (explicitPublicUrl) {
    // Strip trailing slash and append port if provided and not already present.
    const base = explicitPublicUrl.replace(/\/$/, '');
    // If the explicit URL already contains a port, honour it as-is.
    try {
      const parsed = new URL(base);
      if (port != null && !parsed.port) {
        return `${base}${portSuffix}`;
      }
    } catch {
      // Not a valid URL — fall through to return as-is with port suffix.
    }
    return port != null && !base.match(/:\d+$/) ? `${base}${portSuffix}` : base;
  }

  // ── 2. Tailscale detection ────────────────────────────────────────────────
  if (tailscaleDetection !== 'force-off') {
    if (tailscaleDetection === 'force-on') {
      const host = hostname ?? os.hostname();
      return `${protocol}://${host}${portSuffix}`;
    }

    const detection = detectTailscale(hostname);
    if (detection.isTailscale && detection.tailscaleUrl) {
      const base = detection.tailscaleUrl.replace(/\/$/, '');
      return port != null ? `${base}${portSuffix}` : base;
    }
  }

  // ── 3. HOSTNAME env var / passed hostname (non-localhost) ─────────────────
  const envHostname = hostname ?? process.env['HOSTNAME'];
  if (envHostname && !isLocalhost(envHostname)) {
    return `${protocol}://${envHostname}${portSuffix}`;
  }

  // ── 4. Strict mode: no routable URL found ────────────────────────────────
  if (strict) {
    throw new CallbackUrlNotConfiguredError(
      'No routable callback URL could be determined for this agent.\n' +
        'This agent does not appear to be on a Tailscale network, and neither\n' +
        'PUBLIC_CALLBACK_URL nor a non-localhost HOSTNAME is configured.\n\n' +
        'To fix:\n' +
        '  • Set PUBLIC_CALLBACK_URL=https://your-public-host in the environment, or\n' +
        '  • Set HOSTNAME=your-reachable-hostname, or\n' +
        '  • Configure tailscaleDetection:"force-on" if the agent is on Tailscale\n' +
        '    but the hostname heuristic is not detecting it.'
    );
  }

  // ── Soft fallback: localhost (development / non-strict mode) ──────────────
  const localHost = envHostname ?? 'localhost';
  return `${protocol}://${localHost}${portSuffix}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return true if the hostname looks like a loopback / local address.
 */
function isLocalhost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('127.')
  );
}
