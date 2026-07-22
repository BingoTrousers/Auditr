# Sitemap.xml Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `sitemap` audit check group that reports sitemap discovery/validity, whether the audited page is listed in it, and its `lastmod` freshness.

**Architecture:** A new async module, `lib/audit/checkSitemap.ts`, fetches `robots.txt` (for a `Sitemap:` directive) and the default `/sitemap.xml` in parallel through the existing SSRF-safe `fetchResource` primitive, parses the result with cheerio in XML mode, and returns up to three `AuditCheck` objects. It's wired into `app/api/audit/route.ts` the same way `checkAiAccess.ts` is, and into scoring/labels/tabs/explanations exactly per the "Adding a new check group" recipe in CLAUDE.md.

**Tech Stack:** TypeScript, Next.js 14 App Router (Node.js runtime), cheerio (XML mode, no new dependency), the existing `fetchResource` SSRF-safe fetch primitive.

## Global Constraints

- No new dependencies — cheerio's existing XML mode (`cheerio.load(text, { xmlMode: true })`) handles sitemap parsing.
- All network calls go through `fetchResource` (DNS-pinned, manual-redirect-revalidated, size-capped, timed-out) — never the global `fetch`.
- Check modules stay pure/synchronous except for the one documented async exception pattern (`checkAiAccess.ts`); `checkSitemap.ts` follows that same pattern.
- Every relevant page state must produce at least one check, or the group's weight silently drops out of `breakdown` (see CLAUDE.md "Scoring").
- No unit test framework exists in this repo (`grep` for `*.test.*`/`*.spec.*` returns nothing, and `package.json` has no test script). Verification is `npx tsc --noEmit` for type correctness plus `npm run build` and manual `npm run dev` + `curl` checks against real URLs — matching how every existing `lib/audit/*` module is verified. Do not introduce a test framework as part of this plan.
- Scraped/derived text must render as plain strings (JSX `{value}` children), never HTML-injected — `AuditCheck.message` stays a plain string with no markup.

---

### Task 1: `checkSitemap.ts` module

**Files:**
- Create: `lib/audit/checkSitemap.ts`

**Interfaces:**
- Produces: `export async function checkSitemap(finalUrl: string): Promise<AuditCheck[]>` — same signature shape as `checkAiAccess(finalUrl: string): Promise<AuditCheck[]>` in `lib/audit/checkAiAccess.ts`. Task 2 imports and calls this directly.
- Consumes: `AuditCheck` from `./types`, `fetchResource`/`FetchResourceResult` from `./fetchResource` (see `lib/audit/fetchResource.ts:6-28` for the exact shape — `{ ok: true, status, headers, text, finalUrl }` or `{ ok: false, error, status }`), and `cheerio` (already a project dependency, imported as `import * as cheerio from 'cheerio'`, same as `app/api/audit/route.ts:2`).

- [ ] **Step 1: Write `lib/audit/checkSitemap.ts`**

```typescript
import * as cheerio from 'cheerio';
import type { AuditCheck } from './types';
import { fetchResource, type FetchResourceResult } from './fetchResource';

const GROUP = 'sitemap';
const ROBOTS_TIMEOUT_MS = 6_000;
const ROBOTS_MAX_BODY_BYTES = 512 * 1024;
const SITEMAP_TIMEOUT_MS = 8_000;
// Sitemaps can legitimately be much larger than robots.txt/llms.txt (up to
// thousands of URLs), so this reuses the main-page fetch's size budget
// rather than the small-text-file budget used for robots.txt/llms.txt.
const SITEMAP_MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_SITEMAP_URLS = 50_000;
const STALE_MONTHS = 12;

interface SitemapUrlEntry {
  loc: string;
  lastmod: string | null;
}

interface ParsedSitemap {
  kind: 'urlset' | 'sitemapindex';
  entries: SitemapUrlEntry[];
}

/**
 * Parses a robots.txt body for a "Sitemap:" directive. Returns the raw
 * (possibly relative) value of the first directive found, or null.
 */
function extractSitemapDirective(robotsText: string): string | null {
  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    const match = /^sitemap\s*:\s*(.+)$/i.exec(line);
    if (match) {
      const value = match[1].trim();
      if (value) return value;
    }
  }
  return null;
}

function parseSitemapXml(xml: string): ParsedSitemap | null {
  const $ = cheerio.load(xml, { xmlMode: true });

  const collectEntries = (selector: string): SitemapUrlEntry[] => {
    const entries: SitemapUrlEntry[] = [];
    $(selector).each((_, el) => {
      const loc = $(el).children('loc').first().text().trim();
      if (!loc) return;
      const lastmod = $(el).children('lastmod').first().text().trim() || null;
      entries.push({ loc, lastmod });
    });
    return entries;
  };

  if ($('sitemapindex').length > 0) {
    return { kind: 'sitemapindex', entries: collectEntries('sitemapindex > sitemap') };
  }

  if ($('urlset').length > 0) {
    return { kind: 'urlset', entries: collectEntries('urlset > url') };
  }

  return null;
}

/**
 * Fetches robots.txt and the default /sitemap.xml in parallel. If robots.txt
 * declares a Sitemap: directive pointing elsewhere, fetches that location
 * instead (one extra request only when a site uses a non-default path).
 */
async function resolveSitemapLocation(origin: string): Promise<FetchResourceResult> {
  const defaultSitemapUrl = `${origin}/sitemap.xml`;

  const [robotsResult, defaultSitemapResult] = await Promise.all([
    fetchResource(`${origin}/robots.txt`, {
      timeoutMs: ROBOTS_TIMEOUT_MS,
      maxBodyBytes: ROBOTS_MAX_BODY_BYTES,
    }),
    fetchResource(defaultSitemapUrl, {
      timeoutMs: SITEMAP_TIMEOUT_MS,
      maxBodyBytes: SITEMAP_MAX_BODY_BYTES,
    }),
  ]);

  const directive =
    robotsResult.ok && robotsResult.status >= 200 && robotsResult.status < 300
      ? extractSitemapDirective(robotsResult.text)
      : null;

  if (!directive) return defaultSitemapResult;

  const directiveUrl = new URL(directive, origin).toString();
  if (directiveUrl === defaultSitemapUrl) return defaultSitemapResult;

  return fetchResource(directiveUrl, { timeoutMs: SITEMAP_TIMEOUT_MS, maxBodyBytes: SITEMAP_MAX_BODY_BYTES });
}

function buildSitemapCheck(result: FetchResourceResult): { check: AuditCheck; parsed: ParsedSitemap | null } {
  if (!result.ok) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'fail',
        message: `No sitemap could be found (${result.error}).`,
        group: GROUP,
      },
      parsed: null,
    };
  }

  if (result.status === 404) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'fail',
        message:
          'No sitemap.xml was found at the default location or declared in robots.txt. Sitemaps help crawlers and AI systems discover every page on a site.',
        group: GROUP,
      },
      parsed: null,
    };
  }

  if (result.status < 200 || result.status >= 300) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'warning',
        message: `The sitemap URL returned an HTTP ${result.status}, so it could not be verified.`,
        group: GROUP,
      },
      parsed: null,
    };
  }

  const parsed = parseSitemapXml(result.text);
  if (!parsed) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'warning',
        message: 'A sitemap was found but its XML could not be parsed as a valid <urlset> or <sitemapindex> document.',
        group: GROUP,
      },
      parsed: null,
    };
  }

  if (parsed.entries.length === 0) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'warning',
        message: `The sitemap was found but contains no ${parsed.kind === 'sitemapindex' ? 'child sitemap' : 'URL'} entries.`,
        group: GROUP,
      },
      parsed,
    };
  }

  if (parsed.kind === 'urlset' && parsed.entries.length > MAX_SITEMAP_URLS) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'warning',
        message: `The sitemap contains ${parsed.entries.length} URLs, over the sitemap protocol's ${MAX_SITEMAP_URLS.toLocaleString()}-URL limit for a single file. Split it into multiple sitemaps referenced from a sitemap index.`,
        group: GROUP,
      },
      parsed,
    };
  }

  const message =
    parsed.kind === 'sitemapindex'
      ? `A sitemap index was found, referencing ${parsed.entries.length} child sitemap(s).`
      : `A valid sitemap was found, listing ${parsed.entries.length} URL(s).`;

  return { check: { label: 'Sitemap.xml', status: 'pass', message, group: GROUP }, parsed };
}

function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\/$/, '') || '/';
    return `${url.hostname.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

function findMatchingEntry(entries: SitemapUrlEntry[], pageUrl: string): SitemapUrlEntry | null {
  const target = normalizeUrl(pageUrl);
  if (!target) return null;
  return entries.find((entry) => normalizeUrl(entry.loc) === target) ?? null;
}

function buildPageListedCheck(matched: SitemapUrlEntry | null): AuditCheck {
  if (matched) {
    return {
      label: 'Page Listed in Sitemap',
      status: 'pass',
      message: 'The audited page is listed in the sitemap.',
      group: GROUP,
    };
  }

  return {
    label: 'Page Listed in Sitemap',
    status: 'warning',
    message: "The audited page isn't listed in the sitemap, which can slow discovery by crawlers and AI systems.",
    group: GROUP,
  };
}

function mostRecentLastmod(entries: SitemapUrlEntry[]): string | null {
  let mostRecent: { raw: string; time: number } | null = null;
  for (const entry of entries) {
    if (!entry.lastmod) continue;
    const time = new Date(entry.lastmod).getTime();
    if (Number.isNaN(time)) continue;
    if (!mostRecent || time > mostRecent.time) mostRecent = { raw: entry.lastmod, time };
  }
  return mostRecent?.raw ?? null;
}

function buildFreshnessCheck(matched: SitemapUrlEntry | null, allEntries: SitemapUrlEntry[]): AuditCheck {
  const lastmod = matched?.lastmod ?? mostRecentLastmod(allEntries);
  const source = matched?.lastmod ? "the audited page's own" : "the sitemap's most recent";

  if (!lastmod) {
    return {
      label: 'Sitemap Freshness',
      status: 'warning',
      message:
        'The sitemap entries have no "lastmod" date. This is optional but recommended so crawlers can prioritize recrawling changed pages.',
      group: GROUP,
    };
  }

  const parsed = new Date(lastmod);
  if (Number.isNaN(parsed.getTime())) {
    return {
      label: 'Sitemap Freshness',
      status: 'warning',
      message: `A "lastmod" value ("${lastmod}") could not be parsed as a valid date.`,
      group: GROUP,
    };
  }

  const monthsOld = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (monthsOld > STALE_MONTHS) {
    return {
      label: 'Sitemap Freshness',
      status: 'warning',
      message: `The ${source} "lastmod" is ${lastmod}, over ${STALE_MONTHS} months old. Keeping this current helps crawlers and AI systems prioritize recrawling.`,
      group: GROUP,
    };
  }

  return {
    label: 'Sitemap Freshness',
    status: 'pass',
    message: `The ${source} "lastmod" is ${lastmod}, within the last ${STALE_MONTHS} months.`,
    group: GROUP,
  };
}

/**
 * Checks sitemap discovery/validity, whether the audited page is listed in
 * it, and its lastmod freshness. The latter two checks only run when a
 * usable (pass-status), non-index sitemap was found — verifying page
 * inclusion or freshness against a sitemap index would require recursively
 * fetching child sitemaps, which is out of scope.
 */
export async function checkSitemap(finalUrl: string): Promise<AuditCheck[]> {
  const origin = new URL(finalUrl).origin;
  const result = await resolveSitemapLocation(origin);
  const { check: sitemapCheck, parsed } = buildSitemapCheck(result);

  if (sitemapCheck.status !== 'pass' || !parsed || parsed.kind !== 'urlset') {
    return [sitemapCheck];
  }

  const matched = findMatchingEntry(parsed.entries, finalUrl);
  return [sitemapCheck, buildPageListedCheck(matched), buildFreshnessCheck(matched, parsed.entries)];
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If there are errors in files unrelated to `checkSitemap.ts`, confirm they pre-exist by running the same command against `git stash` (there should be none — this is a from-scratch file with no existing callers yet).

- [ ] **Step 3: Commit**

This module has no standalone runner in this repo (no `ts-node`/`tsx`, no test framework — see Global Constraints), so its first real execution is via the API route wired up in Task 2, whose Step 7 is the actual functional verification. Task 1's only gate is the type-check in Step 2.

```bash
git add lib/audit/checkSitemap.ts
git commit -m "$(cat <<'EOF'
Add checkSitemap module for sitemap discovery/validity, page-listed, and freshness checks

Not yet wired into the audit route or scoring — see follow-up commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire `sitemap` group into scoring, labels, UI tab, explanations, and the route

**Files:**
- Modify: `lib/audit/scoreResults.ts:17-27` (`GROUP_WEIGHTS`)
- Modify: `lib/audit/groupLabels.ts:2-12` (`GROUP_LABELS`)
- Modify: `components/ResultsView.tsx:28-38` (`GROUP_TAB`)
- Modify: `lib/audit/checkExplanations.ts:7-44` (`CHECK_EXPLANATIONS`)
- Modify: `app/api/audit/route.ts` (import + kick off + spread `checkSitemap`)

**Interfaces:**
- Consumes: `checkSitemap(finalUrl: string): Promise<AuditCheck[]>` from Task 1's `lib/audit/checkSitemap.ts`.

- [ ] **Step 1: Update `GROUP_WEIGHTS` in `lib/audit/scoreResults.ts`**

Replace the existing object (`lib/audit/scoreResults.ts:17-27`):

```typescript
const GROUP_WEIGHTS: Record<string, number> = {
  access: 8,
  meta: 11,
  headings: 7,
  images: 6,
  links: 6,
  'ai-access': 12,
  rendering: 14,
  'geo-content': 14,
  'structured-data': 12,
  sitemap: 10,
};
```

- [ ] **Step 2: Update `GROUP_LABELS` in `lib/audit/groupLabels.ts`**

Add one line inside the existing object (`lib/audit/groupLabels.ts:2-12`):

```typescript
  sitemap: 'Sitemap',
```

- [ ] **Step 3: Update `GROUP_TAB` in `components/ResultsView.tsx`**

Add one line inside the existing object (`components/ResultsView.tsx:28-38`), grouped with the other `'technical'` entries:

```typescript
  sitemap: 'technical',
```

- [ ] **Step 4: Add explanations in `lib/audit/checkExplanations.ts`**

Add three entries inside the existing `CHECK_EXPLANATIONS` object (`lib/audit/checkExplanations.ts:7-44`), e.g. after the `'Structured Data (Schema.org)'` entry:

```typescript
  'Sitemap.xml':
    'An XML sitemap tells crawlers every URL on a site upfront, instead of relying on them to discover pages by following links.',
  'Page Listed in Sitemap':
    "If the exact page being audited isn't in the sitemap, crawlers and AI systems may take longer to discover it, or miss it entirely.",
  'Sitemap Freshness':
    'A recent "lastmod" date signals to crawlers which pages have changed and deserve a priority recrawl.',
```

- [ ] **Step 5: Wire into `app/api/audit/route.ts`**

Add the import alongside the other `lib/audit` imports (`app/api/audit/route.ts:10-13`):

```typescript
import { checkAiAccess } from '@/lib/audit/checkAiAccess';
import { checkSitemap } from '@/lib/audit/checkSitemap';
```

Kick off the promise next to `aiAccessPromise` (`app/api/audit/route.ts:65-67`):

```typescript
    // Kick off the robots.txt/llms.txt fetch concurrently with the
    // synchronous parse checks below, since it doesn't depend on them.
    const aiAccessPromise = checkAiAccess(fetchResult.finalUrl);
    const sitemapPromise = checkSitemap(fetchResult.finalUrl);
```

Spread its result into `checks` (`app/api/audit/route.ts:69-79`):

```typescript
    const checks = [
      ...detectBlocking($, fetchResult.html),
      ...parseMeta($),
      ...parseHeadings($),
      ...parseImages($),
      ...parseLinks($, fetchResult.finalUrl),
      ...(await aiAccessPromise),
      ...(await sitemapPromise),
      ...checkRendering($),
      ...parseGeoContent($),
      ...parseStructuredData($),
    ];
```

- [ ] **Step 6: Type-check and build**

Run: `npm run build`
Expected: build completes with no type errors (this also validates Task 1's file, since it's now imported).

- [ ] **Step 7: Manual verification against real URLs**

Run: `npm run dev` in one terminal, then in another:

```bash
curl -s -X POST http://localhost:3000/api/audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://nextjs.org"}' | python3 -m json.tool | grep -A4 '"group": "sitemap"'
```

Expected: at least one object with `"group": "sitemap"` and `"label": "Sitemap.xml"` in the output, with a `status` of `pass`, `warning`, or `fail` depending on the target site. Repeat against 2-3 more URLs to spot-check different states:
- A site you know has no sitemap (or a made-up path) → expect `"status": "fail"` on `Sitemap.xml`.
- A site with a large, actively maintained sitemap (e.g. a major news site) → expect `pass` on `Sitemap.xml` and `Sitemap Freshness`, and check whether `Page Listed in Sitemap` correctly reflects whether the specific URL you queried is in the sitemap.
- Confirm the overall `score` in the response is still within 0-100 and `breakdown` includes a `sitemap` entry whose `weight` is `10`.

- [ ] **Step 8: Commit**

```bash
git add lib/audit/scoreResults.ts lib/audit/groupLabels.ts components/ResultsView.tsx lib/audit/checkExplanations.ts app/api/audit/route.ts
git commit -m "$(cat <<'EOF'
Wire the sitemap check group into scoring, labels, UI tab, and the audit route

Adds sitemap: 10 to GROUP_WEIGHTS (trimmed 6 points off meta/headings/
ai-access/rendering/geo-content/structured-data to keep the total at 100),
routes it to the Technical tab, and adds "why this matters" copy for its
three checks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
