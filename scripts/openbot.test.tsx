import { describe, expect, it } from "vite-plus/test";
import { render } from "ink-testing-library";
import { CommandMenu, Help, ProviderTable } from "./openbot-ui.js";
import { parseInvocation, wantsJson } from "./openbot.js";

describe("OpenBot CLI", () => {
  it("parses commands after pnpm's separator", () =>
    expect(parseInvocation(["--", "providers", "list"])).toEqual({
      command: "providers",
      rest: ["list"],
    }));
  it("defaults to help", () => expect(parseInvocation([])).toEqual({ command: "help", rest: [] }));
  it("detects machine-readable output", () => expect(wantsJson(["list", "--json"])).toBe(true));
  it("renders discoverable command help", () => {
    const { lastFrame } = render(<Help />);
    expect(lastFrame()).toContain("Fork it. Configure it. Run it.");
    expect(lastFrame()).toContain("sync");
    expect(lastFrame()).toContain("--json");
  });
  it("renders provider health without raw JSON", () => {
    const { lastFrame } = render(
      <ProviderTable
        providers={[
          { id: "openai", kind: "ai", displayName: "OpenAI", healthy: true, configured: true },
        ]}
      />,
    );
    expect(lastFrame()).toContain("OpenAI");
    expect(lastFrame()).toContain("ready");
  });
  it("supports keyboard navigation in the launcher", () => {
    let selected = "";
    const { stdin } = render(
      <CommandMenu
        onSelect={(command) => {
          selected = command;
        }}
      />,
    );
    stdin.write("j");
    stdin.write("\r");
    expect(selected).toBe("setup");
  });
});
