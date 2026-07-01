'use client';

import { FormEvent, useState } from 'react';

interface UrlFormProps {
  onSubmit: (url: string) => void;
  loading: boolean;
}

function normalizeUrl(input: string): string {
  return /^https?:\/\//i.test(input) ? input : `https://${input}`;
}

function isLikelyValidUrl(value: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(value));
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

export default function UrlForm({ onSubmit, loading }: UrlFormProps) {
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();

    if (!trimmed || !isLikelyValidUrl(trimmed)) {
      setFieldError('Enter a valid URL, like https://example.com.');
      return;
    }

    setFieldError(null);
    onSubmit(normalizeUrl(trimmed));
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2.5">
      <div className="flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setFieldError(null);
          }}
          disabled={loading}
          placeholder="https://example.com"
          className={`w-full rounded-[10px] border bg-surface px-4 py-[13px] font-sans text-[15px] text-ink-1 outline-none disabled:opacity-60 ${
            fieldError ? 'border-fail-border' : 'border-lineStrong'
          }`}
        />
        {fieldError && <div className="mt-2 font-sans text-[13px] text-fail-text">{fieldError}</div>}
      </div>
      <button
        type="submit"
        disabled={loading}
        className={`whitespace-nowrap rounded-[10px] px-[22px] py-[13px] font-sans text-[15px] font-bold text-white transition-colors ${
          loading ? 'cursor-default bg-lineStrong' : 'cursor-pointer bg-accent hover:bg-accent-hover'
        }`}
      >
        {loading ? 'Running audit…' : 'Run Audit'}
      </button>
    </form>
  );
}
