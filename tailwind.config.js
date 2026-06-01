const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, 'apps/web/src/**/*.{html,ts}'),
  ],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        light: {
          ...require('daisyui/src/theming/themes')['light'],
          primary: '#4f46e5',
          'primary-content': '#ffffff',
          secondary: '#0ea5e9',
          accent: '#10b981',
          'base-100': '#ffffff',
          'base-200': '#f6f8fb',
          'base-300': '#e3e8f0',
        },
        dark: {
          ...require('daisyui/src/theming/themes')['dark'],
          primary: '#6366f1',
          'primary-content': '#ffffff',
          secondary: '#0ea5e9',
          accent: '#10b981',
          'base-100': '#131a2b',
          'base-200': '#0e1422',
          'base-300': '#232c44',
        },
      },
    ],
    darkTheme: 'dark',
    base: true,
    styled: true,
    utils: true,
    logs: false,
  },
};
