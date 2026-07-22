import * as cheerio from 'cheerio';
import type { AuditCheck } from './types';
import { fetchResource, type FetchResourceResult } from './fetchResource';

const GROUP = 'sitemap';
const ROBOTS_TIMEOUT_MS = 6_000;
const ROBOTS_MAX_BODY_BYTES = 512 * 1024;
const SITEMAP_TIMEOUT_MS = 8_000;
// Sitemaps can legitimately be much larger than robots.txt/llms.txt (up to
// thousands of URLs), so this reuses the main-page fetch's size budget
// rather than the small-text-file budget used for robots.txt/llms.txt.
const SITEMAP_MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_SITEMAP_URLS = 50_000;
const STALE_MONTHS = 12;

interface SitemapUrlEntry {
  loc: string;
  lastmod: string | null;
}

interface ParsedSitemap {
  kind: 'urlset' | 'sitemapindex';
  entries: SitemapUrlEntry[];
}

/**
 * Parses a robots.txt body for a "Sitemap:" directive. Returns the raw
 * (possibly relative) value of the first directive found, or null.
 */
function extractSitemapDirective(robotsText: string): string | null {
  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    const match = /^sitemap\s*:\s*(.+)$/i.exec(line);
    if (match) {
      const value = match[1].trim();
      if (value) return value;
    }
  }
  return null;
}

function parseSitemapXml(xml: string): ParsedSitemap | null {
  const $ = cheerio.load(xml, { xmlMode: true });

  const collectEntries = (selector: string): SitemapUrlEntry[] => {
    const entries: SitemapUrlEntry[] = [];
    $(selector).each((_, el) => {
      const loc = $(el).children('loc').first().text().trim();
      if (!loc) return;
      const lastmod = $(el).children('lastmod').first().text().trim() || null;
      entries.push({ loc, lastmod });
    });
    return entries;
  };

  if ($('sitemapindex').length > 0) {
    return { kind: 'sitemapindex', entries: collectEntries('sitemapindex > sitemap') };
  }

  if ($('urlset').length > 0) {
    return { kind: 'urlset', entries: collectEntries('urlset > url') };
  }

  return null;
}

/**
 * Fetches robots.txt and the default /sitemap.xml in parallel. If robots.txt
 * declares a Sitemap: directive pointing elsewhere, fetches that location
 * instead (one extra request only when a site uses a non-default path).
 */
async function resolveSitemapLocation(origin: string): Promise<FetchResourceResult> {
  const defaultSitemapUrl = `${origin}/sitemap.xml`;

  const [robotsResult, defaultSitemapResult] = await Promise.all([
    fetchResource(`${origin}/robots.txt`, {
      timeoutMs: ROBOTS_TIMEOUT_MS,
      maxBodyBytes: ROBOTS_MAX_BODY_BYTES,
    }),
    fetchResource(defaultSitemapUrl, {
      timeoutMs: SITEMAP_TIMEOUT_MS,
      maxBodyBytes: SITEMAP_MAX_BODY_BYTES,
    }),
  ]);

  const directive =
    robotsResult.ok && robotsResult.status >= 200 && robotsResult.status < 300
      ? extractSitemapDirective(robotsResult.text)
      : null;

  if (!directive) return defaultSitemapResult;

  const directiveUrl = new URL(directive, origin).toString();
  if (directiveUrl === defaultSitemapUrl) return defaultSitemapResult;

  return fetchResource(directiveUrl, { timeoutMs: SITEMAP_TIMEOUT_MS, maxBodyBytes: SITEMAP_MAX_BODY_BYTES });
}

function buildSitemapCheck(result: FetchResourceResult): { check: AuditCheck; parsed: ParsedSitemap | null } {
  if (!result.ok) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'fail',
        message: `No sitemap could be found (${result.error}).`,
        group: GROUP,
      },
      parsed: null,
    };
  }

  if (result.status === 404) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'fail',
        message:
          'No sitemap.xml was found at the default location or declared in robots.txt. Sitemaps help crawlers and AI systems discover every page on a site.',
        group: GROUP,
      },
      parsed: null,
    };
  }

  if (result.status < 200 || result.status >= 300) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'warning',
        message: `The sitemap URL returned an HTTP ${result.status}, so it could not be verified.`,
        group: GROUP,
      },
      parsed: null,
    };
  }

  const parsed = parseSitemapXml(result.text);
  if (!parsed) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'warning',
        message: 'A sitemap was found but its XML could not be parsed as a valid <urlset> or <sitemapindex> document.',
        group: GROUP,
      },
      parsed: null,
    };
  }

  if (parsed.entries.length === 0) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'warning',
        message: `The sitemap was found but contains no ${parsed.kind === 'sitemapindex' ? 'child sitemap' : 'URL'} entries.`,
        group: GROUP,
      },
      parsed,
    };
  }

  if (parsed.kind === 'urlset' && parsed.entries.length > MAX_SITEMAP_URLS) {
    return {
      check: {
        label: 'Sitemap.xml',
        status: 'warning',
        message: `The sitemap contains ${parsed.entries.length} URLs, over the sitemap protocol's ${MAX_SITEMAP_URLS.toLocaleString()}-URL limit for a single file. Split it into multiple sitemaps referenced from a sitemap index.`,
        group: GROUP,
      },
      parsed,
    };
  }

  const message =
    parsed.kind === 'sitemapindex'
      ? `A sitemap index was found, referencing ${parsed.entries.length} child sitemap(s).`
      : `A valid sitemap was found, listing ${parsed.entries.length} URL(s).`;

  return { check: { label: 'Sitemap.xml', status: 'pass', message, group: GROUP }, parsed };
}

function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\/$/, '') || '/';
    return `${url.hostname.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

function findMatchingEntry(entries: SitemapUrlEntry[], pageUrl: string): SitemapUrlEntry | null {
  const target = normalizeUrl(pageUrl);
  if (!target) return null;
  return entries.find((entry) => normalizeUrl(entry.loc) === target) ?? null;
}

function buildPageListedCheck(matched: SitemapUrlEntry | null): AuditCheck {
  if (matched) {
    return {
      label: 'Page Listed in Sitemap',
      status: 'pass',
      message: 'The audited page is listed in the sitemap.',
      group: GROUP,
    };
  }

  return {
    label: 'Page Listed in Sitemap',
    status: 'warning',
    message: "The audited page isn't listed in the sitemap, which can slow discovery by crawlers and AI systems.",
    group: GROUP,
  };
}

function mostRecentLastmod(entries: SitemapUrlEntry[]): string | null {
  let mostRecent: { raw: string; time: number } | null = null;
  for (const entry of entries) {
    if (!entry.lastmod) continue;
    const time = new Date(entry.lastmod).getTime();
    if (Number.isNaN(time)) continue;
    if (!mostRecent || time > mostRecent.time) mostRecent = { raw: entry.lastmod, time };
  }
  return mostRecent?.raw ?? null;
}

function buildFreshnessCheck(matched: SitemapUrlEntry | null, allEntries: SitemapUrlEntry[]): AuditCheck {
  const lastmod = matched?.lastmod ?? mostRecentLastmod(allEntries);
  const source = matched?.lastmod ? "The audited page's own" : "The sitemap's most recent";

  if (!lastmod) {
    return {
      label: 'Sitemap Freshness',
      status: 'warning',
      message:
        'The sitemap entries have no "lastmod" date. This is optional but recommended so crawlers can prioritize recrawling changed pages.',
      group: GROUP,
    };
  }

  const parsed = new Date(lastmod);
  if (Number.isNaN(parsed.getTime())) {
    return {
      label: 'Sitemap Freshness',
      status: 'warning',
      message: `A "lastmod" value ("${lastmod}") could not be parsed as a valid date.`,
      group: GROUP,
    };
  }

  const monthsOld = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (monthsOld > STALE_MONTHS) {
    return {
      label: 'Sitemap Freshness',
      status: 'warning',
      message: `${source} "lastmod" is ${lastmod}, over ${STALE_MONTHS} months old. Keeping this current helps crawlers and AI systems prioritize recrawling.`,
      group: GROUP,
    };
  }

  return {
    label: 'Sitemap Freshness',
    status: 'pass',
    message: `${source} "lastmod" is ${lastmod}, within the last ${STALE_MONTHS} months.`,
    group: GROUP,
  };
}

/**
 * Checks sitemap discovery/validity, whether the audited page is listed in
 * it, and its lastmod freshness. The latter two checks only run when a
 * usable (pass-status), non-index sitemap was found — verifying page
 * inclusion or freshness against a sitemap index would require recursively
 * fetching child sitemaps, which is out of scope.
 */
export async function checkSitemap(finalUrl: string): Promise<AuditCheck[]> {
  const origin = new URL(finalUrl).origin;
  const result = await resolveSitemapLocation(origin);
  const { check: sitemapCheck, parsed } = buildSitemapCheck(result);

  if (sitemapCheck.status !== 'pass' || !parsed || parsed.kind !== 'urlset') {
    return [sitemapCheck];
  }

  const matched = findMatchingEntry(parsed.entries, finalUrl);
  return [sitemapCheck, buildPageListedCheck(matched), buildFreshnessCheck(matched, parsed.entries)];
}
