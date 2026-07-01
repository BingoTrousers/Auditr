import type { CheerioAPI } from 'cheerio';
import type { AuditCheck } from './types';

const GROUP = 'links';

export function parseLinks($: CheerioAPI, pageUrl: string): AuditCheck[] {
  const checks: AuditCheck[] = [];

  let pageHostname: string;
  try {
    pageHostname = new URL(pageUrl).hostname;
  } catch {
    pageHostname = '';
  }

  let internal = 0;
  let external = 0;

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }

    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.hostname === pageHostname) {
        internal += 1;
      } else {
        external += 1;
      }
    } catch {
      // Ignore unparseable hrefs.
    }
  });

  const total = internal + external;

  if (total === 0) {
    checks.push({
      label: 'Link Count',
      status: 'warning',
      message: 'No links were found on the page.',
      group: GROUP,
    });
  } else if (internal === 0) {
    checks.push({
      label: 'Link Count',
      status: 'warning',
      message: `Found ${external} external link(s) but no internal links, which can hurt site navigation and crawlability.`,
      group: GROUP,
    });
  } else {
    checks.push({
      label: 'Link Count',
      status: 'pass',
      message: `Found ${internal} internal link(s) and ${external} external link(s).`,
      group: GROUP,
    });
  }

  return checks;
}
