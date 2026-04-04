/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 20px 45px -24px rgba(15, 23, 42, 0.35)',
      },
      backgroundImage: {
        'app-pattern':
          'radial-gradient(circle at 5% 0%, rgba(20, 184, 166, 0.18), transparent 32%), radial-gradient(circle at 100% 100%, rgba(234, 88, 12, 0.15), transparent 30%), linear-gradient(180deg, #f5f7fb 0%, #eef2ff 100%)',
      },
    },
  },
  plugins: [],
}

