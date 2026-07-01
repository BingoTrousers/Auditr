import type { AuditCheck, AuditResult, CheckStatus } from './types';

/**
 * Penalty applied to the overall score for each check of a given status,
 * per group. To add a new check group later (e.g. a "pagespeed" group
 * backed by an external API), just add an entry here and start pushing
 * AuditCheck objects with `group: 'pagespeed'` from a new parse module —
 * no changes to the aggregation logic below are required.
 */
const GROUP_PENALTIES: Record<string, Record<CheckStatus, number>> = {
  access: { fail: 20, warning: 10, pass: 0 },
  meta: { fail: 15, warning: 6, pass: 0 },
  headings: { fail: 12, warning: 5, pass: 0 },
  images: { fail: 10, warning: 4, pass: 0 },
  links: { fail: 8, warning: 3, pass: 0 },
};

const DEFAULT_PENALTY: Record<CheckStatus, number> = { fail: 10, warning: 4, pass: 0 };

export function scoreResults(url: string, checks: AuditCheck[]): AuditResult {
  let penaltyTotal = 0;

  for (const check of checks) {
    const penalties = GROUP_PENALTIES[check.group] ?? DEFAULT_PENALTY;
    penaltyTotal += penalties[check.status];
  }

  const score = Math.max(0, Math.min(100, 100 - penaltyTotal));

  return { url, score, checks };
}
