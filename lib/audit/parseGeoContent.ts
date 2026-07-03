import type { CheerioAPI } from 'cheerio';
import type { AuditCheck } from './types';

const GROUP = 'geo-content';
const OPENING_WORD_COUNT = 150;
const MIN_OPENING_WORDS = 20;
const MIN_WORDS_FOR_DATA_CHECK = 150;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were',
  'be', 'this', 'that', 'it', 'as', 'by', 'at', 'from', 'your', 'you', 'how', 'what', 'why', 'guide',
]);

const QUESTION_WORDS = ['how', 'what', 'why', 'when', 'where', 'who', 'which', 'can', 'does', 'do', 'is', 'are', 'should', 'will', 'could', 'would'];

const VAGUE_HEADINGS = new Set([
  'overview', 'features', 'introduction', 'conclusion', 'benefits', 'details', 'summary',
  'about', 'background', 'description', 'more information', 'other', 'info',
]);

function getBodyText($: CheerioAPI): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root: any = $('body').length ? $('body') : $.root();
  const $clone = root.clone();
  $clone.find('script, style, noscript, template, nav, header, footer').remove();
  return $clone.text().replace(/\s+/g, ' ').trim();
}

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOPWORDS.has(word)),
  );
}

function checkAnswerFirst($: CheerioAPI): AuditCheck {
  const h1 = $('h1').first().text().trim() || $('title').first().text().trim();
  const bodyText = getBodyText($);
  const words = bodyText.split(/\s+/).filter(Boolean);
  const opening = words.slice(0, OPENING_WORD_COUNT).join(' ');

  if (!h1) {
    return {
      label: 'Answer-First Structure',
      status: 'warning',
      message: 'No H1 or title was found, so opening content could not be compared against a topic.',
      group: GROUP,
    };
  }

  if (words.length === 0 || opening.split(/\s+/).filter(Boolean).length < MIN_OPENING_WORDS) {
    return {
      label: 'Answer-First Structure',
      status: 'warning',
      message: `The page has very little opening text (fewer than ${MIN_OPENING_WORDS} words) to evaluate.`,
      group: GROUP,
    };
  }

  const topicWords = significantWords(h1);
  const openingWords = significantWords(words.slice(0, 60).join(' '));
  const overlap = Array.from(topicWords).filter((word) => openingWords.has(word));

  if (topicWords.size > 0 && overlap.length === 0) {
    return {
      label: 'Answer-First Structure',
      status: 'warning',
      message: `The first ~60 words don't share key terms with the page's H1/title ("${h1}"). AI engines often extract opening sentences for citations, so leading with a direct answer to what the title promises improves citation odds.`,
      group: GROUP,
    };
  }

  return {
    label: 'Answer-First Structure',
    status: 'pass',
    message: 'The opening content shares key terms with the page\'s H1/title, suggesting it answers the topic directly rather than starting with fluff.',
    group: GROUP,
  };
}

function isQuestionLike(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith('?')) return true;
  const firstWord = trimmed.toLowerCase().split(/\s+/)[0] ?? '';
  return QUESTION_WORDS.includes(firstWord);
}

function isVagueLabel(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (VAGUE_HEADINGS.has(normalized)) return true;
  return normalized.split(/\s+/).length === 1 && normalized.length > 0;
}

function checkHeadingsAsQuestions($: CheerioAPI): AuditCheck {
  const headings: string[] = [];
  $('h2, h3').each((_, el) => {
    const text = $(el).text().trim();
    if (text) headings.push(text);
  });

  if (headings.length === 0) {
    return {
      label: 'Heading-as-Question',
      status: 'warning',
      message: 'No H2/H3 headings were found to evaluate.',
      group: GROUP,
    };
  }

  const vague = headings.filter((h) => !isQuestionLike(h) && isVagueLabel(h));

  if (vague.length === 0) {
    return {
      label: 'Heading-as-Question',
      status: 'pass',
      message: `None of the ${headings.length} H2/H3 heading(s) read like generic labels.`,
      group: GROUP,
    };
  }

  const ratio = vague.length / headings.length;
  return {
    label: 'Heading-as-Question',
    status: ratio > 0.3 ? 'fail' : 'warning',
    message: `${vague.length} of ${headings.length} H2/H3 heading(s) read like vague labels rather than natural-language questions/topics (e.g. ${vague.slice(0, 3).map((h) => `"${h}"`).join(', ')}). Headings phrased like the questions users actually ask are more likely to be surfaced in AI-generated answers.`,
    group: GROUP,
  };
}

function checkDataDensity($: CheerioAPI): AuditCheck {
  const bodyText = getBodyText($);
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  if (wordCount < MIN_WORDS_FOR_DATA_CHECK) {
    return {
      label: 'Data & Statistic Density',
      status: 'warning',
      message: `The page has too little text (${wordCount} words) to meaningfully evaluate statistic density.`,
      group: GROUP,
    };
  }

  const numericMatches = bodyText.match(/\b\d[\d,.]*%?\b/g) ?? [];

  if (numericMatches.length < 3) {
    return {
      label: 'Data & Statistic Density',
      status: 'fail',
      message: `Only ${numericMatches.length} number/date/statistic-like token(s) were found in the body text. Research on generative engine optimization found that adding specific statistics, figures, and citations improves AI visibility far more than keyword density.`,
      group: GROUP,
    };
  }

  if (numericMatches.length < 5) {
    return {
      label: 'Data & Statistic Density',
      status: 'warning',
      message: `${numericMatches.length} number/date/statistic-like tokens were found. Consider adding more concrete figures to strengthen AI citability.`,
      group: GROUP,
    };
  }

  return {
    label: 'Data & Statistic Density',
    status: 'pass',
    message: `${numericMatches.length} number/date/statistic-like tokens were found in the body text.`,
    group: GROUP,
  };
}

export function parseGeoContent($: CheerioAPI): AuditCheck[] {
  return [checkAnswerFirst($), checkHeadingsAsQuestions($), checkDataDensity($)];
}
