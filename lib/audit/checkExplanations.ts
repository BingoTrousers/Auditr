/**
 * One-line "why this matters" context per check, keyed by AuditCheck.label. Shown in the UI
 * so a non-technical reader doesn't have to guess why a given check affects SEO/GEO outcomes.
 * Labels are stable across a check's pass/warning/fail variants (see e.g. parseMeta.ts), so a
 * single map keyed by label covers every check without touching the check modules themselves.
 */
export const CHECK_EXPLANATIONS: Record<string, string> = {
  'Title Tag':
    'The title tag is the primary signal search engines and AI crawlers use to understand what a page is about, and it\'s usually the first thing shown in results.',
  'Meta Description':
    'Search engines often show this text as the result snippet, and it strongly influences whether someone clicks through.',
  'Canonical Link':
    'Tells search engines which URL is the authoritative version of a page, preventing duplicate content from splitting ranking signals.',
  'Robots Meta Tag':
    'Controls whether search engines are allowed to index this page at all — a misconfigured tag can silently deindex it.',
  'H1 Heading':
    'A single, clear H1 gives search engines and AI models the primary topic of the page at a glance.',
  'Heading Structure':
    'A logical heading hierarchy helps both search engines and screen readers understand how the content is organized.',
  'Image Alt Text':
    'Alt text is how search engines and AI models understand image content, and it\'s required for screen reader accessibility.',
  'Link Count':
    'Internal and external links help crawlers discover related pages and establish topical relevance.',
  'Bot/WAF Protection':
    'If bot protection blocks legitimate crawlers, the page can be invisible to search engines and AI tools regardless of how well-optimized the content is.',
  'AI Crawler Access':
    'Determines whether AI assistants like ChatGPT or Claude are allowed to read and cite this page at all.',
  'llms.txt':
    'An emerging convention that tells AI crawlers how to interpret and prioritize a site\'s content.',
  'Server-Side Rendering':
    'Crawlers that don\'t execute JavaScript only see what\'s in the initial HTML — content that only appears after client-side rendering may never be indexed.',
  'Answer-First Structure':
    'AI models tend to extract and cite content that states its answer up front, rather than burying it after preamble.',
  'Heading-as-Question':
    'Question-phrased headings match how people query AI assistants, making the content more likely to be surfaced as a direct answer.',
  'Data & Statistic Density':
    'Concrete facts and figures are what AI models most often quote verbatim when citing a source.',
  'Freshness Signals':
    'Visible dates signal to both search engines and AI models that the content is current and trustworthy.',
  'Login/Paywall Gating':
    'Content hidden behind a login or paywall can\'t be crawled or cited, no matter how well it\'s written.',
  'Structured Data (Schema.org)':
    'Schema markup gives search engines and AI models explicit, machine-readable facts about the page instead of making them infer it from prose.',
  'Sitemap.xml':
    'An XML sitemap tells crawlers every URL on a site upfront, instead of relying on them to discover pages by following links.',
  'Page Listed in Sitemap':
    "If the exact page being audited isn't in the sitemap, crawlers and AI systems may take longer to discover it, or miss it entirely.",
  'Sitemap Freshness':
    'A recent "lastmod" date signals to crawlers which pages have changed and deserve a priority recrawl.',
};
