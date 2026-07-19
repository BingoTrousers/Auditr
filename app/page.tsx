'use client';

import { useEffect, useState } from 'react';
import UrlForm from '@/components/UrlForm';
import ResultsView from '@/components/ResultsView';
import ErrorAlert from '@/components/ErrorAlert';
import ThemeToggle from '@/components/ThemeToggle';
import ScanHistory from '@/components/ScanHistory';
import ResultsPlaceholder from '@/components/ResultsPlaceholder';
import { getPreviousResult, saveResult, type AuditHistoryEntry } from '@/lib/audit/auditHistory';
import { clearHistory, getHistory, saveToHistory } from '@/lib/history/scanHistory';
import type { ScanHistoryEntry } from '@/lib/history/types';
import type { AuditResult } from '@/lib/types';

interface AuditError {
  message: string;
  status: number;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [previousResult, setPreviousResult] = useState<AuditHistoryEntry | null>(null);
  const [error, setError] = useState<AuditError | null>(null);
  const [lastUrl, setLastUrl] = useState('');
  const [snapshotScannedAt, setSnapshotScannedAt] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ScanHistoryEntry[]>([]);

  useEffect(() => {
    setHistoryEntries(getHistory());
  }, []);

  // Once there's either a saved scan or a report on screen, the page earns
  // the wider two-column layout; otherwise it stays a simple centered form.
  const isExpandedLayout = historyEntries.length > 0 || result !== null;
  const containerWidth = isExpandedLayout ? 'max-w-[1280px]' : 'max-w-[640px]';

  async function runAudit(url: string) {
    setLastUrl(url);
    setLoading(true);
    setError(null);
    setResult(null);
    setPreviousResult(null);
    setSnapshotScannedAt(null);

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError({ message: data?.error ?? 'Something went wrong while running the audit.', status: response.status });
        return;
      }

      setPreviousResult(getPreviousResult(url));
      saveResult(url, data as AuditResult);
      saveToHistory(data as AuditResult);
      setHistoryEntries(getHistory());
      setResult(data as AuditResult);
    } catch {
      setError({ message: 'Could not reach the audit service. Please try again.', status: 0 });
    } finally {
      setLoading(false);
    }
  }

  function loadHistoryEntry(entry: ScanHistoryEntry) {
    setError(null);
    setLastUrl(entry.result.url);
    setPreviousResult(null);
    setSnapshotScannedAt(entry.scannedAt);
    setResult(entry.result);
  }

  function handleClearHistory() {
    clearHistory();
    setHistoryEntries([]);
  }

  return (
    <main className="min-h-screen bg-canvas">
      <header className={`mx-auto flex ${containerWidth} items-center justify-between px-6 pb-10 pt-7 sm:px-8 lg:px-10`}>
        <div className="flex items-center gap-2.5">
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
        </div>
        <ThemeToggle />
      </header>

      <div className={`mx-auto ${containerWidth} px-6 pb-24 sm:px-8 lg:px-10`}>
        {isExpandedLayout ? (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-12">
            <div className="lg:sticky lg:top-8">
              <div className="mb-8 text-center lg:mb-10 lg:text-left">
                <h1 className="mb-3 font-sans text-[34px] font-extrabold tracking-tight text-ink-1">Auditr</h1>
                <p className="font-sans text-base leading-relaxed text-ink-2">
                  Enter a URL to run a quick, one-off SEO &amp; GEO audit.
                </p>
              </div>

              <UrlForm onSubmit={runAudit} loading={loading} />

              <div aria-live="polite" className="sr-only">
                {loading && 'Running audit…'}
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

              <ScanHistory entries={historyEntries} onSelect={loadHistoryEntry} onClear={handleClearHistory} />
            </div>

            <div className="min-w-0">
              {result ? (
                <ResultsView result={result} previous={previousResult} snapshotScannedAt={snapshotScannedAt} />
              ) : (
                <ResultsPlaceholder />
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-10 text-center">
              <h1 className="mb-3 font-sans text-[34px] font-extrabold tracking-tight text-ink-1">Auditr</h1>
              <p className="font-sans text-base leading-relaxed text-ink-2">
                Enter a URL to run a quick, one-off SEO &amp; GEO audit.
              </p>
            </div>

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
          </>
        )}
      </div>
    </main>
  );
}
