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
    command: "pnpm dev",
    env: {
      ...process.env,
      NO_DESKTOP: "1",
      AGENT_HELLO_WORLD_API_KEY: "e2e-agent-api-key",
      AGENT_HELLO_WORLD_WEBHOOK_SIGNING_KEY: "e2e-webhook-signing-key",
      AI_GATEWAY_API_KEY: "e2e-ai-gateway-api-key",
      TILDE_ORG_ID: "e2e-org",
      TILDE_TEAM_ID: "e2e-team",
    },
    url: "http://127.0.0.1:4173/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
