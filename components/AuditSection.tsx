import type { CheckStatus } from '@/lib/types';
import { CHECK_EXPLANATIONS } from '@/lib/audit/checkExplanations';

interface AuditSectionProps {
  label: string;
  status: CheckStatus;
  message: string;
  /** Position within its group, used to stagger the reveal animation when the group expands. */
  index: number;
}

// Caps the stagger so a group with many checks still finishes revealing
// quickly, matching the score card's "plays fast" animation.
const MAX_STAGGER_STEPS = 8;
const STAGGER_STEP_MS = 35;

const STATUS_STYLES: Record<CheckStatus, { pill: string; dot: string; label: string }> = {
  pass: { pill: 'bg-pass-bg border-pass-border text-pass-text', dot: 'bg-pass-dot', label: 'Pass' },
  warning: { pill: 'bg-warn-bg border-warn-border text-warn-text', dot: 'bg-warn-dot', label: 'Warning' },
  fail: { pill: 'bg-fail-bg border-fail-border text-fail-text', dot: 'bg-fail-dot', label: 'Fail' },
};

export default function AuditSection({ label, status, message, index }: AuditSectionProps) {
  const styles = STATUS_STYLES[status];
  const why = CHECK_EXPLANATIONS[label];
  const delayMs = Math.min(index, MAX_STAGGER_STEPS) * STAGGER_STEP_MS;

  return (
    <div className="animate-row-in border-t border-line px-5 py-4" style={{ animationDelay: `${delayMs}ms` }}>
      <div className="mb-1.5 flex items-start justify-between gap-4">
        <span className="font-sans text-[15px] font-semibold text-ink-1">{label}</span>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-[11px] py-1 font-sans text-xs font-semibold ${styles.pill}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
          {styles.label}
        </span>
      </div>
      <div className="max-w-[560px] whitespace-pre-line font-sans text-sm leading-relaxed text-ink-2">{message}</div>
      {why && (
        <div className="mt-2.5 max-w-[560px] rounded-lg border-l-2 border-line bg-canvas py-1.5 pl-3 pr-3">
          <div className="font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-ink-3">Why this matters</div>
          <div className="mt-0.5 font-sans text-xs leading-relaxed text-ink-3">{why}</div>
        </div>
      )}
    </div>
  );
}
