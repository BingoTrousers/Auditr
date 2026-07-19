/** Fills the results column before a scan has run, so the two-column desktop layout doesn't read as broken. */
export default function ResultsPlaceholder() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-line px-8 py-16 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent-tint">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      </div>
      <p className="mb-1.5 font-sans text-[15px] font-bold text-ink-1">Your results will show up here</p>
      <p className="max-w-[320px] font-sans text-sm leading-relaxed text-ink-3">
        Run an audit to see your score, a full breakdown of checks, and exactly where you can gain points.
      </p>
    </div>
  );
}
