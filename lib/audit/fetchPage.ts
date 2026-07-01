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

async function readBodyWithLimit(response: Response): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
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

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
        },
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
      return { ok: false, error: `The target URL returned an HTTP ${response.status} error.`, status: 502 };
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
