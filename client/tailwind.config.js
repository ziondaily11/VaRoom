/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './legacy-pages/**/*.{js,jsx,ts,tsx,html}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        'varoom-red': '#bd2337',
        'varoom-dark': '#181513',
        'varoom-ink': '#201c19',
        'varoom-paper': '#f7f3ec',
        'varoom-sand': '#eae2d6',
        'varoom-subtle': '#877b70',
      },
      fontFamily: {
        serif: ['Georgia', 'serif'],
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
