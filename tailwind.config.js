import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      typography: {
        DEFAULT: {
          css: {
            color: '#d4d4d8',
            a: { color: '#60a5fa' },
            h1: { color: '#f4f4f5' },
            h2: { color: '#e4e4e7' },
            h3: { color: '#d4d4d8' },
            strong: { color: '#f4f4f5' },
            code: { color: '#f4f4f5' },
            blockquote: { color: '#a1a1aa' },
          },
        },
      },
    },
  },
  plugins: [
    typography,
  ],
}