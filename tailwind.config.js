/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        academy: {
          background: 'var(--af-color-background)',
          surface: 'var(--af-color-surface)',
          subtle: 'var(--af-color-subtle)',
          primary: 'var(--af-color-primary)',
          'primary-strong': 'var(--af-color-primary-strong)',
          text: 'var(--af-color-text)',
          'text-muted': 'var(--af-color-text-muted)',
          'text-inverse': 'var(--af-color-text-inverse)',
          border: 'var(--af-color-border)',
          success: 'var(--af-color-success)',
          warning: 'var(--af-color-warning)',
          danger: 'var(--af-color-danger)',
        },
      },
      fontFamily: {
        academy: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'af-display-xl': ['3rem', { lineHeight: '3.5rem', fontWeight: '700' }],
        'af-h1': ['2.25rem', { lineHeight: '2.75rem', fontWeight: '700' }],
        'af-h2': ['1.875rem', { lineHeight: '2.375rem', fontWeight: '700' }],
        'af-h3': ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
        'af-h4': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'af-body-lg': ['1.125rem', { lineHeight: '1.75rem', fontWeight: '400' }],
        'af-body': ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }],
        'af-body-sm': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        'af-label': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '500' }],
        'af-label-sm': ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
      },
      spacing: {
        'af-1': 'var(--af-space-1)',
        'af-2': 'var(--af-space-2)',
        'af-3': 'var(--af-space-3)',
        'af-4': 'var(--af-space-4)',
        'af-6': 'var(--af-space-6)',
        'af-8': 'var(--af-space-8)',
        'af-12': 'var(--af-space-12)',
        'af-16': 'var(--af-space-16)',
        touch: '2.75rem',
      },
      borderRadius: {
        'af-sm': 'var(--af-radius-sm)',
        'af-md': 'var(--af-radius-md)',
        'af-lg': 'var(--af-radius-lg)',
        'af-full': 'var(--af-radius-full)',
      },
      boxShadow: {
        'af-card': 'var(--af-shadow-card)',
        'af-elevated': 'var(--af-shadow-elevated)',
        'af-focus': 'var(--af-shadow-focus)',
      },
    },
  },
  plugins: [],
};
