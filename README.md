# SEO Audit Tool

A stateless SEO audit tool built with Next.js 14 (App Router) and TypeScript. Paste a URL, get an instant on-page SEO score and a breakdown of checks — no database, no auth, nothing persisted.

## Features

- Server-side fetch of the target page (avoids CORS, keeps the check consistent regardless of client)
- On-page checks via [cheerio](https://cheerio.js.org/):
  - **Meta**: title tag, meta description, canonical link, robots meta tag
  - **Headings**: H1 presence/uniqueness, skipped heading levels (H1→H2→H3)
  - **Images**: alt text coverage
  - **Links**: internal vs. external link counts
- Aggregate 0-100 score with a simple, extensible weighting system
- SSRF protection: resolved-IP validation (not just URL string matching), fetch connection pinned to the validated IP (prevents DNS-rebinding TOCTOU), manual redirect handling with per-hop re-validation, response size cap, request timeout
- In-memory per-IP rate limiting (~5 requests/minute)
- Deliberately unindexed: `app/robots.ts` disallows all crawlers, every response sends `X-Robots-Tag: noindex, nofollow`, and page metadata sets `robots: noindex, nofollow`

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
  ]
}
```

Errors return `{ "error": "..." }` with an appropriate status code:
- `400` — invalid/malformed URL, disallowed protocol, private/internal IP target, non-HTML response, oversized response
- `429` — rate limit exceeded
- `502` / `504` — upstream fetch failure or timeout
- `500` — unexpected server error

## Project Structure

```
app/
  api/audit/route.ts   API route: fetch, parse, score
  page.tsx             Home page (URL form + results)
  layout.tsx
  globals.css
components/
  UrlForm.tsx           URL input + validation + loading state
  ScoreCard.tsx          Overall score, color-coded band (Good/Needs Work/Poor)
  AuditSection.tsx       Single check row (label, status badge, message)
  ResultsView.tsx        Composes ScoreCard + collapsible, grouped AuditSections
  ErrorAlert.tsx          Status-aware error banner (rate limit / fetch failure / server error)
lib/
  audit/fetchPage.ts      SSRF-safe fetch with timeout, redirect handling, size cap
  audit/parseMeta.ts      Title/description/canonical/robots checks
  audit/parseHeadings.ts  Heading structure checks
  audit/parseImages.ts    Alt text coverage
  audit/parseLinks.ts     Internal/external link counts
  audit/scoreResults.ts   Aggregates checks into a 0-100 score
  audit/rateLimiter.ts    In-memory per-IP rate limiter
  audit/validateUrl.ts    SSRF protection (DNS-resolved IP validation)
  types.ts                Shared AuditCheck / AuditResult types
```

## Notes on Production Use

- The rate limiter and any per-instance state are in-memory only — they reset on cold starts/redeploys/multi-instance deployments. Acceptable for a low-traffic tool; swap in Redis/Upstash if stricter limits are needed.
- `app/api/audit/route.ts` runs on the Node.js runtime (`export const runtime = 'nodejs'`), not Edge, since it uses `dns` and `cheerio`.

## Design System

Visual design (colors, type scale, spacing, component states) is sourced from the "Next.js SEO Audit Design System" project in Claude Design (`Home.dc.html`, `Results.dc.html`, `ErrorStates.dc.html`, `DesignTokens.dc.html`). Tokens live as CSS variables in `app/globals.css` (light theme default, dark theme via `prefers-color-scheme`) and are exposed through `tailwind.config.ts` (`bg-canvas`, `text-ink-1/2/3`, `bg-pass-bg`/`warn`/`fail`, etc). Fonts are Manrope (UI/headings) and IBM Plex Mono (scores, counts, URLs), loaded via `next/font/google`.

Two elements shown in the design were **not** implemented because they assume data this app doesn't produce:
- Extended check groups for Performance, Structured Data, and Social Tags (shown behind a demo toggle in `Results.dc.html`) — the API only returns `meta`/`headings`/`images`/`links`.
- A "compact score card for comparing URLs" variant, which implies a recent-audits history feature that doesn't exist here.

If either becomes real (e.g. a PageSpeed API check, or persisted audit history), the styling patterns already exist in the source design to extend from.
