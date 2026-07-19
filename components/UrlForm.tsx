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
    <form onSubmit={handleSubmit} noValidate className="flex items-start gap-2.5">
      <div className="flex-1">
        <label htmlFor="audit-url" className="sr-only">
          Website URL to audit
        </label>
        <input
          id="audit-url"
          type="url"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setFieldError(null);
          }}
          disabled={loading}
          placeholder="https://example.com"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? 'url-field-error' : undefined}
          className={`w-full rounded-[10px] border bg-surface px-4 py-[13px] font-sans text-[15px] text-ink-1 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 ${
            fieldError ? 'border-fail-border' : 'border-lineStrong'
          }`}
        />
        {fieldError && (
          <div id="url-field-error" className="mt-2 font-sans text-[13px] text-fail-text">
            {fieldError}
          </div>
        )}
      </div>
      <button
        type="submit"
        disabled={loading}
        className={`grid whitespace-nowrap rounded-[10px] px-[22px] py-[13px] font-sans text-[15px] font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
          loading ? 'cursor-default bg-lineStrong' : 'cursor-pointer bg-accent hover:bg-accent-hover'
        }`}
      >
        {/* Both labels are stacked in the same grid cell so the button reserves
            width for the longer one and never resizes when loading toggles. */}
        <span className={`col-start-1 row-start-1 text-center ${loading ? '' : 'invisible'}`}>Running audit…</span>
        <span className={`col-start-1 row-start-1 text-center ${loading ? 'invisible' : ''}`}>Run Audit</span>
      </button>
    </form>
  );
}
