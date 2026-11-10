import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  // CI keeps a trace only when a test fails; the HTML report is the artifact to open.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure' },
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
      testMatch: /(states|interactive|a11y|navigation)\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5173', locale: 'ko-KR' },
    },
    {
      name: 'preview',
      testMatch: /live-pipeline\.spec\.ts$/,
      use: { baseURL: 'http://localhost:4173', serviceWorkers: 'block', locale: 'ko-KR' },
    },
  ],
});
