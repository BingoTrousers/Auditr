import type { AuditCheck } from './types';
import { fetchResource, type FetchResourceResult } from './fetchResource';

const GROUP = 'ai-access';
const FETCH_TIMEOUT_MS = 6_000;
const MAX_BODY_BYTES = 512 * 1024; // robots.txt/llms.txt are always small text files

interface AiCrawler {
  name: string;
  vendor: string;
}

// Well-known AI crawler/training user-agents. Not exhaustive, but covers the
// major AI answer engines and model trainers site owners are most likely to
// care about being blocked from.
const AI_CRAWLERS: AiCrawler[] = [
  { name: 'Amazonbot', vendor: 'Amazon' },
  { name: 'anthropic-ai', vendor: 'Anthropic' },
  { name: 'Applebot-Extended', vendor: 'Apple' },
  { name: 'Bytespider', vendor: 'ByteDance' },
  { name: 'CCBot', vendor: 'Common Crawl (used to train many LLMs)' },
  { name: 'ChatGPT-User', vendor: 'OpenAI' },
  { name: 'Claude-Web', vendor: 'Anthropic' },
  { name: 'ClaudeBot', vendor: 'Anthropic' },
  { name: 'cohere-ai', vendor: 'Cohere' },
  { name: 'Diffbot', vendor: 'Diffbot' },
  { name: 'GPTBot', vendor: 'OpenAI' },
  { name: 'Google-Extended', vendor: 'Google (Gemini / AI features)' },
  { name: 'meta-externalagent', vendor: 'Meta' },
  { name: 'OAI-SearchBot', vendor: 'OpenAI' },
  { name: 'Perplexity-User', vendor: 'Perplexity' },
  { name: 'PerplexityBot', vendor: 'Perplexity' },
];

interface RobotsGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
}

/**
 * Parses robots.txt into User-agent groups. Consecutive `User-agent:` lines
 * share the directives that follow them, per the standard robots.txt format.
 */
function parseRobotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const field = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === 'disallow') {
      lastWasAgent = false;
      if (current && value !== '') current.disallow.push(value);
    } else if (field === 'allow') {
      lastWasAgent = false;
      if (current) current.allow.push(value);
    } else {
      lastWasAgent = false;
    }
  }

  return groups;
}

/**
 * Checks whether a bot is fully blocked by a blanket "Disallow: /" in its
 * most specific matching group (its own named group if one exists,
 * otherwise the wildcard "*" group). Partial/path-specific disallow rules
 * are intentionally not flagged here to keep this check unambiguous.
 */
function isBlockedForBot(groups: RobotsGroup[], botName: string): boolean {
  const lower = botName.toLowerCase();
  const specific = groups.find((g) => g.agents.includes(lower));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const group = specific ?? wildcard;
  if (!group) return false;

  const hasBlanketDisallow = group.disallow.some((path) => path === '/');
  if (!hasBlanketDisallow) return false;

  const hasBlanketAllowOverride = group.allow.some((path) => path === '/' || path === '');
  return !hasBlanketAllowOverride;
}

function buildAiCrawlerCheck(result: FetchResourceResult): AuditCheck {
  if (!result.ok) {
    return {
      label: 'AI Crawler Access',
      status: 'warning',
      message: `Could not fetch robots.txt to check AI crawler access (${result.error}).`,
      group: GROUP,
    };
  }

  if (result.status === 404) {
    return {
      label: 'AI Crawler Access',
      status: 'pass',
      message: 'No robots.txt was found, so no AI crawlers are blocked by it.',
      group: GROUP,
    };
  }

  if (result.status < 200 || result.status >= 300) {
    return {
      label: 'AI Crawler Access',
      status: 'warning',
      message: `robots.txt returned an HTTP ${result.status}, so AI crawler access could not be verified.`,
      group: GROUP,
    };
  }

  const groups = parseRobotsGroups(result.text);
  const blocked = AI_CRAWLERS.filter((bot) => isBlockedForBot(groups, bot.name)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  if (blocked.length === 0) {
    return {
      label: 'AI Crawler Access',
      status: 'pass',
      message:
        'robots.txt does not block any of the major AI crawlers checked (ClaudeBot, Google-Extended, GPTBot, PerplexityBot, and others).',
      group: GROUP,
    };
  }

  const list = blocked.map((bot) => `  • ${bot.name} (${bot.vendor})`).join('\n');
  return {
    label: 'AI Crawler Access',
    status: 'fail',
    message: `robots.txt fully blocks ${blocked.length} AI crawler(s), which can prevent the page from being cited by AI answer engines:\n${list}\n\nNote: this only detects a blanket "Disallow: /" rule per bot, not partial path restrictions.`,
    group: GROUP,
  };
}

function buildLlmsTxtCheck(result: FetchResourceResult): AuditCheck {
  if (result.ok && result.status >= 200 && result.status < 300 && result.text.trim() !== '') {
    return {
      label: 'llms.txt',
      status: 'pass',
      message: 'An llms.txt file was found at the site root.',
      group: GROUP,
    };
  }

  return {
    label: 'llms.txt',
    status: 'warning',
    message:
      'No llms.txt file was found at the site root. This is an emerging, low-stakes signal some sites use to help AI systems understand site structure.',
    group: GROUP,
  };
}

/**
 * Fetches robots.txt and llms.txt from the site's root (using the final,
 * already-SSRF-validated URL's origin) and checks AI crawler access. Runs
 * both fetches through fetchResource, which shares the same DNS-pinning
 * and redirect-revalidation protections as the main page fetch.
 */
export async function checkAiAccess(finalUrl: string): Promise<AuditCheck[]> {
  const origin = new URL(finalUrl).origin;

  const [robotsResult, llmsResult] = await Promise.all([
    fetchResource(`${origin}/robots.txt`, { timeoutMs: FETCH_TIMEOUT_MS, maxBodyBytes: MAX_BODY_BYTES }),
    fetchResource(`${origin}/llms.txt`, { timeoutMs: FETCH_TIMEOUT_MS, maxBodyBytes: MAX_BODY_BYTES }),
  ]);

  return [buildAiCrawlerCheck(robotsResult), buildLlmsTxtCheck(llmsResult)];
}
