import type { AuditHistoryEntry } from '@/lib/audit/auditHistory';
import type { AuditCheck, AuditResult } from '@/lib/types';

interface CompareSummaryProps {
  current: AuditResult;
  previous: AuditHistoryEntry;
}

function checkKey(check: AuditCheck): string {
  return `${check.group}::${check.label}`;
}

const STATUS_RANK: Record<AuditCheck['status'], number> = { fail: 0, warning: 1, pass: 2 };

export default function CompareSummary({ current, previous }: CompareSummaryProps) {
  const scoreDelta = current.score - previous.result.score;
  const previousByKey = new Map(previous.result.checks.map((check) => [checkKey(check), check]));

  const fixed: AuditCheck[] = [];
  const regressed: AuditCheck[] = [];

  for (const check of current.checks) {
    const prevCheck = previousByKey.get(checkKey(check));
    if (!prevCheck) continue;
    if (STATUS_RANK[check.status] > STATUS_RANK[prevCheck.status]) fixed.push(check);
    else if (STATUS_RANK[check.status] < STATUS_RANK[prevCheck.status]) regressed.push(check);
  }

  const date = new Date(previous.timestamp).toLocaleString();
  const scoreClass = scoreDelta > 0 ? 'text-pass-text' : scoreDelta < 0 ? 'text-fail-text' : 'text-ink-2';

  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-sans text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3">Since Your Last Audit</h2>
        <span className={`font-mono text-lg font-bold ${scoreClass}`}>
          {previous.result.score} → {current.score}{' '}
          <span className="text-sm font-medium">
            ({scoreDelta > 0 ? '+' : ''}
            {scoreDelta})
          </span>
        </span>
      </div>
      <p className="mb-3 font-sans text-xs text-ink-3">Compared to your audit on {date}</p>

      {fixed.length === 0 && regressed.length === 0 && (
        <p className="font-sans text-sm text-ink-2">No checks changed status since then.</p>
      )}
      {fixed.length > 0 && (
        <p className="mb-1.5 font-sans text-sm leading-relaxed text-pass-text">
          <span className="font-semibold">{fixed.length} fixed:</span> {fixed.map((check) => check.label).join(', ')}
        </p>
      )}
      {regressed.length > 0 && (
        <p className="font-sans text-sm leading-relaxed text-fail-text">
          <span className="font-semibold">{regressed.length} regressed:</span>{' '}
          {regressed.map((check) => check.label).join(', ')}
        </p>
      )}
    </div>
  );
}
