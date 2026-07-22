'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuditResult } from '@/lib/types';
import {
  buildCsvReport,
  buildEmailBody,
  buildEmailSubject,
  buildGithubChecklist,
  buildJsonReport,
  buildLlmPrompt,
  buildMarkdownReport,
} from '@/lib/audit/exportFormats';
import { encodeResultToFragment, isPermalinkSupported } from '@/lib/audit/permalink';
import { FOCUS_RING, FOCUS_RING_INSET } from './focusRing';

interface ExportToolbarProps {
  result: AuditResult;
  /** ISO timestamp this result was scanned, if known — null for a just-completed live audit not yet snapshotted (falls back to "now" at share time). */
  scannedAt: string | null;
}

type ExportFormat = 'prompt' | 'checklist' | 'email' | 'markdown' | 'csv' | 'json' | 'share';

const EXPORTS: {
  format: ExportFormat;
  label: string;
  description: string;
  build: (result: AuditResult) => string;
}[] = [
  {
    format: 'prompt',
    label: 'LLM Prompt',
    description: "Paste into Claude Code or another LLM coding assistant so it knows exactly what to fix.",
    build: buildLlmPrompt,
  },
  {
    format: 'checklist',
    label: 'GitHub Checklist',
    description: 'An actionable checklist ready to paste into a GitHub issue or pull request.',
    build: buildGithubChecklist,
  },
  {
    format: 'email',
    label: 'Email',
    description: 'Draft a summary email to whoever owns the fixes.',
    build: buildEmailBody,
  },
  {
    format: 'markdown',
    label: 'Markdown Report',
    description: 'A full write-up of every check, including passes.',
    build: buildMarkdownReport,
  },
  {
    format: 'csv',
    label: 'CSV',
    description: 'A flat spreadsheet of every check, for tracking in Sheets or Excel.',
    build: buildCsvReport,
  },
  {
    format: 'json',
    label: 'JSON',
    description: 'The raw structured result, for feeding into other tooling.',
    build: buildJsonReport,
  },
];

export default function ExportToolbar({ result, scannedAt }: ExportToolbarProps) {
  const [openFormat, setOpenFormat] = useState<ExportFormat | null>(null);
  const [status, setStatus] = useState<{ format: ExportFormat; state: 'copied' | 'error' } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only the open panel's content is ever shown/copied, so build it once per
  // (format, result) pair instead of re-running the formatter on every
  // render for the preview, the copy button, and the mailto link.
  const openContent = useMemo(() => {
    if (!openFormat) return null;
    return EXPORTS.find((e) => e.format === openFormat)?.build(result) ?? null;
  }, [openFormat, result]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function copyText(format: ExportFormat, text: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ format, state: 'copied' });
    } catch {
      setStatus({ format, state: 'error' });
    }
    timeoutRef.current = setTimeout(() => setStatus(null), 2000);
  }

  async function handleCopyLink() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    try {
      const encoded = await encodeResultToFragment(result, scannedAt ?? new Date().toISOString());
      const url = `${window.location.origin}${window.location.pathname}#s=${encoded}`;
      await navigator.clipboard.writeText(url);
      setStatus({ format: 'share', state: 'copied' });
    } catch {
      setStatus({ format: 'share', state: 'error' });
    }
    timeoutRef.current = setTimeout(() => setStatus(null), 2000);
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="font-sans text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3">Export &amp; Share</h2>
        {isPermalinkSupported() && (
          <button
            type="button"
            onClick={handleCopyLink}
            className={`grid shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 font-sans text-xs font-semibold text-ink-2 transition hover:border-accent hover:text-ink-1 ${FOCUS_RING} ${
              status?.format === 'share' && status.state === 'error' ? 'border-fail-border text-fail-text' : ''
            } ${status?.format === 'share' && status.state === 'copied' ? 'border-pass-border text-pass-text' : ''}`}
          >
            <span
              className={`col-start-1 row-start-1 whitespace-nowrap text-center ${
                status?.format === 'share' && status.state === 'copied' ? '' : 'invisible'
              }`}
            >
              Link copied!
            </span>
            <span
              className={`col-start-1 row-start-1 whitespace-nowrap text-center ${
                status?.format === 'share' && status.state === 'error' ? '' : 'invisible'
              }`}
            >
              Copy failed
            </span>
            <span className={`col-start-1 row-start-1 whitespace-nowrap text-center ${status?.format === 'share' ? 'invisible' : ''}`}>
              Copy Link
            </span>
          </button>
        )}
      </div>
      <p className="mb-4 font-sans text-sm leading-relaxed text-ink-2">
        Copy this audit in a format that fits your workflow.
      </p>

      <div className="flex flex-col gap-2">
        {EXPORTS.map(({ format, label, description }) => {
          const isOpen = openFormat === format;
          const isActive = status?.format === format;
          const panelId = `export-panel-${format}`;
          const content = isOpen ? openContent ?? '' : '';

          return (
            <div key={format} className="overflow-hidden rounded-xl border border-line">
              <h3 className="contents">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenFormat(isOpen ? null : format)}
                  className={`flex w-full items-center gap-2.5 px-4 py-3 text-left ${FOCUS_RING_INSET}`}
                >
                  <span aria-hidden="true" className="inline-block w-3.5 shrink-0 font-sans text-sm text-ink-3">
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-sans text-sm font-bold text-ink-1">{label}</span>
                    <span className="font-sans text-xs text-ink-3">{description}</span>
                  </span>
                </button>
              </h3>

              {isOpen && (
                <div id={panelId} className="border-t border-line px-4 py-3">
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3 font-mono text-xs leading-relaxed text-ink-1">
                    {content}
                  </pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => copyText(format, content)}
                      className={`grid rounded-lg border border-line bg-surface px-3.5 py-1.5 font-sans text-xs font-semibold text-ink-2 transition hover:border-accent hover:text-ink-1 ${FOCUS_RING} ${
                        isActive && status.state === 'error' ? 'border-fail-border text-fail-text' : ''
                      } ${isActive && status.state === 'copied' ? 'border-pass-border text-pass-text' : ''}`}
                    >
                      {/* All three label variants are stacked in the same grid cell so the
                          button reserves width for the widest one and never resizes on click. */}
                      <span className={`col-start-1 row-start-1 whitespace-nowrap text-center ${isActive && status.state === 'copied' ? '' : 'invisible'}`}>
                        Copied!
                      </span>
                      <span className={`col-start-1 row-start-1 whitespace-nowrap text-center ${isActive && status.state === 'error' ? '' : 'invisible'}`}>
                        Copy failed
                      </span>
                      <span className={`col-start-1 row-start-1 whitespace-nowrap text-center ${isActive ? 'invisible' : ''}`}>
                        Copy {label}
                      </span>
                    </button>
                    {format === 'email' && (
                      <a
                        href={`mailto:?subject=${encodeURIComponent(buildEmailSubject(result))}&body=${encodeURIComponent(content)}`}
                        className={`rounded-lg border border-line bg-surface px-3.5 py-1.5 font-sans text-xs font-semibold text-ink-2 transition hover:border-accent hover:text-ink-1 ${FOCUS_RING}`}
                      >
                        Open in Email App
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <span aria-live="polite" className="sr-only">
        {status?.state === 'copied' &&
          `${status.format === 'share' ? 'Link' : EXPORTS.find((e) => e.format === status.format)?.label} copied to clipboard.`}
        {status?.state === 'error' && 'Failed to copy to clipboard.'}
      </span>
    </section>
  );
}
