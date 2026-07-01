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
- SSRF protection: resolved-IP validation (not just URL string matching), manual redirect handling with per-hop re-validation, response size cap, request timeout
- In-memory per-IP rate limiting (~5 requests/minute)

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
  ScoreCard.tsx          Overall score, color-coded
  AuditSection.tsx       Single check row (label, status badge, message)
  ResultsView.tsx        Composes ScoreCard + grouped AuditSections
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
