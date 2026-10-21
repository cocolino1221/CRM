/** @type {import('tailwindcss').Config} */
module.exports = {
  // Without this, Tailwind defaults to 'media': every dark: class in the app
  // followed the operating system and the in-app theme switch could not move
  // them. The switch sets CSS variables, which only one file reads, while
  // thirty files are written with dark: utilities — the two never met.
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};