import type { CheerioAPI } from 'cheerio';
import type { AuditCheck } from './types';

const GROUP = 'structured-data';
const STALE_MONTHS = 12;
const LAST_UPDATED_PATTERN = /\b(last\s+updated|updated\s+on|last\s+modified)\b/i;

type JsonNode = Record<string, unknown>;

const ARTICLE_TYPES = new Set(['article', 'newsarticle', 'blogposting', 'techarticle']);

function getTypes(node: JsonNode): string[] {
  const type = node['@type'];
  if (typeof type === 'string') return [type.toLowerCase()];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase());
  return [];
}

/** Flattens JSON-LD (including @graph arrays) into a list of node objects. */
function collectNodes(value: unknown, nodes: JsonNode[] = []): JsonNode[] {
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, nodes);
  } else if (value && typeof value === 'object') {
    const node = value as JsonNode;
    nodes.push(node);
    if (node['@graph']) collectNodes(node['@graph'], nodes);
  }
  return nodes;
}

function validateFaqPage(node: JsonNode): string[] {
  const errors: string[] = [];
  const mainEntity = node.mainEntity;
  if (!Array.isArray(mainEntity) || mainEntity.length === 0) {
    errors.push('FAQPage is missing a non-empty "mainEntity" array of questions');
    return errors;
  }
  const missingAnswer = mainEntity.some((q) => {
    const question = q as JsonNode;
    const answer = question.acceptedAnswer as JsonNode | undefined;
    return !answer || typeof answer.text !== 'string' || answer.text.trim() === '';
  });
  if (missingAnswer) errors.push('One or more FAQPage questions are missing an "acceptedAnswer.text"');
  return errors;
}

function validateArticle(node: JsonNode): string[] {
  const errors: string[] = [];
  if (typeof node.headline !== 'string' || node.headline.trim() === '') errors.push('Article is missing "headline"');
  if (typeof node.datePublished !== 'string' || node.datePublished.trim() === '') {
    errors.push('Article is missing "datePublished"');
  }
  return errors;
}

function validateProduct(node: JsonNode): string[] {
  const errors: string[] = [];
  if (typeof node.name !== 'string' || node.name.trim() === '') errors.push('Product is missing "name"');
  if (!node.offers && !node.review && !node.aggregateRating) {
    errors.push('Product is missing "offers", "review", or "aggregateRating"');
  }
  return errors;
}

function checkSchema(nodes: JsonNode[], malformedCount: number): AuditCheck {
  if (malformedCount > 0) {
    return {
      label: 'Structured Data (Schema.org)',
      status: 'fail',
      message: `${malformedCount} <script type="application/ld+json"> block(s) contain invalid JSON and could not be parsed.`,
      group: GROUP,
    };
  }

  if (nodes.length === 0) {
    return {
      label: 'Structured Data (Schema.org)',
      status: 'warning',
      message: 'No JSON-LD structured data was found on the page.',
      group: GROUP,
    };
  }

  const errors: string[] = [];
  let recognizedCount = 0;

  for (const node of nodes) {
    const types = getTypes(node);
    if (types.includes('faqpage')) {
      recognizedCount += 1;
      errors.push(...validateFaqPage(node));
    }
    if (types.some((t) => ARTICLE_TYPES.has(t))) {
      recognizedCount += 1;
      errors.push(...validateArticle(node));
    }
    if (types.includes('product')) {
      recognizedCount += 1;
      errors.push(...validateProduct(node));
    }
  }

  if (recognizedCount === 0) {
    return {
      label: 'Structured Data (Schema.org)',
      status: 'pass',
      message: `${nodes.length} JSON-LD node(s) found, though none are FAQPage/Article/Product (the types this check validates in depth).`,
      group: GROUP,
    };
  }

  if (errors.length > 0) {
    return {
      label: 'Structured Data (Schema.org)',
      status: 'fail',
      message: `Structured data was found but has errors: ${errors.join('; ')}.`,
      group: GROUP,
    };
  }

  return {
    label: 'Structured Data (Schema.org)',
    status: 'pass',
    message: `${recognizedCount} FAQPage/Article/Product node(s) found and pass required-field validation.`,
    group: GROUP,
  };
}

function findDateModified(nodes: JsonNode[]): string | null {
  for (const node of nodes) {
    const value = node.dateModified;
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

function checkFreshness($: CheerioAPI, nodes: JsonNode[]): AuditCheck {
  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const hasVisibleDateLabel = LAST_UPDATED_PATTERN.test(bodyText);
  const dateModified = findDateModified(nodes);

  if (dateModified) {
    const parsed = new Date(dateModified);
    if (Number.isNaN(parsed.getTime())) {
      return {
        label: 'Freshness Signals',
        status: 'warning',
        message: `"dateModified" ("${dateModified}") could not be parsed as a valid date.`,
        group: GROUP,
      };
    }
    const monthsOld = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsOld > STALE_MONTHS) {
      return {
        label: 'Freshness Signals',
        status: 'warning',
        message: `"dateModified" is set to ${dateModified}, which is over ${STALE_MONTHS} months old. Keeping this in sync with real edits helps signal freshness to AI indexes.`,
        group: GROUP,
      };
    }
    return {
      label: 'Freshness Signals',
      status: 'pass',
      message: `"dateModified" is set to ${dateModified} and is within the last ${STALE_MONTHS} months.`,
      group: GROUP,
    };
  }

  if (hasVisibleDateLabel) {
    return {
      label: 'Freshness Signals',
      status: 'warning',
      message: 'A visible "last updated"-style label was found, but it isn\'t backed by a "dateModified" field in structured data.',
      group: GROUP,
    };
  }

  return {
    label: 'Freshness Signals',
    status: 'warning',
    message: 'No visible last-updated date or "dateModified" in structured data was found. AI engines use freshness signals like these to gauge how current a page is.',
    group: GROUP,
  };
}

export function parseStructuredData($: CheerioAPI): AuditCheck[] {
  const scripts = $('script[type="application/ld+json"]');
  const nodes: JsonNode[] = [];
  let malformedCount = 0;

  scripts.each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      collectNodes(parsed, nodes);
    } catch {
      malformedCount += 1;
    }
  });

  return [checkSchema(nodes, malformedCount), checkFreshness($, nodes)];
}
