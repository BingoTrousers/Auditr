'use client';

import { useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import type { AuditCheck, AuditResult } from '@/lib/types';
import { GROUP_LABELS } from '@/lib/audit/groupLabels';
import { getEntriesForUrl } from '@/lib/history/scanHistory';
import type { ScanHistoryEntry } from '@/lib/history/types';
import { FOCUS_RING, FOCUS_RING_INSET } from './focusRing';
import { prefersReducedMotion } from './prefersReducedMotion';
import ScoreCard from './ScoreCard';
import GroupScoreBar from './GroupScoreBar';
import AuditSection from './AuditSection';
import ExportToolbar from './ExportToolbar';
import CompareSummary from './CompareSummary';

interface ResultsViewProps {
  result: AuditResult;
  previous?: ScanHistoryEntry | null;
  /** ISO timestamp when set — result is a past snapshot loaded from scan history, not a live check. */
  snapshotScannedAt?: string | null;
  /** Re-runs a live audit for this snapshot's URL. Only relevant while snapshotScannedAt is set. */
  onRescan?: () => void;
  rescanning?: boolean;
}

type Tab = 'content' | 'technical';

// Which tab each check group surfaces under: "content" covers on-page
// copy/structure decisions a writer or editor would act on, "technical"
// covers implementation/infrastructure a developer would act on.
const GROUP_TAB: Record<string, Tab> = {
  meta: 'content',
  headings: 'content',
  images: 'content',
  'geo-content': 'content',
  access: 'technical',
  links: 'technical',
  'ai-access': 'technical',
  rendering: 'technical',
  'structured-data': 'technical',
  sitemap: 'technical',
};

const TABS: { tab: Tab; label: string }[] = [
  { tab: 'content', label: 'Content' },
  { tab: 'technical', label: 'Technical' },
];

/**
 * Moves both focus and selection within a single-select horizontal button
 * group (WAI-ARIA "roving tabindex"), per the APG Tabs/Radio Group patterns:
 * Left/Right (and Home/End) move focus, and selection follows focus.
 */
function handleRovingKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  count: number,
  refs: MutableRefObject<(HTMLButtonElement | null)[]>,
  select: (nextIndex: number) => void,
) {
  let nextIndex: number | null = null;
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % count;
  else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + count) % count;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = count - 1;

  if (nextIndex !== null) {
    event.preventDefault();
    select(nextIndex);
    refs.current[nextIndex]?.focus();
  }
}

function Summary({ checks }: { checks: AuditCheck[] }) {
  const counts = { pass: 0, warning: 0, fail: 0 };
  for (const check of checks) {
    counts[check.status] += 1;
  }

  const parts: { text: string; className: string }[] = [];
  if (counts.pass) parts.push({ text: `${counts.pass} passed`, className: 'text-pass-text' });
  if (counts.warning) {
    parts.push({
      text: `${counts.warning} warning${counts.warning > 1 ? 's' : ''}`,
      className: 'text-fail-text',
    });
  }
  if (counts.fail) parts.push({ text: `${counts.fail} failed`, className: 'text-fail-text' });

  return (
    <span className="font-sans text-[13px] font-medium">
      {parts.map((part, index) => (
        <span key={part.text}>
          {index > 0 && <span className="text-ink-3"> · </span>}
          <span className={part.className}>{part.text}</span>
        </span>
      ))}
    </span>
  );
}

function barBand(ratio: number): string {
  if (ratio >= 0.8) return 'bg-pass-text';
  if (ratio >= 0.5) return 'bg-warn-text';
  return 'bg-fail-text';
}

type SortMode = 'opportunity' | 'alphabetical';

const SORT_OPTIONS: { mode: SortMode; label: string }[] = [
  { mode: 'opportunity', label: 'Biggest Opportunity' },
  { mode: 'alphabetical', label: 'A–Z' },
];

function WafWarningBanner({ message, onJump }: { message: string; onJump: () => void }) {
  return (
    <div role="status" className="flex items-start gap-3.5 rounded-xl border border-warn-border bg-warn-bg px-[18px] py-4">
      <span
        aria-hidden="true"
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-warn-text font-sans text-[13px] font-extrabold text-white"
      >
        !
      </span>
      <div className="flex-1">
        <div className="mb-1 font-sans text-sm font-bold text-warn-text">
          This score may be skewed by bot protection
        </div>
        <div className="font-sans text-sm leading-relaxed text-ink-2">{message}</div>
        <button
          type="button"
          onClick={onJump}
          className={`mt-3 rounded-lg border border-warn-border bg-transparent px-4 py-2 font-sans text-[13px] font-bold text-warn-text ${FOCUS_RING}`}
        >
          View details
        </button>
      </div>
    </div>
  );
}

function GainBadge({ potentialGain }: { potentialGain: number }) {
  if (potentialGain <= 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-pass-border bg-pass-bg px-2.5 py-1 font-mono text-xs font-semibold text-pass-text">
        Maxed
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 rounded-full border border-accent-tintBorder bg-accent-tint px-2.5 py-1 font-mono text-xs font-semibold text-accent">
      +{potentialGain} <span className="font-sans text-[10px] font-medium tracking-wide text-accent opacity-80">pts</span>
    </span>
  );
}

export default function ResultsView({ result, previous, snapshotScannedAt, onRescan, rescanning }: ResultsViewProps) {
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});
  const [sortMode, setSortMode] = useState<SortMode>('opportunity');
  const [activeTab, setActiveTab] = useState<Tab>('content');
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sortRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Remounting ScoreCard on every new result (rather than just on score
  // change) is what makes its fill/count-up animation replay on a rescan
  // that lands the same score, not just when the number actually moves.
  const [scoreCardKey, setScoreCardKey] = useState(0);
  const [lastResult, setLastResult] = useState(result);
  if (result !== lastResult) {
    setLastResult(result);
    setScoreCardKey((key) => key + 1);
  }

  const groups = new Map<string, AuditCheck[]>();
  for (const check of result.checks) {
    const existing = groups.get(check.group) ?? [];
    existing.push(check);
    groups.set(check.group, existing);
  }

  const breakdownByGroup = new Map(result.breakdown.map((entry) => [entry.group, entry]));
  const totalPotentialGain = result.breakdown.reduce((sum, entry) => sum + entry.potentialGain, 0);

  const tabScore = (tab: Tab) => {
    const entries = result.breakdown.filter((entry) => (GROUP_TAB[entry.group] ?? 'technical') === tab);
    const weight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (weight === 0) return null;
    const score = entries.reduce((sum, entry) => sum + entry.score, 0);
    return Math.round((score / weight) * 100);
  };
  const topOpportunities = [...result.breakdown]
    .filter((entry) => entry.potentialGain > 0)
    .sort((a, b) => b.potentialGain - a.potentialGain)
    .slice(0, 3);

  const sortedGroups = Array.from(groups.entries())
    .filter(([group]) => (GROUP_TAB[group] ?? 'technical') === activeTab)
    .sort(([groupA], [groupB]) => {
      if (sortMode === 'alphabetical') {
        return (GROUP_LABELS[groupA] ?? groupA).localeCompare(GROUP_LABELS[groupB] ?? groupB);
      }
      const gainA = breakdownByGroup.get(groupA)?.potentialGain ?? 0;
      const gainB = breakdownByGroup.get(groupB)?.potentialGain ?? 0;
      return gainB - gainA;
    });

  const tabGain = (tab: Tab) =>
    result.breakdown
      .filter((entry) => (GROUP_TAB[entry.group] ?? 'technical') === tab)
      .reduce((sum, entry) => sum + entry.potentialGain, 0);

  function jumpToGroup(group: string) {
    setActiveTab(GROUP_TAB[group] ?? 'technical');
    setExpandedOverrides((prev) => ({ ...prev, [group]: true }));
    requestAnimationFrame(() => {
      groupRefs.current[group]?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  }

  const wafCheck = result.checks.find((check) => check.group === 'access' && check.status !== 'pass');

  const sparklineScores = getEntriesForUrl(result.url, {
    limit: 8,
    asOf: snapshotScannedAt ? new Date(snapshotScannedAt).getTime() : Date.now(),
  })
    .map((entry) => entry.result.score)
    .reverse();

  return (
    <div className="flex flex-col gap-6">
      <ScoreCard
        key={scoreCardKey}
        score={result.score}
        url={result.url}
        contentScore={tabScore('content')}
        technicalScore={tabScore('technical')}
        sparklineScores={sparklineScores}
        snapshotScannedAt={snapshotScannedAt}
        onRescan={onRescan}
        rescanning={rescanning}
      />

      {previous && <CompareSummary current={result} previous={previous} />}

      {wafCheck && <WafWarningBanner message={wafCheck.message} onJump={() => jumpToGroup('access')} />}

      {totalPotentialGain > 0 && (
        <div className="rounded-2xl border border-accent-tintBorder bg-accent-tint px-6 py-5 shadow-card">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-sans text-[13px] font-bold uppercase tracking-[0.06em] text-accent">Biggest Wins</h2>
            <span className="font-mono text-lg font-bold text-accent">
              +{totalPotentialGain} <span className="text-sm font-medium">pts available</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {topOpportunities.map((entry) => (
              <button
                key={entry.group}
                type="button"
                onClick={() => jumpToGroup(entry.group)}
                className={`inline-flex items-baseline gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 font-sans text-xs font-semibold text-ink-1 transition hover:border-accent hover:shadow-cardHover ${FOCUS_RING}`}
              >
                {GROUP_LABELS[entry.group] ?? entry.group}
                <span className="font-mono font-semibold text-accent">+{entry.potentialGain}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Result category" className="flex gap-2 border-b border-line">
        {TABS.map(({ tab, label }, index) => {
          const gain = tabGain(tab);
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${tab}`}
              aria-selected={active}
              aria-controls={`tabpanel-${tab}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(e) => handleRovingKeyDown(e, index, TABS.length, tabRefs, (i) => setActiveTab(TABS[i].tab))}
              className={`flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2.5 font-sans text-sm font-bold transition ${FOCUS_RING} ${
                active ? 'border-accent text-ink-1' : 'border-transparent text-ink-3 hover:text-ink-1'
              }`}
            >
              {label}
              {gain > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                    active ? 'bg-accent-tint text-accent' : 'bg-line text-ink-3'
                  }`}
                >
                  +{gain}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span id="sort-by-label" className="font-sans text-[13px] font-semibold text-ink-3">
          Sort by
        </span>
        <div role="radiogroup" aria-labelledby="sort-by-label" className="inline-flex rounded-full border border-line bg-surface p-0.5">
          {SORT_OPTIONS.map((option, index) => {
            const active = sortMode === option.mode;
            return (
              <button
                key={option.mode}
                ref={(el) => {
                  sortRefs.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setSortMode(option.mode)}
                onKeyDown={(e) =>
                  handleRovingKeyDown(e, index, SORT_OPTIONS.length, sortRefs, (i) => setSortMode(SORT_OPTIONS[i].mode))
                }
                className={`rounded-full px-3 py-1.5 font-sans text-xs font-semibold transition ${FOCUS_RING} ${
                  active ? 'bg-accent-tint text-accent' : 'text-ink-3 hover:text-ink-1'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        key={activeTab}
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="flex animate-fade-in flex-col gap-3.5"
      >
        {sortedGroups.map(([group, checks]) => {
          const expanded = expandedOverrides[group] ?? false;
          const groupScore = breakdownByGroup.get(group);
          const ratio = groupScore && groupScore.weight > 0 ? groupScore.score / groupScore.weight : 0;
          const panelId = `group-panel-${group}`;

          return (
            <div
              key={group}
              ref={(el) => {
                groupRefs.current[group] = el;
              }}
              className="scroll-mt-4 overflow-hidden rounded-[14px] border border-line bg-surface"
            >
              <h3 className="contents">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setExpandedOverrides((prev) => ({ ...prev, [group]: !expanded }))}
                  className={`flex w-full flex-col gap-3 px-5 py-4 text-left ${FOCUS_RING_INSET}`}
                >
                  <span className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="inline-block w-3.5 font-sans text-sm text-ink-3">
                        {expanded ? '▾' : '▸'}
                      </span>
                      <span className="font-sans text-lg font-extrabold tracking-tight text-ink-1">
                        {GROUP_LABELS[group] ?? group}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <Summary checks={checks} />
                      {groupScore && <GainBadge potentialGain={groupScore.potentialGain} />}
                    </span>
                  </span>

                  {groupScore && (
                    <GroupScoreBar
                      key={`${group}-${scoreCardKey}`}
                      score={groupScore.score}
                      weight={groupScore.weight}
                      barClassName={barBand(ratio)}
                    />
                  )}
                </button>
              </h3>

              {expanded && (
                <div id={panelId}>
                  {checks.map((check, index) => (
                    <AuditSection
                      key={`${check.label}-${index}`}
                      label={check.label}
                      status={check.status}
                      message={check.message}
                      index={index}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ExportToolbar result={result} scannedAt={snapshotScannedAt ?? null} />
    </div>
  );
}
