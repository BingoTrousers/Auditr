import type { CheerioAPI } from 'cheerio';
import type { AuditCheck } from './types';

const GROUP = 'headings';

export function parseHeadings($: CheerioAPI): AuditCheck[] {
  const checks: AuditCheck[] = [];

  const headings: { level: number; text: string }[] = [];
  $('h1, h2, h3').each((_, el) => {
    const level = Number(el.tagName.substring(1));
    headings.push({ level, text: $(el).text().trim() });
  });

  const h1Count = headings.filter((h) => h.level === 1).length;

  if (h1Count === 0) {
    checks.push({
      label: 'H1 Heading',
      status: 'fail',
      message: 'The page has no <h1> heading.',
      group: GROUP,
    });
  } else if (h1Count > 1) {
    checks.push({
      label: 'H1 Heading',
      status: 'warning',
      message: `The page has ${h1Count} <h1> headings; ideally there should be exactly one.`,
      group: GROUP,
    });
  } else {
    checks.push({
      label: 'H1 Heading',
      status: 'pass',
      message: 'The page has exactly one <h1> heading.',
      group: GROUP,
    });
  }

  let skippedLevel = false;
  let previousLevel = 0;
  for (const heading of headings) {
    if (previousLevel > 0 && heading.level - previousLevel > 1) {
      skippedLevel = true;
      break;
    }
    previousLevel = heading.level;
  }

  if (headings.length === 0) {
    checks.push({
      label: 'Heading Structure',
      status: 'warning',
      message: 'No headings (H1-H3) were found on the page.',
      group: GROUP,
    });
  } else if (skippedLevel) {
    checks.push({
      label: 'Heading Structure',
      status: 'warning',
      message: 'Heading levels appear to skip (e.g. an H1 followed directly by an H3), which can confuse document structure.',
      group: GROUP,
    });
  } else {
    checks.push({
      label: 'Heading Structure',
      status: 'pass',
      message: `Found ${headings.length} heading(s) (H1-H3) with no skipped levels.`,
      group: GROUP,
    });
  }

  return checks;
}
