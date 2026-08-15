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
  webServer: [
    {
      command:
        'pnpm --filter @tryopenbot/control-service exec node --conditions=development --import tsx --input-type=module -e \'import { serve } from "@hono/node-server"; import { app } from "./src/index.ts"; serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 4100 });\'',
      env: {
        ...process.env,
        TILDE_ORG_ID: "e2e-org",
        TILDE_TEAM_ID: "e2e-team",
      },
      url: "http://127.0.0.1:4100/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @tryopenbot/web dev",
      url: "http://127.0.0.1:4173/",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
