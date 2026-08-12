import { describe, expect, it } from "vitest";
import { parseInvocation } from "./openbot.js";

describe("OpenBot CLI", () => {
  it("parses commands after pnpm's separator", () => expect(parseInvocation(["--", "agent", "create"])).toEqual({ command: "agent", rest: ["create"] }));
  it("defaults to help", () => expect(parseInvocation([])).toEqual({ command: "help", rest: [] }));
});
