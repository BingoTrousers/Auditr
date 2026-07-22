# Auditr

A stateless SEO/GEO audit tool built with Next.js 14 (App Router) and TypeScript. Paste a URL, get an instant on-page score, a breakdown of checks, and exactly how many points you'd recover by fixing each area — no database, no auth, no server-side persistence (the browser's own `localStorage` is used client-side for scan history/comparison and the theme choice; see below).

## Features

- Server-side fetch of the target page (avoids CORS, keeps the check consistent regardless of client)
- On-page checks via [cheerio](https://cheerio.js.org/), grouped under **Content** and **Technical** tabs in the UI:
  - **Access & Bot Protection** *(Technical)*: flags when the fetched page looks like a WAF/bot-protection challenge page (Cloudflare, Akamai, Imperva/Incapsula, PerimeterX, DataDome, etc.) rather than real content, so a misleadingly bad score doesn't go unexplained
  - **Meta** *(Content)*: title tag, meta description, canonical link, robots meta tag
  - **Headings** *(Content)*: H1 presence/uniqueness, skipped heading levels (H1→H2→H3)
  - **Images** *(Content)*: alt text coverage
  - **Links** *(Technical)*: internal vs. external link counts
  - **AI Crawler Access** *(Technical)*: parses robots.txt for blanket blocks against major AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and more), and checks for an `llms.txt` file
  - **Server-Side Rendering** *(Technical)*: heuristic check for whether key content is visible without executing JavaScript, plus login/paywall-gate detection
  - **AI-Citability (GEO)** *(Content)*: answer-first opening structure, heading-as-question phrasing, and data/statistic density — signals that improve how likely a page is to be cited by AI answer engines
  - **Structured Data & Freshness** *(Technical)*: JSON-LD schema presence/validity (FAQPage/Article/Product) and last-updated/`dateModified` freshness signals
- Weighted-category scoring: each check group has a point budget (not a flat penalty), and the UI shows exactly how many points are recoverable per area ("Biggest Wins" + per-group "+N pts available" badges), plus content/technical sub-scores on the score card
- Every check row shows a short "why this matters" explanation alongside its message, so a non-technical reader isn't left guessing why a check affects SEO/GEO outcomes
- Run-over-run comparison: results are cached per-URL in `localStorage` (client-side only, nothing sent to a server), and re-auditing the same URL shows a score delta and newly-passing/newly-failing checks
- Export & Share: copy the audit as an LLM-ready prompt, a GitHub issue checklist, an email summary (with a one-click "Open in Email App" `mailto:` link), a full Markdown report, CSV, or raw JSON
- SSRF protection: resolved-IP validation (not just URL string matching), fetch connection pinned to the validated IP (prevents DNS-rebinding TOCTOU), manual redirect handling with per-hop re-validation, response size cap, request timeout — applied uniformly to the main page fetch and the robots.txt/llms.txt fetches
- In-memory per-IP rate limiting (~5 requests/minute)
- Deliberately unindexed: `app/robots.ts` disallows all crawlers, every response sends `X-Robots-Tag: noindex, nofollow`, and page metadata sets `robots: noindex, nofollow`
- Accessible by default: real WAI-ARIA tab/radiogroup patterns with keyboard navigation, visible focus rings (including on elements inside `overflow-hidden` containers), proper heading structure for screen-reader navigation, and `prefers-reduced-motion` support

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter a URL to audit.

## API

`POST /api/audit`

```json
{ "url": "https://example.com" }
```

Success (200):

```json
{
  "url": "https://example.com",
  "score": 70,
  "checks": [
    { "label": "Title Tag", "status": "warning", "message": "...", "group": "meta" }
  ],
  "breakdown": [
    { "group": "meta", "weight": 12, "score": 6, "potentialGain": 6 }
  ]
}
```

Errors return `{ "error": "..." }` with an appropriate status code:
- `400` — invalid/malformed URL, disallowed protocol, private/internal IP target, non-HTML response, oversized response
- `429` — rate limit exceeded
- `502` / `504` — upstream fetch failure or timeout (502 error messages include a WAF hint like "This looks like it may be Cloudflare blocking automated requests" when response headers match a known WAF/CDN fingerprint)
- `500` — unexpected server error

## Project Structure

```
app/
  api/audit/route.ts   API route: fetch, parse, score
  page.tsx             Home page (URL form + results)
  layout.tsx
  globals.css
components/
  UrlForm.tsx              URL input + validation + loading state
  ScoreCard.tsx            Overall score, color-coded band (Good/Needs Work/Poor), content/technical sub-scores
  AuditSection.tsx         Single check row (label, status badge, message, "why this matters")
  ResultsView.tsx          Composes ScoreCard + Content/Technical tabs + sort control + Biggest Wins + grouped, collapsible AuditSections
  CompareSummary.tsx       Score delta + newly-passing/failing checks vs. the previous localStorage run for the same URL
  ExportToolbar.tsx        Export/share panel: LLM prompt, GitHub checklist, email (+ mailto link), Markdown, CSV, JSON
  ErrorAlert.tsx           Status-aware error banner (rate limit / fetch failure / server error)
  ThemeToggle.tsx          Manual light/dark switch (class + localStorage)
  focusRing.ts             Shared FOCUS_RING / FOCUS_RING_INSET Tailwind class constants
lib/
  audit/fetchResource.ts     Shared SSRF-safe fetch primitive (DNS pinning, redirect re-validation, size cap)
  audit/fetchPage.ts         Main-page fetch: wraps fetchResource with content-type check + WAF header hint
  audit/detectBlocking.ts    WAF/bot-protection challenge-page detection (Cloudflare, Akamai, etc.)
  audit/parseMeta.ts         Title/description/canonical/robots checks
  audit/parseHeadings.ts     Heading structure checks
  audit/parseImages.ts       Alt text coverage
  audit/parseLinks.ts        Internal/external link counts
  audit/checkAiAccess.ts     robots.txt AI-crawler blocking + llms.txt presence (async, network call)
  audit/checkRendering.ts    SSR/JS-gating heuristic + login/paywall detection
  audit/parseGeoContent.ts   Answer-first structure, heading-as-question, data/statistic density
  audit/parseStructuredData.ts  JSON-LD schema validation + freshness signals
  audit/scoreResults.ts      Weighted-category scoring (GROUP_WEIGHTS → score + per-group breakdown)
  audit/rateLimiter.ts       In-memory per-IP rate limiter
  audit/validateUrl.ts       SSRF protection (DNS-resolved IP validation)
  audit/groupLabels.ts       Shared check-group → display-label map (UI + export formats)
  audit/checkExplanations.ts Static "why this matters" copy per check label
  audit/exportFormats.ts     Pure formatters for the Export & Share panel (prompt/checklist/email/markdown/csv/json)
  types.ts                   Shared AuditCheck / AuditResult / GroupScore types
  history/scanHistory.ts     All-URL scan history (localStorage, cap 100): getHistory/saveToHistory/clearHistory, plus per-URL lookups (getLatestEntryForUrl, getEntriesForUrl) used by run-over-run comparison and the score trend sparkline
  history/types.ts           ScanHistoryEntry type
  history/relativeTime.ts    "3 hours ago"-style formatting for the Scan History sidebar
```

## Notes on Production Use

- The rate limiter and any per-instance state are in-memory only — they reset on cold starts/redeploys/multi-instance deployments. Acceptable for a low-traffic tool; swap in Redis/Upstash if stricter limits are needed.
- `app/api/audit/route.ts` runs on the Node.js runtime (`export const runtime = 'nodejs'`), not Edge, since it uses `dns` and `cheerio`.
- The Server-Side Rendering check is a heuristic (raw-HTML visible-text volume), not an actual headless-browser render — it can't perfectly distinguish "JS-gated content" from "unusually terse but fully server-rendered page."

## Design System

Visual design (colors, type scale, spacing, component states) is sourced from the "Next.js SEO Audit Design System" project in Claude Design (`Home.dc.html`, `Results.dc.html`, `ErrorStates.dc.html`, `DesignTokens.dc.html`). Tokens live as CSS variables in `app/globals.css` and are exposed through `tailwind.config.ts` (`bg-canvas`, `text-ink-1/2/3`, `bg-pass-bg`/`warn`/`fail`, `bg-accent`/`accent-tint`, etc). Fonts are Manrope (UI/headings) and IBM Plex Mono (scores, counts, URLs), loaded via `next/font/google`. `app/icon.svg` provides the favicon and matches the header's magnifying-glass badge.

Theme defaults to the system's `prefers-color-scheme`, overridable via the header's light/dark toggle (`ThemeToggle`), which persists the choice to `localStorage` and applies it via a `dark`/`light` class on `<html>` (set before hydration by a static inline script in `app/layout.tsx` to avoid a flash of the wrong theme).

Run-over-run comparison (`CompareSummary`) now covers the "comparing against a previous audit" case using client-side `localStorage` history, but there's still no server-persisted multi-URL history/dashboard — a "compact score card for comparing URLs" list view from the original design remains unimplemented. The styling patterns already exist in the source design to extend from if that becomes real.
