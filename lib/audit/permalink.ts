import type { AuditResult } from './types';

interface PermalinkPayload {
  scannedAt: string;
  result: AuditResult;
}

/** Native Compression Streams support — no polyfill/dependency; unsupported browsers simply don't get the share button. */
export function isPermalinkSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Compresses a full audit result into a URL-fragment-safe string (only A-Z, a-z, 0-9, "-", "_"). */
export async function encodeResultToFragment(result: AuditResult, scannedAt: string): Promise<string> {
  const payload: PermalinkPayload = { scannedAt, result };
  const json = JSON.stringify(payload);
  const compressed = await gzip(new TextEncoder().encode(json));
  return bytesToBase64Url(compressed);
}

/** Reverses encodeResultToFragment. Returns null (never throws) on any malformed/corrupted input. */
export async function decodeFragment(fragment: string): Promise<PermalinkPayload | null> {
  try {
    const compressed = base64UrlToBytes(fragment);
    const json = new TextDecoder().decode(await gunzip(compressed));
    const parsed = JSON.parse(json);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.scannedAt === 'string' &&
      parsed.result &&
      typeof parsed.result === 'object' &&
      typeof parsed.result.url === 'string' &&
      typeof parsed.result.score === 'number' &&
      Array.isArray(parsed.result.checks) &&
      Array.isArray(parsed.result.breakdown)
    ) {
      return parsed as PermalinkPayload;
    }
    return null;
  } catch {
    return null;
  }
}
