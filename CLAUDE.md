# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Auditr** — a stateless Next.js 14 (App Router, TypeScript) SEO/GEO audit tool. Single POST endpoint fetches a URL server-side, parses it with cheerio (plus a couple of small same-origin fetches for robots.txt/llms.txt), runs a fixed set of on-page and AI-visibility checks, and returns a scored JSON result. No database, no auth, no persistence — every request is self-contained.

## Architecture

- `app/api/audit/route.ts` is the only server entry point. It orchestrates: rate limit check → `validateUrl` → `fetchPage` → cheerio parse → `detectBlocking` / `parseMeta` / `parseHeadings` / `parseImages` / `parseLinks` / `checkAiAccess` (async) / `checkRendering` / `parseGeoContent` / `parseStructuredData` → `scoreResults`. Runs on the Node.js runtime (`export const runtime = 'nodejs'`) — do not switch this to Edge, since `dns`, `undici`, and `cheerio` require Node APIs.
- `lib/audit/*` holds all business logic. Each `parse*.ts`/`detectBlocking.ts`/`checkRendering.ts` module takes a cheerio `$` (and sometimes the resolved page URL or raw HTML) and returns `AuditCheck[]` tagged with a `group`, synchronously — no network calls. `checkAiAccess.ts` is the one documented exception: it's async because it fetches `/robots.txt` and `/llms.txt` off the page's own origin, reusing `fetchResource.ts` for the same SSRF protections as the main page fetch. Route handlers and UI components should stay thin; parsing/scoring logic belongs in `lib/audit`.
- `lib/audit/fetchResource.ts` is the shared low-level SSRF-safe fetch primitive (DNS-pinning, manual-redirect re-validation, size cap, timeout). `fetchPage.ts` wraps it with HTML-specific rules (content-type check, WAF header hint); `checkAiAccess.ts` calls it directly for robots.txt/llms.txt with a smaller size cap and shorter timeout.
- `lib/audit/types.ts` is the single source of truth for `AuditCheck` / `AuditResult` / `CheckStatus` / `GroupScore`. `lib/types.ts` just re-exports it — don't duplicate type definitions.
- `components/` are presentational only. `ResultsView` groups checks by `group`, splits them across **Content**/**Technical** tabs (`GROUP_TAB` mapping), defaults every group's accordion to collapsed, and renders `AuditSection` rows under a `ScoreCard`. It also renders a "Biggest Wins" summary (total recoverable points + top opportunities) and, when the `access` group check isn't a clean pass, a WAF-warning banner right below the score so a depressed score doesn't read as alarming without context. `AuditSection` looks up a static "why this matters" blurb per check from `lib/audit/checkExplanations.ts` (keyed by `AuditCheck.label`) and renders it under the check's message when one exists. `ScoreCard` also takes optional `contentScore`/`technicalScore` props (computed in `ResultsView` from `result.breakdown`) to show per-tab sub-scores. Fetch/loading/error state lives in `app/page.tsx`, not in the components. `ErrorAlert` maps real HTTP status codes (400/429/500/502/504) to alert copy — it does not fabricate error content.
- Run-over-run comparison is entirely client-side: `lib/audit/auditHistory.ts` reads/writes a normalized-URL-keyed history to `localStorage` (`saveResult`/`getPreviousResult`, capped at `MAX_ENTRIES`). `app/page.tsx` looks up the previous result for a URL *before* saving the new one, and passes it to `ResultsView` as `previous`, which renders `CompareSummary` (score delta + newly-passing/newly-failing checks) above the results when present. This is not server persistence — it doesn't conflict with the "no database" architecture, since it never leaves the browser.
- `components/ExportToolbar.tsx` lets users copy the result in several formats (LLM prompt, GitHub checklist, email body, Markdown report, CSV, JSON), built by pure functions in `lib/audit/exportFormats.ts`. The email format also renders an "Open in Email App" `mailto:` link (subject/body via `encodeURIComponent`); mailto bodies are capped by mail clients at roughly 1800-2000 chars, so `buildEmailBody` intentionally sends a condensed top-issues summary rather than the full report. Only the currently-open format's content is built (memoized via `useMemo` keyed on `[openFormat, result]`) rather than rebuilt per render.
- `GROUP_LABELS` (group → display name) lives in `lib/audit/groupLabels.ts`, shared by `ResultsView` and `exportFormats.ts` — don't redefine it locally in either place. `FOCUS_RING`/`FOCUS_RING_INSET` live in `components/focusRing.ts` for the same reason (shared by `ResultsView` and `ExportToolbar`).
- Visual design (colors, type scale, spacing) is sourced from a Claude Design project ("Next.js SEO Audit Design System"); tokens live as CSS variables in `app/globals.css` and are exposed via `tailwind.config.ts` (`bg-canvas`, `text-ink-1/2/3`, `bg-pass-bg`/`warn`/`fail`, `bg-accent`/`accent-tint`, etc). Fonts are Manrope + IBM Plex Mono via `next/font/google`. See README's "Design System" section for what was deliberately left unimplemented.
- Theme: `ThemeToggle` sets a `dark`/`light` class on `<html>` + `localStorage`; `app/layout.tsx` has a static, no-interpolation inline script that applies the stored choice before hydration to avoid a flash. Don't add dynamic values into that script.

## Scoring

`lib/audit/scoreResults.ts` uses a weighted-category model, not flat penalty subtraction: each check `group` has a fixed point budget in `GROUP_WEIGHTS` (they should sum to ~100), and within a group each check contributes `pass=1.0`/`warning=0.5`/`fail=0` credit toward that budget. `AuditResult.breakdown` reports `{ group, weight, score, potentialGain }` per group — `potentialGain` is what the UI shows as recoverable points. Every check module must emit at least one check per relevant page state (including a `pass`, not just warnings/fails) or its group silently drops out of `breakdown` and its weight is lost from the max-attainable score — this bit us once with `detectBlocking.ts` returning `[]` on the clean-page case.

## Adding a new check group (e.g. a PageSpeed API check)

This is the designed extension point — no changes to existing logic should be required:

1. Add a new `lib/audit/parseX.ts` (or `checkX.ts` if it needs a network call — see `checkAiAccess.ts` for the pattern) returning `AuditCheck[]` with a new `group` value. Always emit a check for the passing case too, not just failures (see Scoring above).
2. Call it alongside the other checks in `app/api/audit/route.ts` and spread its checks into the combined array.
3. Add an entry to `GROUP_WEIGHTS` in `lib/audit/scoreResults.ts` (falls back to `DEFAULT_WEIGHT` if omitted), nudging other weights down so the total stays near 100.
4. Add a label to `GROUP_LABELS` in `lib/audit/groupLabels.ts` and an entry in `GROUP_TAB` (`'content'` or `'technical'`) in `components/ResultsView.tsx`.
5. Optionally add per-check "why this matters" copy to `CHECK_EXPLANATIONS` in `lib/audit/checkExplanations.ts`, keyed by the check's `label`.

## Security constraints — do not weaken without explicit request

- `lib/audit/validateUrl.ts` validates the **DNS-resolved IP**, not just the URL string, to prevent DNS-rebinding SSRF. It rejects loopback/private/link-local/reserved ranges for both IPv4 and IPv6.
- `lib/audit/fetchResource.ts` uses `undici`'s `fetch` with a custom `Agent` whose `connect.lookup` is **pinned** to the exact IP(s) `validateUrl` already resolved — this closes the TOCTOU gap where the fetch implementation's own DNS lookup could return a different (rebound) address. Both `fetchPage.ts` (main page) and `checkAiAccess.ts` (robots.txt/llms.txt) go through this. Don't switch either back to the global `fetch`/default dispatcher.
- Redirects are followed **manually** (`redirect: 'manual'`) and every hop is re-validated (and re-pinned) via `validateUrl` — never switch this to automatic redirect following.
- Response bodies are capped via a streaming byte-count check in `fetchResource.ts` (~3MB for the main page, ~512KB for robots.txt/llms.txt), not just a header check.
- The rate limiter (`lib/audit/rateLimiter.ts`) is intentionally in-memory and resets on cold start/redeploy — this is a documented, accepted tradeoff for a low-traffic stateless tool, not a bug.
- The site is deliberately unindexed (`app/robots.ts`, `X-Robots-Tag` header in `next.config.js`, `robots` metadata in `layout.tsx`) — keep all three in sync if the indexing policy ever changes.

## Conventions

- Tailwind CSS only, no component libraries.
- Keep check modules pure and synchronous given an already-loaded cheerio document — no network calls inside them — with the single documented exception of `checkAiAccess.ts` (see Architecture above).
- Error responses are always `{ error: string }` with an appropriate HTTP status; never let the API route throw uncaught.
- All scraped/derived text (check `label`/`message`, page `url`) must render as JSX children (`{value}`), never via `dangerouslySetInnerHTML` or similar — this is what keeps untrusted page content from becoming an XSS sink. This is also why multi-item findings (e.g. the list of blocked AI crawlers) are formatted as a newline-delimited string rendered with `whitespace-pre-line`, rather than as real `<ul>/<li>` markup — `AuditCheck.message` stays a plain string.
- Accessibility is a first-class concern, not an afterthought: custom interactive elements use the `FOCUS_RING`/`FOCUS_RING_INSET` pattern from `components/focusRing.ts` (a plain focus ring gets clipped by any `overflow-hidden` ancestor — use the inset variant there), single-select button groups (tabs, sort control) implement real WAI-ARIA APG patterns (roving `tabIndex`, arrow-key navigation, `role="tablist"/"tab"` or `role="radiogroup"/"radio"`) rather than plain `<button onClick>` groups, and `app/globals.css` has a global `prefers-reduced-motion: reduce` override that any new animation/transition should respect.
- Independent async work in `app/api/audit/route.ts` should be started before it's awaited so it overlaps with synchronous parsing (see `checkAiAccess` — kicked off, then only `await`ed when assembling the final `checks` array), rather than serialized with a blocking `await` at the call site.

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # verifies types + production build
```
