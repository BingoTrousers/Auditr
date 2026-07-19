'use client';

import { useState } from 'react';
import type { ScanHistoryEntry } from '@/lib/history/types';
import { formatRelativeTime } from '@/lib/history/relativeTime';
import { getScoreBand } from './ScoreCard';
import { FOCUS_RING, FOCUS_RING_INSET } from './focusRing';

interface ScanHistoryProps {
  entries: ScanHistoryEntry[];
  selectedId?: string | null;
  onSelect: (entry: ScanHistoryEntry) => void;
  onClear: () => void;
}

const PAGE_SIZE = 10;

export default function ScanHistory({ entries, selectedId, onSelect, onClear }: ScanHistoryProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // No history yet — the section disappears entirely rather than showing an
  // empty state, so the page can fall back to the simple centered layout.
  if (entries.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-sans text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3">Scan History</h2>
        <button
          type="button"
          onClick={onClear}
          className={`rounded-lg px-2 py-1 font-sans text-xs font-semibold text-ink-3 underline decoration-transparent underline-offset-2 transition hover:text-ink-1 hover:decoration-ink-3 ${FOCUS_RING}`}
        >
          Clear history
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {entries.slice(0, visibleCount).map((entry) => {
            const band = getScoreBand(entry.result.score);
            const isSelected = entry.id === selectedId;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`flex w-full items-center justify-between gap-3 border-l-2 px-4 py-3 text-left transition ${FOCUS_RING_INSET} ${
                    isSelected ? 'border-l-accent bg-accent-tint' : 'border-l-transparent hover:bg-canvas'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-mono text-[13px] ${isSelected ? 'font-semibold text-accent' : 'text-ink-1'}`}>
                      {entry.result.url}
                    </span>
                    <span className="block font-sans text-xs text-ink-3">{formatRelativeTime(entry.scannedAt)}</span>
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 font-mono text-xs font-bold ${band.pill}`}
                  >
                    {entry.result.score}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {visibleCount < entries.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          className={`mt-2 w-full rounded-lg border border-line bg-surface py-2 font-sans text-xs font-semibold text-ink-2 transition hover:text-ink-1 ${FOCUS_RING}`}
        >
          Show more
        </button>
      )}
    </div>
  );
}
