'use client';

import { FormEvent, useState } from 'react';
import { FOCUS_RING } from './focusRing';

interface UrlFormProps {
  onSubmit: (url: string) => void;
  loading: boolean;
  /** Sidebar/two-column context: the submit button sits inside the input as a short "Run" pill instead of a full-width bar below it. */
  compact?: boolean;
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

export default function UrlForm({ onSubmit, loading, compact }: UrlFormProps) {
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

  const input = (
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
      className={`w-full rounded-[10px] border bg-surface py-[13px] font-sans text-[15px] text-ink-1 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 ${
        compact ? 'pl-4 pr-[76px]' : 'px-4'
      } ${fieldError ? 'border-fail-border' : 'border-lineStrong'}`}
    />
  );

  const button = (
    <button
      type="submit"
      disabled={loading}
      className={`grid whitespace-nowrap font-sans font-bold text-white transition-colors disabled:cursor-default ${FOCUS_RING} ${
        compact
          ? 'absolute inset-y-1.5 right-1.5 place-items-center rounded-[8px] px-3 text-xs'
          : 'self-end rounded-[10px] px-4 py-2.5 text-sm focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
      } ${loading ? 'bg-lineStrong' : 'cursor-pointer bg-accent hover:bg-accent-hover'}`}
    >
      {/* Both labels are stacked in the same grid cell so the button reserves
          width for the longer one and never resizes when loading toggles. */}
      <span className={`col-start-1 row-start-1 text-center ${loading ? '' : 'invisible'}`}>
        {compact ? 'Running…' : 'Running audit…'}
      </span>
      <span className={`col-start-1 row-start-1 text-center ${loading ? 'invisible' : ''}`}>
        {compact ? 'Run' : 'Run Audit'}
      </span>
    </button>
  );

  const label = (
    <label htmlFor="audit-url" className="sr-only">
      Website URL to audit
    </label>
  );

  const error = fieldError && (
    <div id="url-field-error" className="mt-2 font-sans text-[13px] text-fail-text">
      {fieldError}
    </div>
  );

  if (compact) {
    return (
      <form onSubmit={handleSubmit} noValidate>
        <div className="relative">
          {label}
          {input}
          {button}
        </div>
        {error}
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2.5">
      <div>
        {label}
        {input}
        {error}
      </div>
      {button}
    </form>
  );
}
