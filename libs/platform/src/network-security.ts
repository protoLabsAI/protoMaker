/**
 * Network security utilities for SSRF prevention
 *
 * Blocks requests to private/internal IP ranges including:
 * - RFC 1918 private ranges (10.x, 172.16-31.x, 192.168.x)
 * - Loopback (127.x, ::1)
 * - Link-local / cloud metadata (169.254.x, AWS/GCP/Azure metadata endpoints)
 * - IPv6 unique local (fc00::/7) and link-local (fe80::/10)
 */

import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

/**
 * Error thrown when a URL target is blocked by network security policy
 */
export class UrlNotAllowedError extends Error {
  constructor(url: string, reason: string) {
    super(`URL blocked by network security policy: ${url}. Reason: ${reason}`);
    this.name = 'UrlNotAllowedError';
  }
}

/**
 * IPv4 CIDR range represented as [networkInt, maskInt]
 */
interface Ipv4Range {
  network: number;
  mask: number;
  label: string;
}

/**
 * IPv6 CIDR range represented as prefix bytes and prefix length
 */
interface Ipv6Range {
  prefix: bigint;
  prefixBits: number;
  mask: bigint;
  label: string;
}

/**
 * All blocked IPv4 CIDR ranges
 */
const BLOCKED_IPV4_RANGES: Ipv4Range[] = [
  // Loopback (127.0.0.0/8)
  { network: 0x7f000000, mask: 0xff000000, label: 'loopback' },
  // RFC 1918 - 10.0.0.0/8
  { network: 0x0a000000, mask: 0xff000000, label: 'RFC1918-10.x' },
  // RFC 1918 - 172.16.0.0/12
  { network: 0xac100000, mask: 0xfff00000, label: 'RFC1918-172.16-31.x' },
  // RFC 1918 - 192.168.0.0/16
  { network: 0xc0a80000, mask: 0xffff0000, label: 'RFC1918-192.168.x' },
  // Link-local / cloud metadata (169.254.0.0/16) — includes AWS 169.254.169.254
  { network: 0xa9fe0000, mask: 0xffff0000, label: 'link-local/metadata' },
  // Localhost alias (0.0.0.0/8)
  { network: 0x00000000, mask: 0xff000000, label: 'unspecified' },
  // Broadcast / shared address space (100.64.0.0/10 - RFC 6598 carrier-grade NAT)
  { network: 0x64400000, mask: 0xffc00000, label: 'carrier-grade-NAT' },
  // Documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
  { network: 0xc0000200, mask: 0xffffff00, label: 'documentation-192.0.2.x' },
  { network: 0xc6336400, mask: 0xffffff00, label: 'documentation-198.51.100.x' },
  { network: 0xcb007100, mask: 0xffffff00, label: 'documentation-203.0.113.x' },
];

/**
 * All blocked IPv6 CIDR ranges
 */
const BLOCKED_IPV6_RANGES: Ipv6Range[] = buildIpv6Ranges();

function buildIpv6Ranges(): Ipv6Range[] {
  function makeRange(prefixHex: string, bits: number, label: string): Ipv6Range {
    // Pad to 32 hex chars (128 bits)
    const padded = prefixHex.padEnd(32, '0');
    const prefix = BigInt('0x' + padded);
    const mask = bits === 0 ? 0n : (~0n << BigInt(128 - bits)) & ((1n << 128n) - 1n);
    return { prefix: prefix & mask, prefixBits: bits, mask, label };
  }

  return [
    // Loopback ::1/128
    makeRange('00000000000000000000000000000001', 128, 'IPv6-loopback'),
    // Unique local fc00::/7
    makeRange('fc000000000000000000000000000000', 7, 'IPv6-unique-local'),
    // Link-local fe80::/10
    makeRange('fe800000000000000000000000000000', 10, 'IPv6-link-local'),
    // IPv4-mapped ::ffff:0:0/96 (covers mapped IPv4 private ranges below)
    makeRange('00000000000000000000ffff00000000', 96, 'IPv4-mapped'),
    // Unspecified ::/128
    makeRange('00000000000000000000000000000000', 128, 'IPv6-unspecified'),
  ];
}

/**
 * Parse a dotted-decimal IPv4 address string into a 32-bit unsigned integer.
 * Returns null if the string is not a valid IPv4 address.
 */
function parseIpv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255 || String(n) !== part) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

/**
 * Parse a full-expanded IPv6 address string into a 128-bit BigInt.
 * Handles both full and compressed formats (::).
 * Returns null if invalid.
 */
function parseIpv6(ip: string): bigint | null {
  // Handle IPv4-mapped addresses like ::ffff:192.168.1.1
  const ipv4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (ipv4Mapped) {
    const v4 = parseIpv4(ipv4Mapped[1]);
    if (v4 === null) return null;
    return BigInt('0x00000000000000000000ffff') * (1n << 32n) + BigInt(v4 >>> 0);
  }

  // Split on ::
  const halves = ip.split('::');
  if (halves.length > 2) return null;

  let left: string[] = [];
  let right: string[] = [];

  if (halves.length === 2) {
    left = halves[0] ? halves[0].split(':') : [];
    right = halves[1] ? halves[1].split(':') : [];
  } else {
    left = ip.split(':');
  }

  const totalGroups = 8;
  const missing = totalGroups - left.length - right.length;
  if (missing < 0) return null;

  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== totalGroups) return null;

  let result = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    result = (result << 16n) | BigInt(parseInt(group, 16));
  }
  return result;
}

/**
 * Check if an IPv4 integer falls within any blocked range.
 * Returns the blocking label if blocked, null if allowed.
 */
function checkIpv4Blocked(ipInt: number): string | null {
  for (const range of BLOCKED_IPV4_RANGES) {
    if ((ipInt & range.mask) === range.network) {
      return range.label;
    }
  }
  return null;
}

/**
 * Check if an IPv6 BigInt falls within any blocked range.
 * Returns the blocking label if blocked, null if allowed.
 */
function checkIpv6Blocked(ipBig: bigint): string | null {
  for (const range of BLOCKED_IPV6_RANGES) {
    if ((ipBig & range.mask) === range.prefix) {
      return range.label;
    }
  }
  return null;
}

/**
 * Check if a single IP string (v4 or v6) is in a blocked range.
 * Returns the blocking reason label if blocked, null if allowed.
 */
export function isIpBlocked(ip: string): string | null {
  // Try IPv4 first
  const v4 = parseIpv4(ip);
  if (v4 !== null) {
    return checkIpv4Blocked(v4);
  }

  // Try IPv6
  const v6 = parseIpv6(ip);
  if (v6 !== null) {
    return checkIpv6Blocked(v6);
  }

  // Could not parse — treat as not blocked (DNS resolution will handle hostnames)
  return null;
}

/**
 * Well-known cloud metadata service hostnames to block directly (no DNS needed)
 */
const BLOCKED_METADATA_HOSTNAMES = new Set([
  'metadata.google.internal', // GCP metadata
  'metadata.internal', // GCP alternate
  'instance-data', // OpenStack
]);

/**
 * Validate that a URL's target is safe to connect to.
 *
 * Performs two checks:
 * 1. If the hostname is a literal IP, checks it against private CIDR ranges directly.
 * 2. If the hostname is a domain name, resolves A/AAAA records and checks each IP.
 *
 * Throws UrlNotAllowedError if the target resolves to any private/internal address.
 *
 * @param url - The URL to validate (e.g. "https://example.com/path")
 * @throws UrlNotAllowedError if the URL resolves to a private/internal address
 * @throws TypeError if the URL is malformed
 */
export async function validateUrlTarget(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`Invalid URL: ${url}`);
  }

  const { hostname, protocol } = parsed;

  // Only enforce for http/https — other protocols are out of scope
  if (protocol !== 'http:' && protocol !== 'https:') {
    return;
  }

  // Block known metadata hostnames regardless of DNS
  if (BLOCKED_METADATA_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new UrlNotAllowedError(url, `blocked cloud metadata hostname: ${hostname}`);
  }

  // Strip brackets from IPv6 literal addresses in URLs (e.g. [::1])
  const rawHost =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

  // Check if hostname is a direct IPv4 or IPv6 literal
  const directV4 = parseIpv4(rawHost);
  if (directV4 !== null) {
    const reason = checkIpv4Blocked(directV4);
    if (reason) {
      throw new UrlNotAllowedError(url, `IP address ${rawHost} is in blocked range: ${reason}`);
    }
    return; // Valid public IPv4
  }

  const directV6 = parseIpv6(rawHost);
  if (directV6 !== null) {
    const reason = checkIpv6Blocked(directV6);
    if (reason) {
      throw new UrlNotAllowedError(url, `IP address ${rawHost} is in blocked range: ${reason}`);
    }
    return; // Valid public IPv6
  }

  // Domain name — resolve and check all IPs
  const errors: string[] = [];

  const [v4Results, v6Results] = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);

  const allIps: string[] = [];

  if (v4Results.status === 'fulfilled') {
    allIps.push(...v4Results.value);
  } else {
    errors.push(`IPv4 DNS failed: ${(v4Results.reason as Error).message}`);
  }

  if (v6Results.status === 'fulfilled') {
    allIps.push(...v6Results.value);
  } else {
    errors.push(`IPv6 DNS failed: ${(v6Results.reason as Error).message}`);
  }

  // If DNS resolution completely failed for both, we cannot validate — block to be safe
  if (allIps.length === 0) {
    throw new UrlNotAllowedError(
      url,
      `DNS resolution failed for ${hostname}: ${errors.join(', ')}`
    );
  }

  // Check every resolved IP
  for (const ip of allIps) {
    const v4 = parseIpv4(ip);
    if (v4 !== null) {
      const reason = checkIpv4Blocked(v4);
      if (reason) {
        throw new UrlNotAllowedError(
          url,
          `hostname ${hostname} resolves to private IP ${ip} (${reason})`
        );
      }
      continue;
    }

    const v6 = parseIpv6(ip);
    if (v6 !== null) {
      const reason = checkIpv6Blocked(v6);
      if (reason) {
        throw new UrlNotAllowedError(
          url,
          `hostname ${hostname} resolves to private IPv6 ${ip} (${reason})`
        );
      }
    }
  }
}
