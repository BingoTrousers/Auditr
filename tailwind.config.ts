import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        line: 'var(--border)',
        lineStrong: 'var(--border-strong)',
        ink: {
          1: 'var(--text-1)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          tint: 'var(--accent-tint)',
          tintBorder: 'var(--accent-tint-border)',
        },
        pass: {
          text: 'var(--pass-text)',
          bg: 'var(--pass-bg)',
          border: 'var(--pass-border)',
          dot: 'var(--pass-dot)',
        },
        warn: {
          text: 'var(--warn-text)',
          bg: 'var(--warn-bg)',
          border: 'var(--warn-border)',
          dot: 'var(--warn-dot)',
        },
        fail: {
          text: 'var(--fail-text)',
          bg: 'var(--fail-bg)',
          border: 'var(--fail-border)',
          dot: 'var(--fail-dot)',
        },
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'monospace'],
      },
      boxShadow: {
        card: 'var(--shadow-sm)',
        cardHover: 'var(--shadow-md)',
      },
    },
  },
  plugins: [],
};

export default config;
