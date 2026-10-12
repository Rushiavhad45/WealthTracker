/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        groww: {
          green: '#00D09C',
          dark: '#1A1A2E',
          darker: '#0F0F1A',
          card: '#FFFFFF',
          muted: '#6B7280',
          border: '#E5E7EB',
          gain: '#00C853',
          loss: '#FF5252',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(0, 0, 0, 0.08)',
        hover: '0 4px 20px rgba(0, 208, 156, 0.15)',
      },
    },
  },
  plugins: [],
};
