'use client';

import { FormEvent, useState } from 'react';

interface UrlFormProps {
  onSubmit: (url: string) => void;
  loading: boolean;
}

function isLikelyValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function UrlForm({ onSubmit, loading }: UrlFormProps) {
  const [value, setValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();

    if (!trimmed) {
      setValidationError('Please enter a URL.');
      return;
    }

    if (!isLikelyValidUrl(trimmed)) {
      setValidationError('Please enter a valid http:// or https:// URL.');
      return;
    }

    setValidationError(null);
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://example.com"
          disabled={loading}
          className="w-full rounded-md border border-gray-300 px-4 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
        />
        {validationError && <p className="mt-1 text-sm text-red-600">{validationError}</p>}
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-blue-600 px-6 py-2 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {loading ? 'Auditing…' : 'Run Audit'}
      </button>
    </form>
  );
}
