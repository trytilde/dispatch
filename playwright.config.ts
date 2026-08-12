import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "OPENBOT_SETUP_CODE=openbot-e2e-setup-code-with-32-bytes OPENBOT_SANDBOX_PROVIDER=vercel-sandbox OPENBOT_NO_DESKTOP=1 DATABASE_URL=file:./.data/openbot-e2e.db pnpm dev",
    url: "http://127.0.0.1:4173/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
