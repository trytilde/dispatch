import { expect, test } from "vitest";
import { validComputerServiceApiKey } from "./capability.js";

test("requires the exact computer-service bearer API key", () => {
  const token = "a".repeat(43);
  expect(validComputerServiceApiKey(`Bearer ${token}`, token)).toBe(true);
  expect(validComputerServiceApiKey(`Bearer ${"b".repeat(43)}`, token)).toBe(false);
  expect(validComputerServiceApiKey(null, token)).toBe(false);
});
