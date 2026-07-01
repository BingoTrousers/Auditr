import dns from 'node:dns';
import { isIP } from 'node:net';

export interface ValidateUrlSuccess {
  ok: true;
  hostname: string;
  resolvedIps: string[];
}

export interface ValidateUrlFailure {
  ok: false;
  reason: string;
}

export type ValidateUrlResult = ValidateUrlSuccess | ValidateUrlFailure;

/**
 * Checks whether an IPv4 or IPv6 address falls into a private, loopback,
 * link-local, or otherwise reserved range that should never be fetched
 * server-side (mitigates SSRF, including DNS-rebinding attacks where the
 * hostname resolves to an internal address after the fact).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);

  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;

    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local
    if (a === 0) return true; // "this" network
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 192 && b === 0 && parts[2] === 0) return true; // IETF protocol assignments
    if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // multicast + reserved + broadcast

    return false;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();

    if (normalized === '::1') return true; // loopback
    if (normalized === '::') return true; // unspecified
    if (normalized.startsWith('fe80:')) return true; // link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local (fc00::/7)
    if (normalized.startsWith('::ffff:')) {
      // IPv4-mapped IPv6 address — validate the embedded IPv4 address.
      const mapped = normalized.replace('::ffff:', '');
      if (isIP(mapped) === 4) return isPrivateOrReservedIp(mapped);
    }

    return false;
  }

  // Not a valid IP at all — treat as unsafe.
  return true;
}

/**
 * Validates that a URL string is safe to fetch server-side:
 * - protocol must be http/https
 * - hostname must resolve (via DNS) to at least one IP, and none of the
 *   resolved IPs may be private/loopback/link-local/reserved.
 */
export async function validateUrl(urlString: string): Promise<ValidateUrlResult> {
  let parsed: URL;

  try {
    parsed = new URL(urlString);
  } catch {
    return { ok: false, reason: 'The provided value is not a valid URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only http:// and https:// URLs are allowed.' };
  }

  const hostname = parsed.hostname;

  // If the hostname is itself a literal IP, skip DNS and check it directly.
  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      return { ok: false, reason: 'Requests to private or internal IP addresses are not allowed.' };
    }
    return { ok: true, hostname, resolvedIps: [hostname] };
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: 'Could not resolve the hostname.' };
  }

  if (addresses.length === 0) {
    return { ok: false, reason: 'Could not resolve the hostname.' };
  }

  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      return { ok: false, reason: 'Requests to private or internal IP addresses are not allowed.' };
    }
  }

  return { ok: true, hostname, resolvedIps: addresses.map((a) => a.address) };
}
