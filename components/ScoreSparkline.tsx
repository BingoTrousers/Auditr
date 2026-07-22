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

  const points = scores
    .map((score, index) => {
      const x = PADDING + index * stepX;
      const clamped = Math.max(0, Math.min(100, score));
      const y = PADDING + usableHeight * (1 - clamped / 100);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" className={`shrink-0 ${band.text}`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
