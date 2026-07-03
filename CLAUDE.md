# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Auditr** — a stateless Next.js 14 (App Router, TypeScript) SEO audit tool. Single POST endpoint fetches a URL server-side, parses it with cheerio, runs a fixed set of on-page checks, and returns a scored JSON result. No database, no auth, no persistence — every request is self-contained.

## Architecture

- `app/api/audit/route.ts` is the only server entry point. It orchestrates: rate limit check → `validateUrl` → `fetchPage` → cheerio parse → `detectBlocking`/`parseMeta`/`parseHeadings`/`parseImages`/`parseLinks` → `scoreResults`. Runs on the Node.js runtime (`export const runtime = 'nodejs'`) — do not switch this to Edge, since `dns`, `undici`, and `cheerio` require Node APIs.
- `lib/audit/*` holds all business logic. Each `parse*.ts`/`detectBlocking.ts` module takes a cheerio `$` (and sometimes the resolved page URL or raw HTML) and returns `AuditCheck[]` tagged with a `group`. Route handlers and UI components should stay thin; parsing/scoring logic belongs in `lib/audit`.
- `lib/audit/types.ts` is the single source of truth for `AuditCheck` / `AuditResult` / `CheckStatus`. `lib/types.ts` just re-exports it — don't duplicate type definitions.
- `components/` are presentational only (`ResultsView` groups checks by `group`, defaults every group's accordion to collapsed, and renders `AuditSection` rows under a `ScoreCard`). Fetch/loading/error state lives in `app/page.tsx`, not in the components. `ErrorAlert` maps real HTTP status codes (400/429/500/502/504) to alert copy — it does not fabricate error content.
- Visual design (colors, type scale, spacing) is sourced from a Claude Design project ("Next.js SEO Audit Design System"); tokens live as CSS variables in `app/globals.css` and are exposed via `tailwind.config.ts` (`bg-canvas`, `text-ink-1/2/3`, `bg-pass-bg`/`warn`/`fail`, etc). Fonts are Manrope + IBM Plex Mono via `next/font/google`. See README's "Design System" section for what was deliberately left unimplemented.
- Theme: `ThemeToggle` sets a `dark`/`light` class on `<html>` + `localStorage`; `app/layout.tsx` has a static, no-interpolation inline script that applies the stored choice before hydration to avoid a flash. Don't add dynamic values into that script.

## Adding a new check group (e.g. a PageSpeed API check)

This is the designed extension point — no changes to existing logic should be required:

1. Add a new `lib/audit/parseX.ts` returning `AuditCheck[]` with a new `group` value.
2. Call it alongside the other `parse*`/`detectBlocking` calls in `app/api/audit/route.ts` and spread its checks into the combined array.
3. Add an entry to `GROUP_WEIGHTS` in `lib/audit/scoreResults.ts` (falls back to `DEFAULT_WEIGHT` if omitted), nudging other weights down so the total stays near 100.
4. Add a label to `GROUP_LABELS` in `components/ResultsView.tsx` for display.

## Security constraints — do not weaken without explicit request

- `lib/audit/validateUrl.ts` validates the **DNS-resolved IP**, not just the URL string, to prevent DNS-rebinding SSRF. It rejects loopback/private/link-local/reserved ranges for both IPv4 and IPv6.
- `lib/audit/fetchPage.ts` uses `undici`'s `fetch` with a custom `Agent` whose `connect.lookup` is **pinned** to the exact IP(s) `validateUrl` already resolved — this closes the TOCTOU gap where the fetch implementation's own DNS lookup could return a different (rebound) address. Don't switch this back to the global `fetch`/default dispatcher.
- Redirects are followed **manually** (`redirect: 'manual'`) and every hop is re-validated (and re-pinned) via `validateUrl` — never switch this to automatic redirect following.
- Response bodies are capped (~3MB) via a streaming byte-count check in `fetchPage.ts`, not just a header check.
- The rate limiter (`lib/audit/rateLimiter.ts`) is intentionally in-memory and resets on cold start/redeploy — this is a documented, accepted tradeoff for a low-traffic stateless tool, not a bug.
- The site is deliberately unindexed (`app/robots.ts`, `X-Robots-Tag` header in `next.config.js`, `robots` metadata in `layout.tsx`) — keep all three in sync if the indexing policy ever changes.

## Conventions

- Tailwind CSS only, no component libraries.
- Keep `parse*.ts`/`detectBlocking.ts` modules pure and synchronous given an already-loaded cheerio document — no network calls inside them.
- Error responses are always `{ error: string }` with an appropriate HTTP status; never let the API route throw uncaught.
- All scraped/derived text (check `label`/`message`, page `url`) must render as JSX children (`{value}`), never via `dangerouslySetInnerHTML` or similar — this is what keeps untrusted page content from becoming an XSS sink.

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # verifies types + production build
```
