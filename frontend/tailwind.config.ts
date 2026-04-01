import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:   '#f0fdf4',
          100:  '#dcfce7',
          200:  '#bbf7d0',
          300:  '#86efac',
          400:  '#4ade80',
          500:  '#22c55e',
          600:  '#16a34a',
          700:  '#15803d',
          800:  '#166534',
          900:  '#14532d',
          950:  '#052e16',
        },
        dark: {
          900:  '#0a0a0a',
          800:  '#111111',
          750:  '#161616',
          700:  '#1a1a1a',
          600:  '#242424',
          500:  '#2e2e2e',
          400:  '#3a3a3a',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
