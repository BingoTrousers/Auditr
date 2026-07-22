'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import UrlForm from '@/components/UrlForm';
import ResultsView from '@/components/ResultsView';
import ErrorAlert from '@/components/ErrorAlert';
import ThemeToggle from '@/components/ThemeToggle';
import ScanHistory from '@/components/ScanHistory';
import { FOCUS_RING } from '@/components/focusRing';
import { clearHistory, getHistory, getLatestEntryForUrl, saveToHistory } from '@/lib/history/scanHistory';
import type { ScanHistoryEntry } from '@/lib/history/types';
import type { AuditResult } from '@/lib/types';
import { decodeFragment } from '@/lib/audit/permalink';

interface AuditError {
  message: string;
  status: number;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [previousResult, setPreviousResult] = useState<ScanHistoryEntry | null>(null);
  const [error, setError] = useState<AuditError | null>(null);
  const [lastUrl, setLastUrl] = useState('');
  const [snapshotScannedAt, setSnapshotScannedAt] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ScanHistoryEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [permalinkError, setPermalinkError] = useState<string | null>(null);

  useEffect(() => {
    setHistoryEntries(getHistory());
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#s=')) return;

    const fragment = hash.slice('#s='.length);
    decodeFragment(fragment).then((decoded) => {
      window.history.replaceState(null, '', window.location.pathname);
      if (!decoded) {
        setPermalinkError("This shared link couldn't be loaded — it may be corrupted or from an incompatible browser.");
        return;
      }
      setResult(decoded.result);
      setSnapshotScannedAt(decoded.scannedAt);
      setLastUrl(decoded.result.url);
    });
  }, []);

  // The wide two-column layout only appears once a report is actually on
  // screen; otherwise (including right after navigating back from another
  // page) it's a simple centered form with history listed underneath, never
  // a sidebar next to an empty "no results yet" panel.
  const containerWidth = result ? 'max-w-[1280px]' : 'max-w-[640px]';
  const containerPadding = 'px-6 sm:px-8 lg:px-10';

  /** Runs the audit and syncs comparison/history state. Returns the result and its new history entry id, or null on a handled error. */
  async function submitAudit(url: string): Promise<{ result: AuditResult; entryId: string | null } | null> {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError({ message: data?.error ?? 'Something went wrong while running the audit.', status: response.status });
      return null;
    }

    setPreviousResult(getLatestEntryForUrl(data.url));
    saveToHistory(data as AuditResult);
    const entries = getHistory();
    setHistoryEntries(entries);
    return { result: data as AuditResult, entryId: entries[0]?.id ?? null };
  }

  async function runAudit(url: string) {
    setLastUrl(url);
    setLoading(true);
    setError(null);
    setPreviousResult(null);
    setSnapshotScannedAt(null);

    try {
      // The previous result (if any) stays on screen — with the form showing
      // its own "running" state — instead of being cleared out immediately,
      // so the layout never collapses back to a single column mid-request.
      const outcome = await submitAudit(url);
      if (outcome) {
        setResult(outcome.result);
        setSelectedEntryId(outcome.entryId);
      }
    } catch {
      setError({ message: 'Could not reach the audit service. Please try again.', status: 0 });
    } finally {
      setLoading(false);
    }
  }

  /** Re-runs a live audit for the snapshot currently on screen, replacing it in place once it lands. */
  async function rescanCurrent() {
    if (!result) return;
    const url = result.url;
    setLastUrl(url);
    setRescanning(true);
    setError(null);

    try {
      const outcome = await submitAudit(url);
      if (outcome) {
        setResult(outcome.result);
        setSnapshotScannedAt(null);
        setSelectedEntryId(outcome.entryId);
      }
    } catch {
      setError({ message: 'Could not reach the audit service. Please try again.', status: 0 });
    } finally {
      setRescanning(false);
    }
  }

  function loadHistoryEntry(entry: ScanHistoryEntry) {
    setError(null);
    setLastUrl(entry.result.url);
    setPreviousResult(null);
    setSnapshotScannedAt(entry.scannedAt);
    setResult(entry.result);
    setSelectedEntryId(entry.id);
  }

  function handleClearHistory() {
    clearHistory();
    setHistoryEntries([]);
    setSelectedEntryId(null);
  }

  /** Returns to the pre-scan homepage view, discarding the currently displayed result. */
  function goHome() {
    setResult(null);
    setPreviousResult(null);
    setError(null);
    setLastUrl('');
    setSnapshotScannedAt(null);
    setSelectedEntryId(null);
  }

  return (
    <main className="min-h-screen bg-canvas">
      <header className={`mx-auto flex ${containerWidth} items-center justify-between ${containerPadding} pb-10 pt-7`}>
        <button
          type="button"
          onClick={goHome}
          className={`flex items-center gap-2.5 rounded-lg ${FOCUS_RING}`}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
          </div>
          <span className="font-sans text-[17px] font-extrabold tracking-tight text-ink-1">Auditr</span>
        </button>
        <div className="flex items-center gap-4">
          <Link href="/about" className="font-sans text-sm font-semibold text-ink-2 hover:text-ink-1">
            About
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className={`mx-auto ${containerWidth} ${containerPadding} pb-24`}>
        {result ? (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-12">
            <div className="lg:sticky lg:top-8">
              <div className="mb-8 text-center lg:mb-10 lg:text-left">
                <h1 className="mb-3 font-sans text-[34px] font-extrabold tracking-tight text-ink-1">Auditr</h1>
                <p className="font-sans text-base leading-relaxed text-ink-2">
                  Enter a URL to run a quick SEO &amp; GEO audit.
                </p>
              </div>

              <UrlForm onSubmit={runAudit} loading={loading || rescanning} compact />

              <div aria-live="polite" className="sr-only">
                {(loading || rescanning) && 'Running audit…'}
                {error && `Audit failed: ${error.message}`}
                {result && `Audit complete. Score: ${result.score} out of 100.`}
              </div>

              {error && (
                <div className="mt-8">
                  <ErrorAlert
                    status={error.status}
                    message={error.message}
                    onRetry={lastUrl ? () => runAudit(lastUrl) : undefined}
                  />
                </div>
              )}

              <ScanHistory entries={historyEntries} selectedId={selectedEntryId} onSelect={loadHistoryEntry} onClear={handleClearHistory} />
            </div>

            <div className="min-w-0">
              <ResultsView
                result={result}
                previous={previousResult}
                snapshotScannedAt={snapshotScannedAt}
                onRescan={rescanCurrent}
                rescanning={rescanning}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="mb-10 text-center">
              <h1 className="mb-3 font-sans text-[34px] font-extrabold tracking-tight text-ink-1">Auditr</h1>
              <p className="font-sans text-base leading-relaxed text-ink-2">
                Enter a URL to run a quick SEO &amp; GEO audit.
              </p>
            </div>

            {permalinkError && (
              <div className="mb-8 rounded-xl border border-line bg-surface px-4 py-3 text-center font-sans text-sm text-ink-2">
                {permalinkError}
              </div>
            )}

            <UrlForm onSubmit={runAudit} loading={loading} />

            <div aria-live="polite" className="sr-only">
              {loading && 'Running audit…'}
              {error && `Audit failed: ${error.message}`}
            </div>

            {error && (
              <div className="mt-8">
                <ErrorAlert
                  status={error.status}
                  message={error.message}
                  onRetry={lastUrl ? () => runAudit(lastUrl) : undefined}
                />
              </div>
            )}

            <ScanHistory entries={historyEntries} selectedId={selectedEntryId} onSelect={loadHistoryEntry} onClear={handleClearHistory} />
          </>
        )}
      </div>
    </main>
  );
}
