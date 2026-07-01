import type { CheerioAPI } from 'cheerio';
import type { AuditCheck } from './types';

const GROUP = 'images';

export function parseImages($: CheerioAPI): AuditCheck[] {
  const checks: AuditCheck[] = [];

  const images = $('img');
  const total = images.length;

  let missingAlt = 0;
  images.each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt.trim() === '') {
      missingAlt += 1;
    }
  });

  if (total === 0) {
    checks.push({
      label: 'Image Alt Text',
      status: 'pass',
      message: 'The page has no images to check.',
      group: GROUP,
    });
    return checks;
  }

  const withAlt = total - missingAlt;
  const coveragePct = Math.round((withAlt / total) * 100);

  if (missingAlt === 0) {
    checks.push({
      label: 'Image Alt Text',
      status: 'pass',
      message: `All ${total} image(s) have alt text.`,
      group: GROUP,
    });
  } else if (missingAlt === total) {
    checks.push({
      label: 'Image Alt Text',
      status: 'fail',
      message: `None of the ${total} image(s) on the page have alt text.`,
      group: GROUP,
    });
  } else {
    checks.push({
      label: 'Image Alt Text',
      status: 'warning',
      message: `${missingAlt} of ${total} image(s) are missing alt text (${coveragePct}% coverage).`,
      group: GROUP,
    });
  }

  return checks;
}
