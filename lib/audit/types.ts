export type CheckStatus = 'pass' | 'warning' | 'fail';

export interface AuditCheck {
  label: string;
  status: CheckStatus;
  message: string;
  /** Logical grouping used by the UI to organize checks (e.g. "meta", "headings"). */
  group: string;
}

export interface GroupScore {
  group: string;
  /** Points this group can contribute to the overall 100-point score. */
  weight: number;
  /** Points actually earned in this group, given its checks' statuses. */
  score: number;
  /** Points recoverable in this group by resolving its warnings/fails (weight - score, rounded). */
  potentialGain: number;
}

export interface AuditResult {
  url: string;
  score: number;
  checks: AuditCheck[];
  breakdown: GroupScore[];
}

export interface CheckGroup {
  name: string;
  checks: AuditCheck[];
}
