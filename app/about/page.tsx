import Link from 'next/link';
import type { Metadata } from 'next';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: 'About — Auditr',
  description: 'What Auditr checks, how it works, and how your scan history is stored.',
};

export default function About() {
  return (
    <main className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-[640px] items-center justify-between px-6 pb-10 pt-7 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
          </div>
          <span className="font-sans text-[17px] font-extrabold tracking-tight text-ink-1">Auditr</span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="mx-auto max-w-[640px] px-6 pb-24 sm:px-8">
        <h1 className="mb-3 font-sans text-[28px] font-extrabold tracking-tight text-ink-1">About Auditr</h1>
        <p className="mb-8 font-sans text-base leading-relaxed text-ink-2">
          Auditr is a quick, one-off SEO &amp; GEO (AI-visibility) checker. Paste in a URL and it fetches the page,
          runs a fixed set of on-page and AI-crawler checks, and gives you a score along with exactly which fixes
          would earn back the most points.
        </p>

        <h2 className="mb-2 font-sans text-lg font-bold text-ink-1">How it works</h2>
        <p className="mb-8 font-sans text-[15px] leading-relaxed text-ink-2">
          Every audit is a self-contained request: Auditr fetches the page server-side, parses it, scores it, and
          returns the result. There&apos;s no account, no database, and nothing about the page or the URL is
          retained on our end once the response is sent back to your browser.
        </p>

        <h2 className="mb-2 font-sans text-lg font-bold text-ink-1">Your scan history</h2>
        <p className="mb-8 font-sans text-[15px] leading-relaxed text-ink-2">
          The scan history you see on the home page is saved to your own browser&apos;s local storage — it never
          reaches our servers. Clearing it, or clearing your browser data, removes it for good.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-sans text-sm font-bold text-accent hover:text-accent-hover"
        >
          ← Back to Auditr
        </Link>
      </div>
    </main>
  );
}
