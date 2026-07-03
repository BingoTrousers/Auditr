'use client';

import { useEffect, useRef, useState } from 'react';
import type { AuditResult } from '@/lib/types';
import {
  buildCsvReport,
  buildGithubChecklist,
  buildJsonReport,
  buildLlmPrompt,
  buildMarkdownReport,
} from '@/lib/audit/exportFormats';
import { FOCUS_RING, FOCUS_RING_INSET } from './focusRing';

interface ExportToolbarProps {
  result: AuditResult;
}

type ExportFormat = 'prompt' | 'checklist' | 'markdown' | 'csv' | 'json';

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
    format: 'markdown',
    label: 'Markdown Report',
    description: 'A full write-up of every check, including passes — good for sharing or docs.',
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

export default function ExportToolbar({ result }: ExportToolbarProps) {
  const [openFormat, setOpenFormat] = useState<ExportFormat | null>(null);
  const [status, setStatus] = useState<{ format: ExportFormat; state: 'copied' | 'error' } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-1 font-sans text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3">Export &amp; Share</h2>
      <p className="mb-4 font-sans text-sm leading-relaxed text-ink-2">
        Copy this audit in a format that fits your workflow. Preview a format to see exactly what gets copied.
      </p>

      <div className="flex flex-col gap-2">
        {EXPORTS.map(({ format, label, description, build }) => {
          const isOpen = openFormat === format;
          const isActive = status?.format === format;
          const panelId = `export-panel-${format}`;

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
                    {build(result)}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyText(format, build(result))}
                    className={`mt-3 rounded-lg border border-line bg-surface px-3.5 py-1.5 font-sans text-xs font-semibold text-ink-2 transition hover:border-accent hover:text-ink-1 ${FOCUS_RING} ${
                      isActive && status.state === 'error' ? 'border-fail-border text-fail-text' : ''
                    } ${isActive && status.state === 'copied' ? 'border-pass-border text-pass-text' : ''}`}
                  >
                    {isActive ? (status.state === 'copied' ? 'Copied!' : 'Copy failed') : `Copy ${label}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <span aria-live="polite" className="sr-only">
        {status?.state === 'copied' && `${EXPORTS.find((e) => e.format === status.format)?.label} copied to clipboard.`}
        {status?.state === 'error' && 'Failed to copy to clipboard.'}
      </span>
    </section>
  );
}
