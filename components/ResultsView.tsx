'use client';

import { useState } from 'react';
import type { AuditCheck, AuditResult } from '@/lib/types';
import ScoreCard from './ScoreCard';
import AuditSection from './AuditSection';

interface ResultsViewProps {
  result: AuditResult;
}

const GROUP_LABELS: Record<string, string> = {
  access: 'Access & Bot Protection',
  meta: 'Meta Tags',
  headings: 'Headings',
  images: 'Images',
  links: 'Links',
};

function summarize(checks: AuditCheck[]): string {
  const counts = { pass: 0, warning: 0, fail: 0 };
  for (const check of checks) {
    counts[check.status] += 1;
  }

  const parts: string[] = [];
  if (counts.pass) parts.push(`${counts.pass} passed`);
  if (counts.warning) parts.push(`${counts.warning} warning${counts.warning > 1 ? 's' : ''}`);
  if (counts.fail) parts.push(`${counts.fail} failed`);
  return parts.join(' · ');
}

export default function ResultsView({ result }: ResultsViewProps) {
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});

  const groups = new Map<string, AuditCheck[]>();
  for (const check of result.checks) {
    const existing = groups.get(check.group) ?? [];
    existing.push(check);
    groups.set(check.group, existing);
  }

  return (
    <div className="flex flex-col gap-6">
      <ScoreCard score={result.score} url={result.url} />

      <div className="flex flex-col gap-3.5">
        {Array.from(groups.entries()).map(([group, checks]) => {
          const expanded = expandedOverrides[group] ?? true;

          return (
            <div key={group} className="overflow-hidden rounded-[14px] border border-line bg-surface">
              <button
                type="button"
                onClick={() => setExpandedOverrides((prev) => ({ ...prev, [group]: !expanded }))}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <span className="flex items-center gap-2.5">
                  <span className="inline-block w-3.5 font-sans text-[13px] text-ink-3">{expanded ? '▾' : '▸'}</span>
                  <span className="font-sans text-base font-bold text-ink-1">{GROUP_LABELS[group] ?? group}</span>
                </span>
                <span className="font-sans text-[13px] font-medium text-ink-3">{summarize(checks)}</span>
              </button>

              {expanded && (
                <div>
                  {checks.map((check, index) => (
                    <AuditSection
                      key={`${check.label}-${index}`}
                      label={check.label}
                      status={check.status}
                      message={check.message}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
