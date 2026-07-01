# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A stateless Next.js 14 (App Router, TypeScript) SEO audit tool. Single POST endpoint fetches a URL server-side, parses it with cheerio, runs a fixed set of on-page checks, and returns a scored JSON result. No database, no auth, no persistence — every request is self-contained.

## Architecture

- `app/api/audit/route.ts` is the only server entry point. It orchestrates: rate limit check → `validateUrl` → `fetchPage` → cheerio parse → `parseMeta`/`parseHeadings`/`parseImages`/`parseLinks` → `scoreResults`. Runs on the Node.js runtime (`export const runtime = 'nodejs'`) — do not switch this to Edge, since `dns` and `cheerio` require Node APIs.
- `lib/audit/*` holds all business logic. Each `parse*.ts` module takes a cheerio `$` (and sometimes the resolved page URL) and returns `AuditCheck[]` tagged with a `group`. Route handlers and UI components should stay thin; parsing/scoring logic belongs in `lib/audit`.
- `lib/audit/types.ts` is the single source of truth for `AuditCheck` / `AuditResult` / `CheckStatus`. `lib/types.ts` just re-exports it — don't duplicate type definitions.
- `components/` are presentational only (`ResultsView` groups checks by `group` and renders `AuditSection` rows under a `ScoreCard`). Fetch/loading/error state lives in `app/page.tsx`, not in the components.

## Adding a new check group (e.g. a PageSpeed API check)

This is the designed extension point — no changes to existing logic should be required:

1. Add a new `lib/audit/parseX.ts` returning `AuditCheck[]` with a new `group` value.
2. Call it alongside the other `parse*` calls in `app/api/audit/route.ts` and spread its checks into the combined array.
3. Add an entry to `GROUP_PENALTIES` in `lib/audit/scoreResults.ts` (falls back to `DEFAULT_PENALTY` if omitted).
4. Add a label to `GROUP_LABELS` in `components/ResultsView.tsx` for display.

## Security constraints — do not weaken without explicit request

- `lib/audit/validateUrl.ts` validates the **DNS-resolved IP**, not just the URL string, to prevent DNS-rebinding SSRF. It rejects loopback/private/link-local/reserved ranges for both IPv4 and IPv6.
- `lib/audit/fetchPage.ts` follows redirects **manually** (`redirect: 'manual'`) and re-runs `validateUrl` on every hop — never switch this to automatic redirect following.
- Response bodies are capped (~3MB) via a streaming byte-count check in `fetchPage.ts`, not just a header check.
- The rate limiter (`lib/audit/rateLimiter.ts`) is intentionally in-memory and resets on cold start/redeploy — this is a documented, accepted tradeoff for a low-traffic stateless tool, not a bug.

## Conventions

- Tailwind CSS only, no component libraries.
- Keep `parse*.ts` modules pure and synchronous given an already-loaded cheerio document — no network calls inside them.
- Error responses are always `{ error: string }` with an appropriate HTTP status; never let the API route throw uncaught.

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # verifies types + production build
```
