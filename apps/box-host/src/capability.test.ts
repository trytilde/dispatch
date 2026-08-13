import { expect, test } from "vite-plus/test";
import { validCapability } from "./capability.js";

test("requires an exact bearer capability", () => {
  const token = "a".repeat(43);
  expect(validCapability(`Bearer ${token}`, token)).toBe(true);
  expect(validCapability(`Bearer ${"b".repeat(43)}`, token)).toBe(false);
  expect(validCapability(null, token)).toBe(false);
});
