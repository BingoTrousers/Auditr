import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from 'undici';
import { isIP, type LookupFunction } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { validateUrl } from './validateUrl';

const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 3 * 1024 * 1024; // ~3MB
const MAX_REDIRECTS = 5;
const USER_AGENT = 'SEOAuditBot/1.0';

export interface FetchPageSuccess {
  ok: true;
  html: string;
  finalUrl: string;
}

export interface FetchPageFailure {
  ok: false;
  error: string;
  /** HTTP-ish status code to surface to the API caller. */
  status: number;
}

export type FetchPageResult = FetchPageSuccess | FetchPageFailure;

/**
 * Builds a `net.connect`-compatible `lookup` function that ignores DNS
 * entirely and resolves only to the IP addresses we already validated for
 * this exact hostname. This pins the TCP connection to the validated IP,
 * closing the DNS-rebinding gap where a fresh lookup performed by the fetch
 * implementation itself could return a different (attacker-controlled,
 * internal) address after `validateUrl` already approved the hostname.
 */
function createPinnedLookup(hostname: string, resolvedIps: string[]): LookupFunction {
  return ((lookupHostname: string, options: unknown, callback: unknown): void => {
    const cb = (typeof options === 'function' ? options : callback) as (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void;
    const wantsAll = typeof options === 'object' && options !== null && (options as { all?: boolean }).all === true;

    if (lookupHostname !== hostname) {
      cb(new Error('Unexpected hostname during connection') as NodeJS.ErrnoException, '');
      return;
    }

    const addresses: LookupAddress[] = resolvedIps.map((address) => ({ address, family: isIP(address) }));

    if (wantsAll) {
      cb(null, addresses);
    } else {
      cb(null, addresses[0].address, addresses[0].family);
    }
  }) as LookupFunction;
}

/**
 * Inspects response headers for well-known WAF/bot-protection fingerprints,
 * so a blocked request can be reported as "likely WAF-blocked" rather than
 * a generic HTTP error.
 */
function detectWafFromHeaders(headers: UndiciResponse['headers']): string | null {
  const server = headers.get('server')?.toLowerCase() ?? '';

  if (server.includes('cloudflare')) return 'Cloudflare';
  if (server.includes('akamaighost')) return 'Akamai';
  if (headers.get('x-sucuri-id') || headers.get('x-sucuri-cache')) return 'Sucuri';
  if (headers.get('x-datadome')) return 'DataDome';
  if (headers.get('x-iinfo') || (headers.get('x-cdn')?.toLowerCase().includes('incapsula') ?? false)) {
    return 'Imperva / Incapsula';
  }
  if (headers.get('x-px') || headers.get('x-px-block-uuid')) return 'PerimeterX / HUMAN';

  return null;
}

async function readBodyWithLimit(response: UndiciResponse): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const reader = response.body?.getReader();

  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf-8') > MAX_BODY_BYTES) {
      return { ok: false, error: 'The page response exceeded the maximum allowed size.' };
    }
    return { ok: true, text };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (value) {
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, error: 'The page response exceeded the maximum allowed size.' };
      }
      chunks.push(value);
    }
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { ok: true, text: buffer.toString('utf-8') };
}

/**
 * Fetches a URL server-side with SSRF protections, a timeout, a response
 * size cap, and manual redirect handling (each hop is re-validated so an
 * attacker can't redirect us to an internal address after the initial check).
 */
export async function fetchPage(url: string): Promise<FetchPageResult> {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const validation = await validateUrl(currentUrl);
    if (!validation.ok) {
      return { ok: false, error: validation.reason, status: 400 };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Pin the TCP connection to the IP(s) validateUrl just approved, rather
    // than letting the fetch implementation perform its own DNS lookup
    // (which would be vulnerable to DNS rebinding between validation and
    // connection time).
    const dispatcher = new Agent({
      connect: { lookup: createPinnedLookup(validation.hostname, validation.resolvedIps) },
    });

    let response: UndiciResponse;
    try {
      response = await undiciFetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
        },
        dispatcher,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        return { ok: false, error: 'The request to the target URL timed out.', status: 504 };
      }
      return { ok: false, error: 'Failed to reach the target URL.', status: 502 };
    }
    clearTimeout(timeout);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return { ok: false, error: 'The target URL returned a redirect with no destination.', status: 502 };
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      const waf = detectWafFromHeaders(response.headers);
      const hint = waf
        ? ` This looks like it may be ${waf} blocking automated requests rather than a real error on the site.`
        : '';
      return { ok: false, error: `The target URL returned an HTTP ${response.status} error.${hint}`, status: 502 };
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      return { ok: false, error: 'The target URL did not return an HTML page.', status: 400 };
    }

    const body = await readBodyWithLimit(response);
    if (!body.ok) {
      return { ok: false, error: body.error, status: 400 };
    }

    return { ok: true, html: body.text, finalUrl: currentUrl };
  }

  return { ok: false, error: 'Too many redirects.', status: 502 };
}
