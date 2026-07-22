'use client';

import { useEffect, useState } from 'react';
import { prefersReducedMotion } from './prefersReducedMotion';

const ANIMATION_MS = 600;
/** Cubic ease-out: fast start, gentle settle — matches ScoreCard's overall-score animation. */
const ease = (t: number) => 1 - (1 - t) ** 3;

interface GroupScoreBarProps {
  score: number;
  weight: number;
  barClassName: string;
}

/** Per-group fill/count-up, mirroring ScoreCard's overall-score animation at the same duration/easing. */
export default function GroupScoreBar({ score, weight, barClassName }: GroupScoreBarProps) {
  const targetWidth = weight > 0 ? Math.round((score / weight) * 100) : 0;

  const [width, setWidth] = useState(() => (prefersReducedMotion() ? targetWidth : 0));
  const [displayScore, setDisplayScore] = useState(() => (prefersReducedMotion() ? score : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setWidth(targetWidth);
      setDisplayScore(score);
      return;
    }

    let frame: number;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / ANIMATION_MS);
      const eased = ease(progress);
      setWidth(targetWidth * eased);
      setDisplayScore(Math.round(score * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only, see ScoreCard
  }, []);

  return (
    <span className="flex items-center gap-2 pl-6">
      <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <span className={`block h-full rounded-full ${barClassName}`} style={{ width: `${width}%` }} />
      </span>
      <span className="font-mono text-[11px] font-medium text-ink-3">
        {displayScore}/{weight}
      </span>
    </span>
  );
}
