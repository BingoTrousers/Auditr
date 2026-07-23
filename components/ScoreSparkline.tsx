import { getScoreBand } from './ScoreCard';

interface ScoreSparklineProps {
  /** Oldest → newest scores for this URL, including the currently displayed result. */
  scores: number[];
}

const WIDTH = 64;
const HEIGHT = 20;
const PADDING = 2;

/** Minimal inline trend line for a URL's recent scores. Renders nothing with fewer than 2 points. */
export default function ScoreSparkline({ scores }: ScoreSparklineProps) {
  if (scores.length < 2) return null;

  const band = getScoreBand(scores[scores.length - 1]);
  const usableHeight = HEIGHT - PADDING * 2;
  const stepX = (WIDTH - PADDING * 2) / (scores.length - 1);

  const clampedScores = scores.map((score) => Math.max(0, Math.min(100, score)));
  const min = Math.min(...clampedScores);
  const max = Math.max(...clampedScores);
  const range = max - min;

  const points = clampedScores
    .map((clamped, index) => {
      const x = PADDING + index * stepX;
      // Scale to the range of the scores shown, not the absolute 0-100 scale,
      // so a flat/near-flat run of high (or low) scores still sits centered
      // in the box next to the "Trend" label instead of hugging an edge.
      const ratio = range === 0 ? 0.5 : (clamped - min) / range;
      const y = PADDING + usableHeight * (1 - ratio);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const summary = `Score trend over last ${scores.length} scans: ${scores.join(' → ')}`;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={summary}
      className={`shrink-0 ${band.text}`}
    >
      <title>{summary}</title>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
