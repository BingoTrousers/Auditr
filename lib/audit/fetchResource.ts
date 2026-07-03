import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from 'undici';
import { isIP, type LookupFunction } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { validateUrl } from './validateUrl';

export interface FetchResourceOptions {
  timeoutMs: number;
  maxBodyBytes: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface FetchResourceSuccess {
  ok: true;
  status: number;
  headers: UndiciResponse['headers'];
  text: string;
  finalUrl: string;
}

export interface FetchResourceFailure {
  ok: false;
  error: string;
  /** HTTP-ish status code to surface to the API caller. */
  status: number;
}

export type FetchResourceResult = FetchResourceSuccess | FetchResourceFailure;

const DEFAULT_MAX_REDIRECTS = 5;

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

async function readBodyWithLimit(
  response: UndiciResponse,
  maxBodyBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const reader = response.body?.getReader();

  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf-8') > maxBodyBytes) {
      return { ok: false, error: 'The response exceeded the maximum allowed size.' };
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
      if (total > maxBodyBytes) {
        await reader.cancel();
        return { ok: false, error: 'The response exceeded the maximum allowed size.' };
      }
      chunks.push(value);
    }
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { ok: true, text: buffer.toString('utf-8') };
}

/**
 * Fetches a URL server-side with SSRF protections (DNS-resolved IP
 * validation, pinned-DNS connection to close the rebinding TOCTOU gap),
 * a timeout, a response size cap, and manual redirect handling where every
 * hop is re-validated. Returns any terminal (non-redirect) HTTP response —
 * including 4xx/5xx — as `ok: true`; only SSRF/network/size/timeout
 * failures are `ok: false`. Callers decide what a given status code means
 * for their use case.
 */
export async function fetchResource(url: string, options: FetchResourceOptions): Promise<FetchResourceResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const validation = await validateUrl(currentUrl);
    if (!validation.ok) {
      return { ok: false, error: validation.reason, status: 400 };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

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
        headers: options.headers,
        dispatcher,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        return { ok: false, error: 'The request timed out.', status: 504 };
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

    const body = await readBodyWithLimit(response, options.maxBodyBytes);
    if (!body.ok) {
      return { ok: false, error: body.error, status: 400 };
    }

    return { ok: true, status: response.status, headers: response.headers, text: body.text, finalUrl: currentUrl };
  }

  return { ok: false, error: 'Too many redirects.', status: 502 };
}
