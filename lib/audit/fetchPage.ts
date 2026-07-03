import type { Headers as UndiciHeaders } from 'undici';
import { fetchResource } from './fetchResource';

const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 3 * 1024 * 1024; // ~3MB
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
 * Inspects response headers for well-known WAF/bot-protection fingerprints,
 * so a blocked request can be reported as "likely WAF-blocked" rather than
 * a generic HTTP error.
 */
function detectWafFromHeaders(headers: UndiciHeaders): string | null {
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

/**
 * Fetches a URL server-side with SSRF protections, a timeout, a response
 * size cap, and manual redirect handling (each hop is re-validated so an
 * attacker can't redirect us to an internal address after the initial check).
 * See fetchResource for the shared low-level implementation.
 */
export async function fetchPage(url: string): Promise<FetchPageResult> {
  const result = await fetchResource(url, {
    timeoutMs: TIMEOUT_MS,
    maxBodyBytes: MAX_BODY_BYTES,
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!result.ok) {
    return result;
  }

  if (result.status < 200 || result.status >= 300) {
    const waf = detectWafFromHeaders(result.headers);
    const hint = waf
      ? ` This looks like it may be ${waf} blocking automated requests rather than a real error on the site.`
      : '';
    return { ok: false, error: `The target URL returned an HTTP ${result.status} error.${hint}`, status: 502 };
  }

  const contentType = result.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    return { ok: false, error: 'The target URL did not return an HTML page.', status: 400 };
  }

  return { ok: true, html: result.text, finalUrl: result.finalUrl };
}
