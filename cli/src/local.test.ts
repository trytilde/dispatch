import { describe, expect, it } from "vitest";
import { parsePort } from "./local.js";

describe("local OpenBot server", () => {
  it("uses the default control port", () => expect(parsePort(undefined)).toBe(4100));
  it("accepts a valid configured port", () => expect(parsePort("5123")).toBe(5123));
  it("rejects invalid ports", () => {
    expect(() => parsePort("0")).toThrow("OPENBOT_PORT must be a valid TCP port");
    expect(() => parsePort("not-a-port")).toThrow("OPENBOT_PORT must be a valid TCP port");
  });
});
