'use client';

import { useState } from 'react';
import UrlForm from '@/components/UrlForm';
import ResultsView from '@/components/ResultsView';
import ErrorAlert from '@/components/ErrorAlert';
import ThemeToggle from '@/components/ThemeToggle';
import type { AuditResult } from '@/lib/types';

interface AuditError {
  message: string;
  status: number;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<AuditError | null>(null);
  const [lastUrl, setLastUrl] = useState('');

  async function runAudit(url: string) {
    setLastUrl(url);
    setLoading(true);
    setError(null);
    setResult(null);

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

      setResult(data as AuditResult);
    } catch {
      setError({ message: 'Could not reach the audit service. Please try again.', status: 0 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-[920px] items-center justify-between px-8 pb-10 pt-7">
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

      <div className="mx-auto max-w-[640px] px-8 pb-24">
        <div className="mb-10 text-center">
          <h1 className="mb-3 font-sans text-[34px] font-extrabold tracking-tight text-ink-1">Auditr</h1>
          <p className="font-sans text-base leading-relaxed text-ink-2">
            Enter a URL to run a quick, one-off SEO audit.
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
      </div>

      {result && (
        <div className="mx-auto max-w-[760px] px-8 pb-24">
          <ResultsView result={result} />
        </div>
      )}
    </main>
  );
}
