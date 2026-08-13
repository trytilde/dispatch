import { expect, test } from "@playwright/test";

test("loads the bare workspace without setup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What should OpenBot become?" })).toBeVisible();
  await expect(page.getByText("Workspace preview")).toBeVisible();
  await expect(page.getByLabel("Setup code")).toHaveCount(0);

  await page.goto("/api/setup/unlock");
  await expect(page.getByRole("heading", { name: "What should OpenBot become?" })).toBeVisible();
});

test("keeps the server healthy and control namespace empty", async ({ request }) => {
  const health = await request.get("/healthz");
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toEqual({ ok: true, service: "openbot" });

  const rpc = await request.post("/rpc/openbot.control.v1.ControlService/Unknown");
  expect(rpc.status()).toBe(404);
});
