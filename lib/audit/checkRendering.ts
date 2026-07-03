import type { CheerioAPI } from 'cheerio';
import type { AuditCheck } from './types';

const GROUP = 'rendering';
const MIN_VISIBLE_WORDS = 50;
const SPA_ROOT_SELECTORS = ['#root', '#app', '#__next', '#__nuxt'];

const PAYWALL_PATTERNS: RegExp[] = [
  /subscribe to (continue|read)/i,
  /sign in to continue reading/i,
  /log in to continue reading/i,
  /this (content|article) is for (subscribers|members)/i,
  /become a member to (continue|read)/i,
  /create a free account to continue reading/i,
  /paywall/i,
];

/** Text visible in the raw HTML, with script/style/template content excluded. */
function getVisibleText($: CheerioAPI): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root: any = $('body').length ? $('body') : $.root();
  const $clone = root.clone();
  $clone.find('script, style, noscript, template').remove();
  return $clone.text().replace(/\s+/g, ' ').trim();
}

/**
 * Heuristic-only check for whether key content is server-rendered. It
 * measures visible text volume in the raw (pre-JS) HTML rather than
 * actually executing JavaScript, so it can't distinguish "truly empty
 * page" from "unusually terse but fully server-rendered page" — messaging
 * calls this out explicitly.
 */
export function checkRendering($: CheerioAPI): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const visibleText = getVisibleText($);
  const wordCount = visibleText === '' ? 0 : visibleText.split(/\s+/).filter(Boolean).length;
  const hasSpaRoot = SPA_ROOT_SELECTORS.some((selector) => $(selector).length > 0);

  if (wordCount < MIN_VISIBLE_WORDS) {
    checks.push({
      label: 'Server-Side Rendering',
      status: 'fail',
      message: `Only ~${wordCount} word(s) of text are visible in the raw HTML${hasSpaRoot ? ' (a client-side app root element was detected)' : ''}. AI crawlers typically don't execute JavaScript, so content that only appears after JS runs is invisible to them. This is a heuristic based on raw HTML text volume, not an actual JS render, so verify manually before assuming the worst.`,
      group: GROUP,
    });
  } else if (hasSpaRoot && wordCount < MIN_VISIBLE_WORDS * 3) {
    checks.push({
      label: 'Server-Side Rendering',
      status: 'warning',
      message: `A client-side app root element (e.g. #root/#app/#__next) was detected alongside a relatively low amount of visible text (~${wordCount} words) in the raw HTML. Double-check that key content is server-rendered rather than injected entirely by JavaScript.`,
      group: GROUP,
    });
  } else {
    checks.push({
      label: 'Server-Side Rendering',
      status: 'pass',
      message: `~${wordCount} words of text are visible directly in the raw HTML, suggesting key content is server-rendered.`,
      group: GROUP,
    });
  }

  const matchedPaywall = PAYWALL_PATTERNS.some((pattern) => pattern.test(visibleText));
  if (matchedPaywall) {
    checks.push({
      label: 'Login/Paywall Gating',
      status: 'warning',
      message: 'The page appears to contain login-wall or paywall language, which can prevent AI crawlers (and search engines) from accessing the full content.',
      group: GROUP,
    });
  } else {
    checks.push({
      label: 'Login/Paywall Gating',
      status: 'pass',
      message: 'No obvious login-wall or paywall language was detected.',
      group: GROUP,
    });
  }

  return checks;
}
