/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070811',
          900: '#0d0f21',
          850: '#12152c',
          800: '#181c3a',
          750: '#1e2348',
          700: '#272d5c',
        },
        purple: {
          brand: '#7c3aed',
          dark: '#6d28d9',
          light: '#8b5cf6',
          glow: 'rgba(124, 58, 237, 0.25)',
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        'xl': '14px',
        '2xl': '18px',
      }
    },
  },
  plugins: [],
};
