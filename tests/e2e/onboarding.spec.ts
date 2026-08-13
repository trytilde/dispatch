import { expect, test, type Page, type Route } from "@playwright/test";

const setupCode = "openbot-e2e-setup-code-with-32-bytes";

test("setup code gates the installation and prepares the Tilde deploy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Unlock OpenBot" })).toBeVisible();

  await page.getByLabel("Setup code").fill("this-code-is-definitely-wrong");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("did not match");

  // A reused development server can have a different generated setup code, so
  // this assertion is only completed by the isolated Playwright webServer.
  await page.getByLabel("Setup code").fill(setupCode);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Deploy the shared agent gateway." })).toBeVisible(
    { timeout: 15_000 },
  );
  const deploy = page.getByRole("link", { name: /Deploy with Tilde/ });
  await expect(deploy).toHaveAttribute("href", /state-path=tilde\.state\.yaml/);
  await expect(deploy).toHaveAttribute("href", /OPENBOT_CHATKIT_ENDPOINT_URL=/);
});

test("all six onboarding screens lead to the shared workspace", async ({ page }) => {
  await mockOnboarding(page);
  await page.goto("/");

  await expect(page.getByText("Meet OpenBot")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Its own computer")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Agent jobs")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Tools used")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Create your first agent")).toBeVisible();
  await page.getByLabel("Agent name").fill("Scout");
  await page.getByRole("button", { name: "Save agent" }).click();
  await expect(page.getByText("Ready for handoff")).toBeVisible();
  await page.getByRole("button", { name: "Open workspace" }).click();

  await expect(page.getByText("What should Scout work on?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start computer" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Terminal" }).click();
  await expect(page.getByText("no sandbox attached")).toBeVisible();
});

async function mockOnboarding(page: Page): Promise<void> {
  let step = "meet";
  const agent = {
    id: "agent-scout",
    displayName: "Scout",
    status: "enabled",
    endpointUrl: "https://openbot.test/api/tilde/chatkit",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  await page.route("**/rpc/openbot.v1.*/*", async (route: Route) => {
    const url = route.request().url();
    let body: Record<string, unknown>;
    if (url.endsWith("/GetStatus")) {
      body = status(step);
    } else if (url.endsWith("/SetOnboardingStep")) {
      const input = route.request().postDataJSON() as { step: string };
      step = input.step;
      body = status(step);
    } else if (url.endsWith("/UpdateAgent")) {
      body = agent;
    } else if (url.endsWith("/ListAgents")) {
      body = { agents: [agent] };
    } else if (url.endsWith("/ListSessions")) {
      body = { sessions: [] };
    } else {
      body = {};
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

function status(step: string): Record<string, unknown> {
  return {
    phase: step === "complete" ? "INSTALLATION_PHASE_READY" : "INSTALLATION_PHASE_ONBOARDING",
    onboardingStep: step,
    tildeConfigured: true,
    modelConfigured: true,
    publicOrigin: "http://127.0.0.1:4173",
    environmentProvider: "Local encrypted environment",
    environmentProviderConfigured: true,
  };
}
