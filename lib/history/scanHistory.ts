import type { AuditResult } from '@/lib/types';
import type { ScanHistoryEntry } from './types';

const STORAGE_KEY = 'auditr:history';
const MAX_ENTRIES = 100;

/** Returns saved scan history, most recent first. Empty on any read/parse failure. */
export function getHistory(): ScanHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Prepends a new entry and caps the list at MAX_ENTRIES. Never throws. */
export function saveToHistory(result: AuditResult): void {
  if (typeof window === 'undefined') return;

  const entry: ScanHistoryEntry = {
    id: crypto.randomUUID(),
    scannedAt: new Date().toISOString(),
    result,
  };
  const next = [entry, ...getHistory()].slice(0, MAX_ENTRIES);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded, private browsing, or storage disabled — history is a
    // nice-to-have, so the scan itself must not fail because of this.
  }
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Normalizes a URL to origin+pathname (no trailing slash, no query/fragment), lowercased, for history matching. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Most recent saved entry for a URL, or null if this URL has never been scanned before. */
export function getLatestEntryForUrl(url: string): ScanHistoryEntry | null {
  const target = normalizeUrl(url);
  return getHistory().find((entry) => normalizeUrl(entry.result.url) === target) ?? null;
}

/**
 * Up to `limit` entries for a URL (default 8), most-recent-first, restricted
 * to entries scanned at or before `asOf` (default now). The `asOf` cutoff
 * lets a caller viewing an older snapshot see the trend leading up to that
 * point rather than later rescans that happened after it.
 */
export function getEntriesForUrl(url: string, options?: { limit?: number; asOf?: number }): ScanHistoryEntry[] {
  const target = normalizeUrl(url);
  const limit = options?.limit ?? 8;
  const asOf = options?.asOf ?? Date.now();
  return getHistory()
    .filter((entry) => normalizeUrl(entry.result.url) === target && new Date(entry.scannedAt).getTime() <= asOf)
    .slice(0, limit);
}
