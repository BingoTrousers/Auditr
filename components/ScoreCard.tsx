import { FOCUS_RING } from './focusRing';

interface ScoreCardProps {
  score: number;
  url: string;
  contentScore?: number | null;
  technicalScore?: number | null;
  /** ISO timestamp when set — this result is a past snapshot loaded from scan history, not a live check. */
  snapshotScannedAt?: string | null;
  /** Re-runs a live audit for this snapshot's URL. Only relevant while snapshotScannedAt is set. */
  onRescan?: () => void;
  rescanning?: boolean;
}

const BANDS = {
  good: {
    label: 'Good',
    pill: 'bg-pass-bg border-pass-border text-pass-text',
    text: 'text-pass-text',
    bar: 'bg-pass-text',
  },
  medium: {
    label: 'Needs Work',
    pill: 'bg-warn-bg border-warn-border text-warn-text',
    text: 'text-warn-text',
    bar: 'bg-warn-text',
  },
  poor: {
    label: 'Poor',
    pill: 'bg-fail-bg border-fail-border text-fail-text',
    text: 'text-fail-text',
    bar: 'bg-fail-text',
  },
} as const;

function getBand(score: number) {
  if (score >= 80) return BANDS.good;
  if (score >= 50) return BANDS.medium;
  return BANDS.poor;
}

/** Shared so other views (e.g. scan history) can reuse the same score → color mapping. */
export function getScoreBand(score: number) {
  return getBand(score);
}

export default function ScoreCard({
  score,
  url,
  contentScore,
  technicalScore,
  snapshotScannedAt,
  onRescan,
  rescanning,
}: ScoreCardProps) {
  const band = getBand(score);
  const clamped = Math.max(0, Math.min(100, score));

  const subScores = [
    { label: 'Content', value: contentScore },
    { label: 'Technical', value: technicalScore },
  ].filter((entry): entry is { label: string; value: number } => typeof entry.value === 'number');

  return (
    <div className="rounded-2xl border border-line bg-surface px-8 py-7">
      <div className="mb-[22px] flex items-start justify-between gap-4">
        <div className="break-all font-mono text-[13px] text-ink-2">{url}</div>
        <div
          className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-[5px] font-sans text-xs font-bold ${band.pill}`}
        >
          {band.label}
        </div>
      </div>

      <div className="mb-[18px] flex items-baseline gap-2">
        <span className={`font-mono text-[56px] font-bold leading-none ${band.text}`}>{score}</span>
        <span className="font-mono text-xl font-medium text-ink-3">/ 100</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${band.bar}`} style={{ width: `${clamped}%` }} />
      </div>

      {subScores.length > 0 && (
        <div className="mt-3 flex gap-4">
          {subScores.map(({ label, value }) => (
            <span key={label} className="font-sans text-xs text-ink-3">
              {label} <span className="font-mono font-semibold text-ink-2">{value}/100</span>
            </span>
          ))}
        </div>
      )}

      {snapshotScannedAt && onRescan && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="font-sans text-xs text-ink-3">
            Snapshot from {new Date(snapshotScannedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <button
            type="button"
            onClick={onRescan}
            disabled={rescanning}
            className={`grid whitespace-nowrap rounded-lg bg-accent px-4 py-2 font-sans text-xs font-bold text-white shadow-card transition-colors hover:bg-accent-hover disabled:cursor-default disabled:opacity-60 ${FOCUS_RING}`}
          >
            {/* Both labels are stacked in the same grid cell so the button
                reserves width for the longer one and never resizes. */}
            <span className={`col-start-1 row-start-1 text-center ${rescanning ? '' : 'invisible'}`}>Rescanning…</span>
            <span className={`col-start-1 row-start-1 text-center ${rescanning ? 'invisible' : ''}`}>Rescan</span>
          </button>
        </div>
      )}
    </div>
  );
}
