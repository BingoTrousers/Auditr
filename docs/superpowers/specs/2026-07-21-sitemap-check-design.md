# Sitemap.xml Check — Design

## Purpose

Add a new audit check group, `sitemap`, that evaluates whether a site exposes a
usable XML sitemap, whether the audited page is discoverable through it, and
whether it carries a fresh `lastmod` signal. This follows the extension point
documented in CLAUDE.md ("Adding a new check group") and requires no changes
to existing scoring/aggregation logic.

## Module: `lib/audit/checkSitemap.ts`

Async module (network call), same documented exception pattern as
`lib/audit/checkAiAccess.ts`. Uses `fetchResource` for both fetches — the
shared SSRF-safe primitive (DNS pinning, manual redirect re-validation, size
cap, timeout) — with the same size/timeout budget as `checkAiAccess.ts`
(512KB cap, ~6s timeout; sitemap files are plain text/XML like robots.txt).

**Fetch strategy:**
1. Fetch `${origin}/robots.txt` and `${origin}/sitemap.xml` in parallel.
2. If `robots.txt` contains a `Sitemap:` directive, that URL takes precedence
   as the sitemap location; otherwise fall back to the default
   `/sitemap.xml` result already fetched. If the directive points elsewhere,
   fetch it as a second request (robots.txt is small, so this stays within
   the "one extra fetch" budget in the common case, two only when a site
   uses a non-default sitemap path).
3. Parse the resolved sitemap body with `cheerio.load(text, { xmlMode: true })`.

**Checks emitted (group: `sitemap`):**

### 1. `"Sitemap.xml"` — always emitted
- **fail** — no sitemap found (no robots.txt directive, no file at the
  default location, or fetch returned 404).
- **warning** — found but unusable: malformed XML, zero `<url>`/`<sitemap>`
  entries, a fetch error/timeout, or the entry count exceeds the sitemap
  protocol's 50,000-URL cap for a single file.
- **pass** — valid. Message reports the URL count, or child-sitemap count if
  the root document is a sitemap index (`<sitemapindex>`).

### 2. `"Page Listed in Sitemap"` — emitted only when check 1 is a pass AND the sitemap is a URL set (not an index)
- Normalizes the audited page's `finalUrl` and each `<url><loc>` entry
  (strip trailing slash and fragment, compare scheme+host+path
  case-insensitively on the host) and checks for a match.
- **pass** — the audited page is listed.
- **warning** — not listed: "this page isn't listed in the sitemap, which
  can slow discovery by crawlers and AI systems."

Not emitted for sitemap indexes: verifying inclusion would require
recursively fetching child sitemaps, which is out of scope (see below).

### 3. `"Sitemap Freshness"` — same emission condition as check 2
- If the audited page's own `<url>` entry was matched in check 2, use its
  `<lastmod>`. Otherwise use the most recent `<lastmod>` found across all
  entries as a site-wide proxy.
- Reuses the same >12-months-old staleness threshold as the existing
  `dateModified` freshness check in `parseStructuredData.ts`, for
  consistency across the two freshness signals.
- **pass** — `lastmod` present and within 12 months.
- **warning** — `lastmod` present but stale, or missing entirely (missing is
  a warning, not a fail — `lastmod` is optional-but-recommended per the
  sitemap protocol).

## Explicitly out of scope

- Fetching every individual URL listed in the sitemap to check its status
  code. Would multiply outbound requests per audit far beyond the current
  "one page + up to ~3 small text/XML files" pattern and risks tripping the
  rate limiter or reading as aggressive scraping.
- Recursively fetching child sitemaps of a sitemap index to verify page
  inclusion or aggregate freshness. Same reasoning — unbounded fan-out.
- Validating sitemap URLs against robots.txt disallow rules (a "sitemap
  lists a page robots.txt blocks" contradiction check). Requires path-prefix
  matching logic beyond the exact-match blanket-disallow check
  `checkAiAccess.ts` already does internally; deferred as a possible
  follow-up, not part of this spec.

## Wiring

- `lib/audit/scoreResults.ts` — add `sitemap: 10` to `GROUP_WEIGHTS`. Trim
  6 points total from existing weights to keep the sum at 100:
  `meta` 12→11, `headings` 8→7, `ai-access` 14→12, `rendering` 16→14,
  `geo-content` 16→14, `structured-data` 14→12 (`access`, `images`, `links`
  unchanged).

  | group            | before | after |
  |------------------|--------|-------|
  | access           | 8      | 8     |
  | meta             | 12     | 11    |
  | headings         | 8      | 7     |
  | images           | 6      | 6     |
  | links            | 6      | 6     |
  | ai-access        | 14     | 12    |
  | rendering        | 16     | 14    |
  | geo-content      | 16     | 14    |
  | structured-data  | 14     | 12    |
  | sitemap          | —      | 10    |
  | **total**        | 100    | 100   |

- `lib/audit/groupLabels.ts` — add `sitemap: 'Sitemap'`.
- `components/ResultsView.tsx` — add `sitemap: 'technical'` to `GROUP_TAB`.
- `lib/audit/checkExplanations.ts` — add "why this matters" copy for all
  three check labels: `"Sitemap.xml"`, `"Page Listed in Sitemap"`,
  `"Sitemap Freshness"`.
- `app/api/audit/route.ts` — kick off `checkSitemapPromise` alongside
  `aiAccessPromise` (before the synchronous parse calls), spread its
  awaited result into the combined `checks` array.

## Testing

- Manual verification via `npm run dev` against a handful of real URLs
  covering: no sitemap, valid sitemap with the audited page listed and
  fresh, valid sitemap without the audited page listed, sitemap index,
  malformed/empty sitemap, sitemap declared via robots.txt at a non-default
  path.
- `npm run build` to verify types and production build.
