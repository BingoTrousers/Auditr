import type { AuditCheck, AuditResult } from './types';
import { GROUP_LABELS } from './groupLabels';

function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}

function groupChecks(checks: AuditCheck[]): Map<string, AuditCheck[]> {
  const groups = new Map<string, AuditCheck[]>();
  for (const check of checks) {
    const existing = groups.get(check.group) ?? [];
    existing.push(check);
    groups.set(check.group, existing);
  }
  return groups;
}

const STATUS_ICON: Record<AuditCheck['status'], string> = {
  pass: '✅',
  warning: '⚠️',
  fail: '❌',
};

/** Full Markdown report, all checks including passes, suitable for sharing or pasting into docs. */
export function buildMarkdownReport(result: AuditResult): string {
  const breakdownByGroup = new Map(result.breakdown.map((entry) => [entry.group, entry]));
  const groups = groupChecks(result.checks);

  const lines: string[] = [];
  lines.push(`# Audit Report: ${result.url}`);
  lines.push('');
  lines.push(`**Overall score:** ${result.score}/100`);
  lines.push('');

  for (const [group, checks] of Array.from(groups)) {
    const score = breakdownByGroup.get(group);
    lines.push(score ? `## ${groupLabel(group)} (${score.score}/${score.weight})` : `## ${groupLabel(group)}`);
    lines.push('');
    for (const check of checks) {
      lines.push(`- ${STATUS_ICON[check.status]} **${check.label}** — ${check.message}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

/** Raw AuditResult as pretty-printed JSON, for feeding into other tooling. */
export function buildJsonReport(result: AuditResult): string {
  return JSON.stringify(result, null, 2);
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Flat CSV of every check (group, label, status, message), for spreadsheets or ticket importers. */
export function buildCsvReport(result: AuditResult): string {
  const lines = ['group,label,status,message'];
  for (const check of result.checks) {
    lines.push(
      [groupLabel(check.group), check.label, check.status, check.message].map(csvField).join(','),
    );
  }
  return lines.join('\n');
}

/** GitHub-flavored markdown checklist of actionable (warning/fail) checks, for pasting into an issue/PR. */
export function buildGithubChecklist(result: AuditResult): string {
  const actionable = result.checks.filter((check) => check.status !== 'pass');

  const lines: string[] = [];
  lines.push(`## SEO/GEO audit findings for ${result.url}`);
  lines.push('');
  lines.push(`Score: ${result.score}/100`);
  lines.push('');

  if (actionable.length === 0) {
    lines.push('No outstanding issues — all checks passed.');
    return lines.join('\n').trim();
  }

  const groups = groupChecks(actionable);
  for (const [group, checks] of Array.from(groups)) {
    lines.push(`### ${groupLabel(group)}`);
    for (const check of checks) {
      const flag = check.status === 'fail' ? '**FAIL**' : '**WARNING**';
      lines.push(`- [ ] ${flag} ${check.label} — ${check.message}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Instruction-framed prompt listing only actionable (warning/fail) checks, meant to be pasted
 * into an LLM coding assistant pointed at the audited site's codebase.
 */
export function buildLlmPrompt(result: AuditResult): string {
  const actionable = result.checks.filter((check) => check.status !== 'pass');

  const lines: string[] = [];
  lines.push(
    `You are fixing SEO/GEO (AI-visibility) issues found by an automated audit of ${result.url} (score: ${result.score}/100).`,
  );
  lines.push(
    "For each issue below, find the relevant code in this repository, understand why it's failing, and fix it. Skip anything already handled intentionally elsewhere in the codebase.",
  );
  lines.push('');

  if (actionable.length === 0) {
    lines.push('No outstanding issues — all checks passed.');
    return lines.join('\n').trim();
  }

  const groups = groupChecks(actionable);
  for (const [group, checks] of Array.from(groups)) {
    lines.push(`## ${groupLabel(group)}`);
    for (const check of checks) {
      lines.push(`- [${check.status.toUpperCase()}] ${check.label}: ${check.message}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
