import type { CheerioAPI } from 'cheerio';
import type { AuditCheck } from './types';

const GROUP = 'meta';

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 160;

export function parseMeta($: CheerioAPI): AuditCheck[] {
  const checks: AuditCheck[] = [];

  const title = $('title').first().text().trim();
  if (!title) {
    checks.push({
      label: 'Title Tag',
      status: 'fail',
      message: 'The page is missing a <title> tag.',
      group: GROUP,
    });
  } else if (title.length < TITLE_MIN) {
    checks.push({
      label: 'Title Tag',
      status: 'warning',
      message: `Title is ${title.length} characters, which is shorter than the recommended ${TITLE_MIN}-${TITLE_MAX}. Title: "${title}"`,
      group: GROUP,
    });
  } else if (title.length > TITLE_MAX) {
    checks.push({
      label: 'Title Tag',
      status: 'warning',
      message: `Title is ${title.length} characters, which is longer than the recommended ${TITLE_MIN}-${TITLE_MAX} and may be truncated in search results. Title: "${title}"`,
      group: GROUP,
    });
  } else {
    checks.push({
      label: 'Title Tag',
      status: 'pass',
      message: `Title length (${title.length} characters) is within the recommended range.`,
      group: GROUP,
    });
  }

  const description = $('meta[name="description"]').attr('content')?.trim() ?? '';
  if (!description) {
    checks.push({
      label: 'Meta Description',
      status: 'fail',
      message: 'The page is missing a meta description.',
      group: GROUP,
    });
  } else if (description.length < DESCRIPTION_MIN) {
    checks.push({
      label: 'Meta Description',
      status: 'warning',
      message: `Meta description is ${description.length} characters, shorter than the recommended ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}.`,
      group: GROUP,
    });
  } else if (description.length > DESCRIPTION_MAX) {
    checks.push({
      label: 'Meta Description',
      status: 'warning',
      message: `Meta description is ${description.length} characters, longer than the recommended ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} and may be truncated.`,
      group: GROUP,
    });
  } else {
    checks.push({
      label: 'Meta Description',
      status: 'pass',
      message: `Meta description length (${description.length} characters) is within the recommended range.`,
      group: GROUP,
    });
  }

  const canonical = $('link[rel="canonical"]').attr('href')?.trim();
  if (!canonical) {
    checks.push({
      label: 'Canonical Link',
      status: 'warning',
      message: 'No canonical link tag was found.',
      group: GROUP,
    });
  } else {
    checks.push({
      label: 'Canonical Link',
      status: 'pass',
      message: `Canonical URL is set to "${canonical}".`,
      group: GROUP,
    });
  }

  const robots = $('meta[name="robots"]').attr('content')?.trim().toLowerCase();
  if (robots && (robots.includes('noindex') || robots.includes('nofollow'))) {
    checks.push({
      label: 'Robots Meta Tag',
      status: 'warning',
      message: `Robots meta tag restricts indexing/following: "${robots}".`,
      group: GROUP,
    });
  } else {
    checks.push({
      label: 'Robots Meta Tag',
      status: 'pass',
      message: robots
        ? `Robots meta tag is present and does not restrict indexing: "${robots}".`
        : 'No robots meta tag restrictions found; page is indexable by default.',
      group: GROUP,
    });
  }

  return checks;
}
