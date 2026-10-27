/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind 4 moved the PostCSS plugin out of the `tailwindcss` package
    // into `@tailwindcss/postcss`. Keeping the old key silently produces a
    // stylesheet with no utilities in it.
    '@tailwindcss/postcss': {},
  },
};

export default config;
