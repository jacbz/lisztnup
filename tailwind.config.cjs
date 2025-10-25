/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        'deep-space': '#121019',
        'dark-purple': '#231942',
        'light-nebula': '#E0D6FF',
        'neon-cyan': '#00F6FF',
        'neon-magenta': '#FF00FF',
        'neon-lime': '#ADFF2F',
      },
    },
  },
  plugins: [],
};

module.exports = config;
