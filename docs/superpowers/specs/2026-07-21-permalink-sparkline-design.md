# Shareable Permalink & Trend Sparkline — Design

## Purpose

Add two client-only features that build on the existing scan-history
mechanism: a self-contained shareable link for a report, and a small
per-URL score trend sparkline. Neither requires a new API route or any
server-side persistence — both stay within the "stateless, no database"
architecture.

Building these surfaced a pre-existing bug: `lib/audit/auditHistory.ts`
and `lib/history/scanHistory.ts` both read/write the same localStorage key
(`'auditr:history'`) but store incompatible shapes (an object keyed by
normalized URL vs. an array of all scans). Since `app/page.tsx` calls both
on every audit, the array write always clobbers the object write
immediately after, so the "Since Your Last Audit" comparison has never
actually worked beyond the same in-memory session. Fixing this is a
prerequisite for the sparkline (which needs reliable multi-entry history
per URL), so it's folded into this spec rather than treated separately.

## Part 1 — History consolidation

`lib/history/scanHistory.ts` becomes the single source of truth for scan
history (it already stores an unbounded-per-URL, cap-100-total, most-recent-
first array — a superset of what `auditHistory.ts` provided).

Delete `lib/audit/auditHistory.ts` (`AuditHistoryEntry`, `getPreviousResult`,
`saveResult`, its private `normalizeUrl`) and add to `lib/history/scanHistory.ts`:

- `normalizeUrl(url: string): string` — moved over verbatim (strip trailing
  slash, lowercase, origin+pathname only).
- `getLatestEntryForUrl(url: string): ScanHistoryEntry | null` — most recent
  entry for a normalized URL, or `null`. Replaces `getPreviousResult`.
- `getEntriesForUrl(url: string, options?: { limit?: number; asOf?: number }): ScanHistoryEntry[]` —
  entries for a normalized URL, filtered to `scannedAt <= asOf` (default
  `Date.now()`), most-recent-first, sliced to `limit` (default 8).

**`app/page.tsx` changes:**
- Remove the `lib/audit/auditHistory` import.
- In `submitAudit`, replace `setPreviousResult(getPreviousResult(url))` with
  `setPreviousResult(getLatestEntryForUrl(url))`, read *before*
  `saveToHistory` runs (unchanged ordering requirement — must capture the
  prior entry before the new one is recorded).
- Remove the now-redundant `saveResult(url, data)` call — `saveToHistory`
  is the only write.
- `previousResult` state type becomes `ScanHistoryEntry | null` (from
  `@/lib/history/types`).

**`components/ResultsView.tsx`:** `previous?: AuditHistoryEntry | null` prop
type becomes `previous?: ScanHistoryEntry | null`, import path updated.

**`components/CompareSummary.tsx`:** prop type updated to `ScanHistoryEntry`;
`previous.timestamp` → `previous.scannedAt` (only field-name difference
between the two shapes).

## Part 2 — Trend sparkline

**New `components/ScoreSparkline.tsx`** (presentational, no state):
- Props: `scores: number[]` (oldest → newest, current scan included).
- Returns `null` if `scores.length < 2`.
- Renders a small inline SVG (`~64×20px`) with a single polyline plotted
  from the score values (0–100 range mapped to the viewBox height), colored
  via the existing `getScoreBand(scores.at(-1))` band color (reuses
  `ScoreCard`'s exported `getScoreBand`, no new color logic).
- No axes, labels, gridlines, or tooltip — deliberately minimal, matching
  the "neat and subtle" brief.

**`components/ResultsView.tsx`:**
- Computes `sparklineScores = getEntriesForUrl(result.url, { limit: 8, asOf: snapshotScannedAt ? new Date(snapshotScannedAt).getTime() : Date.now() }).map(e => e.result.score).reverse()`.
- The `asOf` cutoff means viewing an older snapshot from Scan History shows
  the trend *up to that snapshot's time*, not later rescans recorded since
  — avoids showing "future" data next to a past result.
- Passes `sparklineScores` to `ScoreCard` as a new prop.

**`components/ScoreCard.tsx`:** renders `<ScoreSparkline scores={sparklineScores} />`
next to the big score number (same row as the `56px` score / `/100` line),
right-aligned. Purely additive — no change to the existing count-up/fill
animation logic.

## Part 3 — Shareable permalink

**New `lib/audit/permalink.ts`:**
- `isPermalinkSupported(): boolean` — `typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'`.
  No new npm dependency; both are native browser APIs, consistent with this
  repo's minimal-dependency convention.
- `encodeResultToFragment(result: AuditResult, scannedAt: string): Promise<string>` —
  `JSON.stringify({ scannedAt, result })` → gzip via `CompressionStream('gzip')`
  → base64url-encode the compressed bytes (`+`/`/` → `-`/`_`, no padding).
- `decodeFragment(fragment: string): Promise<{ scannedAt: string; result: AuditResult } | null>` —
  reverse of the above. Returns `null` on any error (malformed base64,
  decompression failure, JSON parse failure, or missing `result`/`scannedAt`
  keys) — never throws.

**URL shape:** `https://<host>/#s=<encoded>` — a fragment, never sent to any
server, so no new API route and no server-side size/storage concerns.
Typical encoded size is roughly 1–2KB given how repetitive audit JSON is
(many shared strings: group names, statuses, boilerplate messages), well
within what URL-sharing surfaces (messaging apps, browsers) handle fine.

**`app/page.tsx` changes:**
- On mount (`useEffect`, runs once): if `window.location.hash` starts with
  `#s=`, call `decodeFragment`. On success: `setResult(decoded.result)`,
  `setSnapshotScannedAt(decoded.scannedAt)` — reuses the exact existing
  "viewing a snapshot" rendering path (Rescan button, no diff banner since
  `previousResult` stays `null`). Do **not** call `saveToHistory` — a
  permalink is someone else's report; saving it would pollute the viewer's
  own trend/history for that URL. Clear the hash via
  `history.replaceState(null, '', window.location.pathname)` after loading,
  so a refresh doesn't re-decode and a later "Rescan" doesn't leave a stale
  fragment in the address bar.
- On decode failure (hash present but invalid): show a small inline notice
  — new `permalinkError` state, rendered as a plain text banner above the
  form: "This shared link couldn't be loaded — it may be corrupted or from
  an incompatible browser." Distinct from `ErrorAlert` (which specifically
  maps HTTP status codes for audit-run failures) rather than stretching
  that component to a scenario it wasn't built for.

**`components/ExportToolbar.tsx`:**
- New standalone "Copy Link" button in the section header (next to the
  "Export & Share" title), separate from the 6-item `EXPORTS` accordion —
  a permalink isn't a readable preview format the way Markdown/CSV/JSON
  are, so it doesn't fit the expand-then-copy pattern.
- Hidden entirely (not disabled) when `isPermalinkSupported()` is `false`.
- Needs a `scannedAt` value to encode; `ResultsView` already has
  `snapshotScannedAt`, passed down as a new `ExportToolbar` prop
  (`scannedAt: snapshotScannedAt ?? new Date().toISOString()` — falls back
  to "now" for a just-completed live audit that hasn't been snapshotted).
- On click: `encodeResultToFragment(result, scannedAt)`, build
  `${location.origin}${location.pathname}#s=${encoded}`, copy via
  `navigator.clipboard.writeText`, reuse the existing `status`/`timeoutRef`
  copied-feedback mechanism already in the component (extend the
  `ExportFormat`-keyed status tracking with a `'share'` pseudo-format).

## Explicitly out of scope

- Any server-side storage or short-link service for permalinks — the whole
  point is staying stateless; a long-but-self-contained URL is the
  accepted tradeoff.
- Sparkline interactivity (hover tooltips showing exact scores/dates) —
  the brief was "neat and subtle," not a full chart component.
- Cross-browser support for browsers without `CompressionStream` (pre-2023
  Safari, etc.) — the Copy Link button simply doesn't render; no
  uncompressed fallback encoding.

## Testing

- Manual verification via `npm run dev`:
  - Run the same URL twice, confirm "Since Your Last Audit" now correctly
    shows the diff (previously silently broken).
  - Run a URL 3+ times, confirm the sparkline appears next to the score
    and reflects the right trend direction/color.
  - Load an old entry from Scan History, confirm the sparkline reflects
    only scans up to that entry's timestamp.
  - Copy a permalink, open it in a new tab/incognito window, confirm the
    exact snapshot renders with a working Rescan button and no sparkline
    (no local history for that URL in the fresh context).
  - Manually corrupt a permalink fragment and confirm the inline error
    notice appears instead of a crash.
- `npm run build` to verify types and production build.
