/** @type {import('tailwindcss').Config} */
export default {
  // Preflight (Tailwind's global reset) stays OFF so Tailwind never clobbers the bespoke
  // token/glass/contrast system (src/styles/*.css + contrast.test.ts WCAG checks). New shadcn/Base UI
  // components opt into their own base via utility classes; existing UI renders unchanged.
  corePlugins: { preflight: false },
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
