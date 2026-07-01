'use client';

import { useState } from 'react';
import UrlForm from '@/components/UrlForm';
import ResultsView from '@/components/ResultsView';
import type { AuditResult } from '@/lib/types';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(url: string) {
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
        setError(data?.error ?? 'Something went wrong while running the audit.');
        return;
      }

      setResult(data as AuditResult);
    } catch {
      setError('Could not reach the audit service. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">SEO Audit Tool</h1>
        <p className="mt-2 text-gray-600">
          Enter a URL to run a quick, one-off SEO audit — no signup, nothing saved.
        </p>
      </div>

      <UrlForm onSubmit={handleSubmit} loading={loading} />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && <ResultsView result={result} />}
    </main>
  );
}
