'use client';

import { useState } from 'react';
import UrlForm from '@/components/UrlForm';
import ResultsView from '@/components/ResultsView';
import ErrorAlert from '@/components/ErrorAlert';
import type { AuditResult } from '@/lib/types';

const CATEGORY_CHIPS = ['Meta Tags', 'Headings', 'Images', 'Links'];

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
      <header className="mx-auto max-w-[920px] px-8 pb-10 pt-7">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 shrink-0 rounded-lg bg-accent" />
          <span className="font-sans text-[17px] font-extrabold tracking-tight text-ink-1">SEO Audit</span>
        </div>
      </header>

      <div className="mx-auto max-w-[640px] px-8 pb-24">
        <div className="mb-10 text-center">
          <h1 className="mb-3 font-sans text-[34px] font-extrabold tracking-tight text-ink-1">SEO Audit Tool</h1>
          <p className="font-sans text-base leading-relaxed text-ink-2">
            Enter a URL to run a quick, one-off SEO audit — no signup, nothing saved.
          </p>
        </div>

        <UrlForm onSubmit={runAudit} loading={loading} />

        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {CATEGORY_CHIPS.map((chip) => (
            <span
              key={chip}
              className="whitespace-nowrap rounded-full border border-line bg-surface px-[13px] py-1.5 font-sans text-xs font-semibold text-ink-2"
            >
              {chip}
            </span>
          ))}
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
