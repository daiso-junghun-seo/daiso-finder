import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  webServer: [
    { command: 'npm run dev', port: 5173, reuseExistingServer: true },
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: 'dev',
      testMatch: /(states|interactive)\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5173' },
    },
    {
      name: 'preview',
      testMatch: /live-pipeline\.spec\.ts$/,
      use: { baseURL: 'http://localhost:4173', serviceWorkers: 'block' },
    },
  ],
});
