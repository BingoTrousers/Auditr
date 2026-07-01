export type CheckStatus = 'pass' | 'warning' | 'fail';

export interface AuditCheck {
  label: string;
  status: CheckStatus;
  message: string;
  /** Logical grouping used by the UI to organize checks (e.g. "meta", "headings"). */
  group: string;
}

export interface AuditResult {
  url: string;
  score: number;
  checks: AuditCheck[];
}

export interface CheckGroup {
  name: string;
  checks: AuditCheck[];
}
