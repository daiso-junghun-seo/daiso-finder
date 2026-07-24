import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // `@/*` → ./src, mirroring the tsconfig `paths` so `@/…` imports resolve at build/test time too.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        lang: 'ko',
        name: 'DAISO Finder',
        short_name: 'DAISO Finder',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // test/e2e/** holds Playwright specs (npm run e2e), not Vitest specs — keep the two runners apart.
    // .claude/** is Claude Code tooling scratch (marketplace skill packages), not part of the product.
    exclude: [...configDefaults.exclude, 'test/e2e/**', '.claude/**'],
    // Vitest stubs all CSS imports to an empty string by default (including `?raw`), so
    // `import css from './x.css?raw'` specs would otherwise always see ''. Opt only the
    // `?raw` query back into real processing — plain CSS side-effect imports stay stubbed.
    css: { include: [/\.css\?raw$/] },
  },
});
