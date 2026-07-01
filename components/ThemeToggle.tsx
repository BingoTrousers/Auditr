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
      className="whitespace-nowrap rounded-lg border border-lineStrong bg-surface px-3.5 py-2 font-sans text-xs font-semibold text-ink-1"
    >
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
