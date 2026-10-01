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
        'varoom-red': 'var(--color-primary)',
        'varoom-red-hover': 'var(--color-primary-hover)',
        'varoom-dark': 'var(--color-text)',
        'varoom-ink': 'var(--color-text)',
        'varoom-paper': 'var(--color-bg)',
        'varoom-sand': 'var(--color-surface-muted)',
        'varoom-subtle': 'var(--color-text-muted)',
        'varoom-surface': 'var(--color-surface)',
        'varoom-border': 'var(--color-border)',
      },
      fontFamily: {
        serif: ['var(--font-heading)'],
        sans: ['var(--font-body)'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
    },
  },
  plugins: [],
};
