import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { parseInvocation } from "./commands/index.js";
import { CommandMenu, Help } from "./ui.js";

describe("OpenBot CLI", () => {
  it("parses commands after pnpm's separator", () => expect(parseInvocation(["--", "deploy", "--dry-run"])).toEqual({ command: "deploy", rest: ["--dry-run"] }));
  it("defaults to help", () => expect(parseInvocation([])).toEqual({ command: "help", rest: [] }));
  it("supports the help alias", () => expect(parseInvocation(["-h"])).toEqual({ command: "help", rest: [] }));
  it("renders discoverable command help", () => {
    const { lastFrame } = render(<Help />);
    expect(lastFrame()).toContain("Fork it. Configure it. Run it.");
    expect(lastFrame()).toContain("init");
    expect(lastFrame()).toContain("deploy --yes");
    expect(lastFrame()).not.toContain("Run the built OpenBot app");
  });
  it("supports keyboard navigation in the launcher", () => {
    let selected = "";
    const { stdin } = render(<CommandMenu onSelect={(command) => { selected = command; }} />);
    stdin.write("j");
    stdin.write("\r");
    expect(selected).toBe("dev");
  });
});
