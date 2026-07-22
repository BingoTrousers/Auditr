# Shareable Permalink & Trend Sparkline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained shareable permalink for an audit report and a per-URL trend sparkline next to the score, both client-only (no new API route, no server persistence).

**Architecture:** Consolidate the two colliding localStorage-based history modules onto `lib/history/scanHistory.ts` (fixing a live bug where "Since Your Last Audit" silently never worked), then build the sparkline as a small presentational SVG component fed by that same history store, and the permalink as a pure encode/decode module using the browser's native `CompressionStream`/`DecompressionStream` to pack a full `AuditResult` into a URL fragment (`#s=...`) that `app/page.tsx` decodes on mount.

**Tech Stack:** TypeScript, Next.js 14 App Router, React 18 client components, native Web `CompressionStream`/`DecompressionStream`/`Blob`/`Response` APIs (no new npm dependency).

## Global Constraints

- No new npm dependencies — compression uses the native `CompressionStream`/`DecompressionStream` Web APIs, already covered by this project's `"lib": ["dom", "dom.iterable", "esnext"]` in `tsconfig.json` (verified: they type-check cleanly under this repo's actual `tsconfig.json` with no changes needed).
- `tsconfig.json` targets `es5`. Two consequences verified directly against this repo's config while preparing this plan:
  - Byte-array loops must use an indexed `for` loop, not `for...of`, over a `Uint8Array` (TS2802 otherwise).
  - Typed-array-returning functions that feed into `new Blob([...])` must be annotated `Uint8Array<ArrayBuffer>`, not bare `Uint8Array` (which defaults to a wider `ArrayBufferLike` that `Blob`'s `BlobPart` type rejects).
- No unit test framework exists in this repo (matches the precedent in `docs/superpowers/plans/2026-07-21-sitemap-check.md`) — do not introduce one. Verification is `npx tsc --noEmit` + `npm run build` + manual `npm run dev` checks, except for the new `lib/audit/permalink.ts` module: its encode/decode logic has no DOM/React dependency, so it can (and should) be run directly and deterministically via `node --experimental-strip-types` against the real file — this was used to validate the exact code in Task 3 below before writing it into this plan.
- All scraped/derived text and any new UI copy must render as plain string JSX children (`{value}`), never `dangerouslySetInnerHTML`.
- Whenever a task adds/removes a file under `lib/` or `components/`, update the file listing in `README.md`'s "Project Structure" section in the same task (it's already out of date in a couple of spots this plan touches — fold the fix in rather than leaving it).

---

### Task 1: Consolidate scan history storage (fixes the `auditr:history` key collision)

**Files:**
- Modify: `lib/history/scanHistory.ts`
- Modify: `app/page.tsx`
- Modify: `components/ResultsView.tsx`
- Modify: `components/CompareSummary.tsx`
- Modify: `README.md`
- Delete: `lib/audit/auditHistory.ts`

**Interfaces:**
- Produces (added to `lib/history/scanHistory.ts`, alongside the existing `getHistory`/`saveToHistory`/`clearHistory`): `normalizeUrl(url: string): string`, `getLatestEntryForUrl(url: string): ScanHistoryEntry | null`, `getEntriesForUrl(url: string, options?: { limit?: number; asOf?: number }): ScanHistoryEntry[]`.
- Consumes: existing `ScanHistoryEntry` type from `lib/history/types.ts` (`{ id: string; scannedAt: string; result: AuditResult }`).

**Context:** `lib/audit/auditHistory.ts` and `lib/history/scanHistory.ts` both read/write `localStorage['auditr:history']` but with incompatible shapes (object-keyed-by-URL vs. array-of-all-scans). `app/page.tsx` calls both on every audit, so the array write always overwrites the object write that ran just before it — meaning `getPreviousResult` has never actually returned anything beyond the same in-memory session. This task removes the redundant/broken module and moves its one useful behavior (per-URL lookup) onto the array store, which already holds everything needed (and more, since it holds full history, not just the latest one).

- [ ] **Step 1: Add the three new functions to `lib/history/scanHistory.ts`**

Current file ends with `clearHistory`. Add this below it:

```typescript
/** Normalizes a URL to origin+pathname (no trailing slash, no query/fragment), lowercased, for history matching. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Most recent saved entry for a URL, or null if this URL has never been scanned before. */
export function getLatestEntryForUrl(url: string): ScanHistoryEntry | null {
  const target = normalizeUrl(url);
  return getHistory().find((entry) => normalizeUrl(entry.result.url) === target) ?? null;
}

/**
 * Up to `limit` entries for a URL (default 8), most-recent-first, restricted
 * to entries scanned at or before `asOf` (default now). The `asOf` cutoff
 * lets a caller viewing an older snapshot see the trend leading up to that
 * point rather than later rescans that happened after it.
 */
export function getEntriesForUrl(url: string, options?: { limit?: number; asOf?: number }): ScanHistoryEntry[] {
  const target = normalizeUrl(url);
  const limit = options?.limit ?? 8;
  const asOf = options?.asOf ?? Date.now();
  return getHistory()
    .filter((entry) => normalizeUrl(entry.result.url) === target && new Date(entry.scannedAt).getTime() <= asOf)
    .slice(0, limit);
}
```

- [ ] **Step 2: Delete `lib/audit/auditHistory.ts`**

```bash
rm lib/audit/auditHistory.ts
```

- [ ] **Step 3: Update `app/page.tsx` to use the consolidated store**

Replace these two import lines:

```typescript
import { getPreviousResult, saveResult, type AuditHistoryEntry } from '@/lib/audit/auditHistory';
import { clearHistory, getHistory, saveToHistory } from '@/lib/history/scanHistory';
```

with:

```typescript
import { clearHistory, getHistory, getLatestEntryForUrl, saveToHistory } from '@/lib/history/scanHistory';
```

Change the state declaration:

```typescript
const [previousResult, setPreviousResult] = useState<AuditHistoryEntry | null>(null);
```

to:

```typescript
const [previousResult, setPreviousResult] = useState<ScanHistoryEntry | null>(null);
```

(`ScanHistoryEntry` is already imported from `@/lib/history/types` a couple of lines below — no new import needed for the type itself.)

In `submitAudit`, replace:

```typescript
    setPreviousResult(getPreviousResult(url));
    saveResult(url, data as AuditResult);
    saveToHistory(data as AuditResult);
```

with:

```typescript
    setPreviousResult(getLatestEntryForUrl(url));
    saveToHistory(data as AuditResult);
```

(The lookup must still happen before `saveToHistory` records the new scan — same ordering as before, just one fewer redundant write.)

- [ ] **Step 4: Update `components/ResultsView.tsx`'s prop type**

Replace:

```typescript
import type { AuditHistoryEntry } from '@/lib/audit/auditHistory';
```

with:

```typescript
import type { ScanHistoryEntry } from '@/lib/history/types';
```

And in `ResultsViewProps`, replace:

```typescript
  previous?: AuditHistoryEntry | null;
```

with:

```typescript
  previous?: ScanHistoryEntry | null;
```

- [ ] **Step 5: Update `components/CompareSummary.tsx`**

Replace:

```typescript
import type { AuditHistoryEntry } from '@/lib/audit/auditHistory';
```

with:

```typescript
import type { ScanHistoryEntry } from '@/lib/history/types';
```

Replace:

```typescript
  previous: AuditHistoryEntry;
```

with:

```typescript
  previous: ScanHistoryEntry;
```

Replace the only field-name difference between the two shapes:

```typescript
  const date = new Date(previous.timestamp).toLocaleString();
```

with:

```typescript
  const date = new Date(previous.scannedAt).toLocaleString();
```

- [ ] **Step 6: Update `README.md`'s Project Structure listing**

`lib/audit/auditHistory.ts` is gone and `lib/history/*` (which already exists but was never added to this listing) is now where the behavior lives. Replace this exact block:

```
  audit/exportFormats.ts     Pure formatters for the Export & Share panel (prompt/checklist/email/markdown/csv/json)
  audit/auditHistory.ts      Client-side (localStorage) per-URL result history for run-over-run comparison
  types.ts                   Shared AuditCheck / AuditResult / GroupScore types
```

with:

```
  audit/exportFormats.ts     Pure formatters for the Export & Share panel (prompt/checklist/email/markdown/csv/json)
  types.ts                   Shared AuditCheck / AuditResult / GroupScore types
  history/scanHistory.ts     All-URL scan history (localStorage, cap 100): getHistory/saveToHistory/clearHistory, plus per-URL lookups (getLatestEntryForUrl, getEntriesForUrl) used by run-over-run comparison and the score trend sparkline
  history/types.ts           ScanHistoryEntry type
  history/relativeTime.ts    "3 hours ago"-style formatting for the Scan History sidebar
```

- [ ] **Step 7: Verify no leftover references and type-check**

```bash
grep -rn "auditHistory\|AuditHistoryEntry" --include="*.ts" --include="*.tsx" .  --exclude-dir=node_modules --exclude-dir=.next
```

Expected: no output (empty).

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 8: Manual verification**

```bash
npm run dev
```

In a browser: run an audit against any URL, then run it again against the *same* URL. Confirm the "Since Your Last Audit" box now appears and shows an accurate score delta (previously this silently never worked past the same session — this is the bug fix). Confirm the Scan History sidebar still lists both runs.

- [ ] **Step 9: Commit**

```bash
git add lib/history/scanHistory.ts app/page.tsx components/ResultsView.tsx components/CompareSummary.tsx README.md
git rm lib/audit/auditHistory.ts
git commit -m "$(cat <<'EOF'
Consolidate scan history onto lib/history/scanHistory.ts

lib/audit/auditHistory.ts and lib/history/scanHistory.ts collided on the
same localStorage key with incompatible shapes, so the array-based write
always clobbered the object-based one right after — meaning "Since Your
Last Audit" has never actually worked beyond the same in-memory session.
Moves the per-URL lookup onto the array store (which already has
everything the object store had, plus full history) and deletes the
redundant module.
EOF
)"
```

---

### Task 2: Trend sparkline next to the score

**Files:**
- Create: `components/ScoreSparkline.tsx`
- Modify: `components/ScoreCard.tsx`
- Modify: `components/ResultsView.tsx`
- Modify: `README.md`

**Interfaces:**
- Produces: `export default function ScoreSparkline({ scores }: { scores: number[] }): JSX.Element | null` — `scores` must be oldest→newest, current result included; returns `null` when `scores.length < 2`.
- Consumes: `getScoreBand` (already exported from `components/ScoreCard.tsx`), `getEntriesForUrl` from `@/lib/history/scanHistory` (Task 1).

- [ ] **Step 1: Write `components/ScoreSparkline.tsx`**

```typescript
import { getScoreBand } from './ScoreCard';

interface ScoreSparklineProps {
  /** Oldest → newest scores for this URL, including the currently displayed result. */
  scores: number[];
}

const WIDTH = 64;
const HEIGHT = 20;
const PADDING = 2;

/** Minimal inline trend line for a URL's recent scores. Renders nothing with fewer than 2 points. */
export default function ScoreSparkline({ scores }: ScoreSparklineProps) {
  if (scores.length < 2) return null;

  const band = getScoreBand(scores[scores.length - 1]);
  const usableHeight = HEIGHT - PADDING * 2;
  const stepX = (WIDTH - PADDING * 2) / (scores.length - 1);

  const points = scores
    .map((score, index) => {
      const x = PADDING + index * stepX;
      const clamped = Math.max(0, Math.min(100, score));
      const y = PADDING + usableHeight * (1 - clamped / 100);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" className={`shrink-0 ${band.text}`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

(`aria-hidden` because the score/band are already announced elsewhere in `ScoreCard` — this is a purely decorative supplement, not new information a screen reader needs read aloud.)

- [ ] **Step 2: Add the prop and render it in `components/ScoreCard.tsx`**

Add the import near the top (after the existing `prefersReducedMotion` import):

```typescript
import ScoreSparkline from './ScoreSparkline';
```

Add to `ScoreCardProps`:

```typescript
  /** Oldest→newest scores for this URL from prior scans (current included). Omit/empty to hide the sparkline. */
  sparklineScores?: number[];
```

Replace the function signature:

```typescript
export default function ScoreCard({
  score,
  url,
  contentScore,
  technicalScore,
  snapshotScannedAt,
  onRescan,
  rescanning,
}: ScoreCardProps) {
```

with:

```typescript
export default function ScoreCard({
  score,
  url,
  contentScore,
  technicalScore,
  sparklineScores,
  snapshotScannedAt,
  onRescan,
  rescanning,
}: ScoreCardProps) {
```

Replace:

```tsx
      <div className="mb-[18px] flex items-baseline gap-2">
        <span className={`font-mono text-[56px] font-bold leading-none ${band.text}`}>{displayScore}</span>
        <span className="font-mono text-xl font-medium text-ink-3">/ 100</span>
      </div>
```

with:

```tsx
      <div className="mb-[18px] flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-[56px] font-bold leading-none ${band.text}`}>{displayScore}</span>
          <span className="font-mono text-xl font-medium text-ink-3">/ 100</span>
        </div>
        {sparklineScores && sparklineScores.length > 0 && <ScoreSparkline scores={sparklineScores} />}
      </div>
```

- [ ] **Step 3: Compute and pass `sparklineScores` from `components/ResultsView.tsx`**

Add the import (alongside the existing `GROUP_LABELS` import):

```typescript
import { getEntriesForUrl } from '@/lib/history/scanHistory';
```

Add this right after the `wafCheck` line (just before the `return (`):

```typescript
  const sparklineScores = getEntriesForUrl(result.url, {
    limit: 8,
    asOf: snapshotScannedAt ? new Date(snapshotScannedAt).getTime() : Date.now(),
  })
    .map((entry) => entry.result.score)
    .reverse();
```

Add the prop to the `<ScoreCard>` call:

```tsx
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
```

- [ ] **Step 4: Update `README.md`'s Project Structure listing and Features list**

Add a line under `components/` (right after the `ScoreCard.tsx` line):

```
  ScoreSparkline.tsx       Small inline SVG trend line of a URL's recent scores, shown next to ScoreCard's big number
```

Add a bullet under `## Features` (right after the existing "Run-over-run comparison" bullet):

```
- Score trend: a small sparkline next to the score shows the last several scans for that URL (from the same localStorage history used for run-over-run comparison), once 2+ prior scans exist
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 6: Manual verification**

```bash
npm run dev
```

Run the same URL 3+ times (varying nothing is fine — even a flat line is a valid trend). Confirm: no sparkline after the 1st run, a sparkline appears after the 2nd run onward, its color matches the current score's band (green/amber/red), and loading an *older* entry from Scan History shows a sparkline reflecting only scans up to that entry's time (not later ones).

- [ ] **Step 7: Commit**

```bash
git add components/ScoreSparkline.tsx components/ScoreCard.tsx components/ResultsView.tsx README.md
git commit -m "$(cat <<'EOF'
Add a per-URL score trend sparkline next to ScoreCard's score

Reuses the scan history consolidated in the previous commit — filtered
to the current URL and, when viewing an older snapshot, cut off at that
snapshot's time so it doesn't show later rescans.
EOF
)"
```

---

### Task 3: Permalink encode/decode module

**Files:**
- Create: `lib/audit/permalink.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: `export function isPermalinkSupported(): boolean`, `export async function encodeResultToFragment(result: AuditResult, scannedAt: string): Promise<string>`, `export async function decodeFragment(fragment: string): Promise<{ scannedAt: string; result: AuditResult } | null>`.
- Consumes: `AuditResult` from `./types`.

This module has no DOM/React dependency beyond globals available in both the browser and modern Node, so its logic is verified directly with `node --experimental-strip-types` in Step 3 below, rather than only via `tsc`.

- [ ] **Step 1: Write `lib/audit/permalink.ts`**

```typescript
import type { AuditResult } from './types';

interface PermalinkPayload {
  scannedAt: string;
  result: AuditResult;
}

/** Native Compression Streams support — no polyfill/dependency; unsupported browsers simply don't get the share button. */
export function isPermalinkSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Compresses a full audit result into a URL-fragment-safe string (only A-Z, a-z, 0-9, "-", "_"). */
export async function encodeResultToFragment(result: AuditResult, scannedAt: string): Promise<string> {
  const payload: PermalinkPayload = { scannedAt, result };
  const json = JSON.stringify(payload);
  const compressed = await gzip(new TextEncoder().encode(json));
  return bytesToBase64Url(compressed);
}

/** Reverses encodeResultToFragment. Returns null (never throws) on any malformed/corrupted input. */
export async function decodeFragment(fragment: string): Promise<PermalinkPayload | null> {
  try {
    const compressed = base64UrlToBytes(fragment);
    const json = new TextDecoder().decode(await gunzip(compressed));
    const parsed = JSON.parse(json);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.scannedAt === 'string' &&
      parsed.result &&
      typeof parsed.result === 'object' &&
      typeof parsed.result.url === 'string' &&
      typeof parsed.result.score === 'number' &&
      Array.isArray(parsed.result.checks) &&
      Array.isArray(parsed.result.breakdown)
    ) {
      return parsed as PermalinkPayload;
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output (clean). (This exact code was already checked against this repo's real `tsconfig.json` while writing this plan — the `Uint8Array<ArrayBuffer>` annotations and indexed `for` loops are required for it to pass under the `es5` target; using bare `Uint8Array` or `for...of` here will reintroduce the two type errors documented in Global Constraints.)

- [ ] **Step 3: Write and run a standalone round-trip check**

Create a throwaway script (not part of the app) at `/tmp/permalink-check.ts`:

```typescript
import { decodeFragment, encodeResultToFragment, isPermalinkSupported } from '/home/charl/website-concepts/Auditr/lib/audit/permalink.ts';
import type { AuditResult } from '/home/charl/website-concepts/Auditr/lib/audit/types.ts';

const sample: AuditResult = {
  url: 'https://example.com',
  score: 87,
  checks: Array.from({ length: 25 }, (_, i) => ({
    group: 'meta',
    label: `Check ${i}`,
    status: 'pass' as const,
    message: 'Looks good and this message repeats a lot across checks to mimic real audit copy.',
  })),
  breakdown: [{ group: 'meta', weight: 11, score: 11, potentialGain: 0 }],
};

const scannedAt = new Date().toISOString();

const encoded = await encodeResultToFragment(sample, scannedAt);
console.log('encoded length:', encoded.length, 'chars');
console.log('fragment-safe:', /^[A-Za-z0-9_-]+$/.test(encoded));

const decoded = await decodeFragment(encoded);
console.log('roundtrip matches:', JSON.stringify(decoded) === JSON.stringify({ scannedAt, result: sample }));

const badResult = await decodeFragment('not-valid-base64!!!');
console.log('invalid input returns null:', badResult === null);

console.log('isPermalinkSupported:', isPermalinkSupported());
```

Run it:

```bash
node --experimental-strip-types /tmp/permalink-check.ts
```

Expected output (encoded length will vary slightly if the sample data above is copied differently, but should be in the low hundreds of characters given how repetitive the sample is):

```
encoded length: 440 chars
fragment-safe: true
roundtrip matches: true
invalid input returns null: true
isPermalinkSupported: true
```

If `roundtrip matches` or `invalid input returns null` print `false`, do not proceed — re-check the file against Step 1 verbatim before moving on.

Delete the throwaway script once it passes:

```bash
rm /tmp/permalink-check.ts
```

- [ ] **Step 4: Update `README.md`'s Project Structure listing**

Add a line under `lib/audit/` (after the `exportFormats.ts` line):

```
  audit/permalink.ts         Compresses/decompresses a full AuditResult to/from a URL-fragment-safe string (native CompressionStream, no dependency) for the shareable permalink
```

- [ ] **Step 5: Commit**

```bash
git add lib/audit/permalink.ts README.md
git commit -m "$(cat <<'EOF'
Add lib/audit/permalink.ts for encoding a report into a URL fragment

Uses native CompressionStream/DecompressionStream (no new dependency).
Verified standalone via node --experimental-strip-types before wiring
into the UI in the next commit.
EOF
)"
```

---

### Task 4: Wire the permalink into the homepage and Export & Share panel

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/ExportToolbar.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `decodeFragment`, `encodeResultToFragment`, `isPermalinkSupported` from `@/lib/audit/permalink` (Task 3).

- [ ] **Step 1: Decode a shared link on mount in `app/page.tsx`**

Add the import (alongside the other `@/lib/audit/*` imports):

```typescript
import { decodeFragment } from '@/lib/audit/permalink';
```

Add new state near the other `useState` declarations:

```typescript
  const [permalinkError, setPermalinkError] = useState<string | null>(null);
```

Add a new effect near the existing `useEffect(() => { setHistoryEntries(getHistory()); }, []);`:

```typescript
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#s=')) return;

    const fragment = hash.slice('#s='.length);
    decodeFragment(fragment).then((decoded) => {
      window.history.replaceState(null, '', window.location.pathname);
      if (!decoded) {
        setPermalinkError("This shared link couldn't be loaded — it may be corrupted or from an incompatible browser.");
        return;
      }
      setResult(decoded.result);
      setSnapshotScannedAt(decoded.scannedAt);
      setLastUrl(decoded.result.url);
    });
  }, []);
```

(Deliberately does **not** call `saveToHistory` — a permalink is someone else's report; recording it would pollute the viewer's own trend/history for that URL. `window.history.replaceState` clears the fragment either way so a refresh doesn't re-decode it and a later Rescan doesn't leave a stale link in the address bar.)

Render the error banner in the empty-state branch, right after the intro paragraph `<div>` and before `<UrlForm onSubmit={runAudit} loading={loading} />`:

```tsx
            {permalinkError && (
              <div className="mb-8 rounded-xl border border-line bg-surface px-4 py-3 text-center font-sans text-sm text-ink-2">
                {permalinkError}
              </div>
            )}

```

- [ ] **Step 2: Add the "Copy Link" action to `components/ExportToolbar.tsx`**

Add the import:

```typescript
import { encodeResultToFragment, isPermalinkSupported } from '@/lib/audit/permalink';
```

Update `ExportToolbarProps`:

```typescript
interface ExportToolbarProps {
  result: AuditResult;
  /** ISO timestamp this result was scanned, if known — null for a just-completed live audit not yet snapshotted (falls back to "now" at share time). */
  scannedAt: string | null;
}
```

Update the function signature:

```typescript
export default function ExportToolbar({ result, scannedAt }: ExportToolbarProps) {
```

Widen the status-tracking union so the same copied/error feedback mechanism covers the new button (`ExportFormat` currently only lists the 6 accordion formats):

```typescript
type ExportFormat = 'prompt' | 'checklist' | 'email' | 'markdown' | 'csv' | 'json';
```

becomes:

```typescript
type ExportFormat = 'prompt' | 'checklist' | 'email' | 'markdown' | 'csv' | 'json' | 'share';
```

Add the handler, right after the existing `copyText` function:

```typescript
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
```

Replace the section header:

```tsx
      <h2 className="mb-1 font-sans text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3">Export &amp; Share</h2>
      <p className="mb-4 font-sans text-sm leading-relaxed text-ink-2">
        Copy this audit in a format that fits your workflow.
      </p>
```

with:

```tsx
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
```

- [ ] **Step 3: Pass `scannedAt` from `components/ResultsView.tsx`**

Replace:

```tsx
      <ExportToolbar result={result} />
```

with:

```tsx
      <ExportToolbar result={result} scannedAt={snapshotScannedAt ?? null} />
```

- [ ] **Step 4: Update `README.md`'s Features list**

Add a bullet under `## Features`, right after the "Export & Share" bullet:

```
- Shareable permalink: "Copy Link" in the Export & Share panel packs the full report (score, every check, breakdown) into a `#s=...` URL fragment via the browser's native `CompressionStream` — no server storage, opening the link reconstructs the exact snapshot client-side with a working Rescan button
```

- [ ] **Step 5: Type-check and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean (no type errors, successful production build).

- [ ] **Step 6: Manual verification**

```bash
npm run dev
```

- Run an audit, open Export & Share, click "Copy Link", confirm the button shows "Link copied!" briefly.
- Paste the copied URL into a new browser tab (or an incognito window, to rule out shared localStorage). Confirm the exact same report renders, with a working "Rescan" button and no sparkline (a fresh browser context has no local history for that URL).
- Manually edit the pasted URL's fragment to something invalid (e.g. truncate half the characters after `#s=`) and reload. Confirm the inline "This shared link couldn't be loaded…" notice appears instead of a crash or blank page.
- Confirm reloading the page after a permalink loads successfully doesn't re-trigger the decode (the fragment should be gone from the address bar).

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx components/ExportToolbar.tsx components/ResultsView.tsx README.md
git commit -m "$(cat <<'EOF'
Wire the shareable permalink into the homepage and Export & Share panel

"Copy Link" builds a #s=<compressed-report> URL; app/page.tsx decodes it
on mount and renders the exact snapshot via the existing scan-history
viewing path, without saving it into the viewer's own local history.
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** Part 1 (history consolidation) → Task 1. Part 2 (sparkline) → Task 2. Part 3 (permalink module + wiring) → Tasks 3–4. README accuracy (raised mid-brainstorming as a related fix, already applied separately for the "nothing persisted" line) → each task keeps the Project Structure/Features sections in sync with the files it touches.
- **Type consistency:** `getEntriesForUrl`/`getLatestEntryForUrl`/`normalizeUrl` names and signatures introduced in Task 1 are used identically in Tasks 2 and 4 (`ScanHistoryEntry`, `entry.result.score`, `entry.scannedAt`). `isPermalinkSupported`/`encodeResultToFragment`/`decodeFragment` introduced in Task 3 are consumed with matching signatures in Task 4. `ScoreSparkline`'s `scores: number[]` prop matches what Task 2 Step 3 computes and passes.
- **No placeholders:** every step has complete, previously-verified code (the permalink module was validated end-to-end with `node --experimental-strip-types` against the real target tsconfig before being written into this plan; the history/sparkline changes are direct, mechanical edits to existing, already-read files).
