import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { CommandMenu, Help } from "./openbot-ui.js";
import { parseInvocation } from "./openbot.js";

describe("OpenBot CLI", () => {
  it("parses commands after pnpm's separator", () => expect(parseInvocation(["--", "deploy", "--dry-run"])).toEqual({ command: "deploy", rest: ["--dry-run"] }));
  it("defaults to help", () => expect(parseInvocation([])).toEqual({ command: "help", rest: [] }));
  it("renders discoverable command help", () => {
    const { lastFrame } = render(<Help />);
    expect(lastFrame()).toContain("Fork it. Configure it. Run it.");
    expect(lastFrame()).toContain("deploy --yes");
  });
  it("supports keyboard navigation in the launcher", () => {
    let selected = "";
    const { stdin } = render(<CommandMenu onSelect={(command) => { selected = command; }} />);
    stdin.write("j");
    stdin.write("\r");
    expect(selected).toBe("check");
  });
});
