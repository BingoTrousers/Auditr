import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { fetchPage } from '@/lib/audit/fetchPage';
import { validateUrl } from '@/lib/audit/validateUrl';
import { parseMeta } from '@/lib/audit/parseMeta';
import { parseHeadings } from '@/lib/audit/parseHeadings';
import { parseImages } from '@/lib/audit/parseImages';
import { parseLinks } from '@/lib/audit/parseLinks';
import { scoreResults } from '@/lib/audit/scoreResults';
import { checkRateLimit } from '@/lib/audit/rateLimiter';

// cheerio and the dns module used for SSRF protection require Node APIs
// that aren't available in the Edge runtime.
export const runtime = 'nodejs';

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests, please try again in a minute.' },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }

    const url = (body as { url?: unknown })?.url;
    if (typeof url !== 'string' || url.trim() === '') {
      return NextResponse.json({ error: 'A "url" string field is required.' }, { status: 400 });
    }

    const validation = await validateUrl(url);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    const fetchResult = await fetchPage(url);
    if (!fetchResult.ok) {
      return NextResponse.json({ error: fetchResult.error }, { status: fetchResult.status });
    }

    const $ = cheerio.load(fetchResult.html);

    const checks = [
      ...parseMeta($),
      ...parseHeadings($),
      ...parseImages($),
      ...parseLinks($, fetchResult.finalUrl),
    ];

    const result = scoreResults(fetchResult.finalUrl, checks);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'An unexpected error occurred while running the audit.' },
      { status: 500 },
    );
  }
}
