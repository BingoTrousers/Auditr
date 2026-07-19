'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    document.documentElement.classList.toggle('light', !next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="grid whitespace-nowrap rounded-lg border border-lineStrong bg-surface px-3.5 py-2 font-sans text-xs font-semibold text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <span className={`col-start-1 row-start-1 text-center ${dark ? '' : 'invisible'}`}>Light mode</span>
      <span className={`col-start-1 row-start-1 text-center ${dark ? 'invisible' : ''}`}>Dark mode</span>
    </button>
  );
}
