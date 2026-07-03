import type { CheerioAPI } from 'cheerio';
import type { AuditCheck } from './types';

const GROUP = 'access';

interface Signature {
  vendor: string;
  patterns: RegExp[];
}

// High-confidence, vendor-specific markers only, to avoid false-positiving
// on ordinary pages that happen to embed a captcha widget or CDN script.
const SIGNATURES: Signature[] = [
  {
    vendor: 'Cloudflare',
    patterns: [
      /cf-browser-verification/i,
      /jschl-answer/i,
      /cf_chl_opt/i,
      /checking your browser before accessing/i,
      /attention required! \| cloudflare/i,
      /<title>just a moment\.\.\.<\/title>/i,
    ],
  },
  {
    vendor: 'PerimeterX / HUMAN',
    patterns: [/perimeterx/i, /px-captcha/i, /_pxhd/i],
  },
  {
    vendor: 'DataDome',
    patterns: [/datadome/i, /dd_cookie_test/i],
  },
  {
    vendor: 'Imperva / Incapsula',
    patterns: [/incapsula/i, /_incap_ses/i, /request unsuccessful\. incapsula/i],
  },
  {
    vendor: 'Akamai Bot Manager',
    patterns: [/ak_bmsc/i, /akamai bot manager/i],
  },
  {
    vendor: 'a bot-protection service',
    patterns: [
      /please verify you are a human/i,
      /checking if the site connection is secure/i,
      /sorry, you have been blocked/i,
      /ddos protection by/i,
    ],
  },
];

/**
 * Detects when the fetched HTML looks like a WAF/bot-protection challenge
 * or block page rather than the site's real content. Runs on 200 OK
 * responses, since a blocked-at-fetch-time (403/503) case is already
 * surfaced separately by fetchPage's header-based WAF hint.
 */
export function detectBlocking($: CheerioAPI, html: string): AuditCheck[] {
  for (const signature of SIGNATURES) {
    if (signature.patterns.some((pattern) => pattern.test(html))) {
      return [
        {
          label: 'Bot/WAF Protection',
          status: 'warning',
          message: `This page looks like it may be a challenge or block page from ${signature.vendor} rather than the site's real content. The checks below may be inaccurate as a result.`,
          group: GROUP,
        },
      ];
    }
  }

  return [
    {
      label: 'Bot/WAF Protection',
      status: 'pass',
      message: 'No WAF/bot-protection challenge or block page was detected; the fetched HTML looks like real content.',
      group: GROUP,
    },
  ];
}
