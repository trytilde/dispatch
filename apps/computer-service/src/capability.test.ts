import { expect, test } from "vitest";
import { validComputerCapability } from "./capability.js";

test("requires the exact computer bearer capability", () => {
  const token = "a".repeat(43);
  expect(validComputerCapability(`Bearer ${token}`, token)).toBe(true);
  expect(validComputerCapability(`Bearer ${"b".repeat(43)}`, token)).toBe(false);
  expect(validComputerCapability(null, token)).toBe(false);
});
