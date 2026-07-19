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
