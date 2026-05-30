import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ibm: {
          50: '#e6eef9',
          100: '#cfdcf2',
          200: '#a6bfe4',
          300: '#7da2d6',
          400: '#5485c8',
          500: '#1a4a8b',
          600: '#143a6f',
          700: '#0e2a52',
          800: '#091b35',
          900: '#040d18',
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
