import type { AuditResult } from './types';

const STORAGE_KEY = 'auditr:history';
const MAX_ENTRIES = 20;

export interface AuditHistoryEntry {
  timestamp: string;
  result: AuditResult;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function readStore(): Record<string, AuditHistoryEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, AuditHistoryEntry>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded) — comparison
    // is a nice-to-have, so fail silently rather than breaking the audit flow.
  }
}

/** Returns the previously saved audit for this URL, if any. Does not record the current one. */
export function getPreviousResult(url: string): AuditHistoryEntry | null {
  const store = readStore();
  return store[normalizeUrl(url)] ?? null;
}

/** Records this audit as the latest result for its URL, evicting the oldest entry if over capacity. */
export function saveResult(url: string, result: AuditResult): void {
  const store = readStore();
  const key = normalizeUrl(url);
  store[key] = { timestamp: new Date().toISOString(), result };

  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    const oldestKey = keys.reduce((oldest, k) => (store[k].timestamp < store[oldest].timestamp ? k : oldest), keys[0]);
    delete store[oldestKey];
  }

  writeStore(store);
}
