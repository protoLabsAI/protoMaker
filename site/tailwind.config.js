/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      },
      colors: {
        surface: {
          0: '#09090b',
          1: '#111113',
          2: '#18181b',
          3: '#222225',
        },
        accent: {
          DEFAULT: '#a78bfa',
          dim: '#7c5cbf',
        },
        muted: '#71717a',
      },
    },
  },
  plugins: [],
};
