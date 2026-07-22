import type { AuditCheck, AuditResult, CheckStatus, GroupScore } from './types';

/**
 * Each group's share of the overall 100-point score. Weights are a
 * judgment call on how much a category affects real-world SEO/AI
 * visibility outcomes, not a formula — access/rendering/ai-access sit
 * higher because they can make a page invisible outright (blocked at
 * the network/bot layer, unreadable without JS, or excluded from AI
 * crawlers), while images/links are real but smaller factors.
 *
 * To add a new check group later (e.g. a "pagespeed" group backed by an
 * external API), add an entry here — and nudge the other weights down so
 * the total stays at (or near) 100 — then start pushing AuditCheck objects
 * with `group: 'pagespeed'` from a new parse module. No changes to the
 * aggregation logic below are required.
 */
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

const DEFAULT_WEIGHT = 5;

/** Fraction of a group's weight earned by a single check of a given status. */
const STATUS_CREDIT: Record<CheckStatus, number> = {
  pass: 1,
  warning: 0.5,
  fail: 0,
};

export function scoreResults(url: string, checks: AuditCheck[]): AuditResult {
  const checksByGroup = new Map<string, AuditCheck[]>();
  for (const check of checks) {
    const existing = checksByGroup.get(check.group) ?? [];
    existing.push(check);
    checksByGroup.set(check.group, existing);
  }

  const breakdown: GroupScore[] = [];
  let totalScore = 0;

  for (const [group, groupChecks] of Array.from(checksByGroup)) {
    const weight = GROUP_WEIGHTS[group] ?? DEFAULT_WEIGHT;
    const earnedFraction =
      groupChecks.reduce((sum, check) => sum + STATUS_CREDIT[check.status], 0) / groupChecks.length;
    const score = Math.round(weight * earnedFraction);

    breakdown.push({ group, weight, score, potentialGain: weight - score });
    totalScore += score;
  }

  const score = Math.max(0, Math.min(100, totalScore));

  return { url, score, checks, breakdown };
}
