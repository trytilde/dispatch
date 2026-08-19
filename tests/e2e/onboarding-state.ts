import type { Page } from "@playwright/test";

// Onboarding is persisted client-runtime state (ADR-0017), so a test that wants the
// workspace seeds it rather than clicking through first-run. The key and shape are the
// runtime's; keeping them in one helper means a contract change breaks one file.
const storageKey = "openbot.onboarding";

const completed = {
  completed: true,
  result: { name: "E2E Bot", color: "#2a92fe", shape: "blob", tools: [] },
};

/** Marks onboarding complete before any page script runs. */
export async function seedCompletedOnboarding(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [storageKey, JSON.stringify(completed)] as const,
  );
}
