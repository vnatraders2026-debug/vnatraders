/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F7F7F5',
        surface: '#FFFFFF',
        border: '#E2E2DE',
        text: {
          DEFAULT: '#1C1C1A',
          muted: '#6B6B66',
        },
        accent: {
          DEFAULT: '#C2410C',
          hover: '#9A3412',
          light: '#FFEDD5',
        },
        success: {
          DEFAULT: '#15803D',
          light: '#DCFCE7',
        },
        warning: {
          DEFAULT: '#B45309',
          light: '#FEF3C7',
        },
        danger: {
          DEFAULT: '#B91C1C',
          light: '#FEE2E2',
        },
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '6px',
        lg: '6px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
}
