import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  codingAgentAuditConfigPath,
  installCodingAgentAuditHooks,
  runCodingAgentAuditHook,
  writeCodingAgentAuditInstallation,
} from "./coding-agent-audit";

describe("coding-agent audit integration", () => {
  it.each(["claude", "cursor"] as const)("installs and deduplicates %s hooks", async (cli) => {
    const homeDir = await mkdtemp(join(tmpdir(), `tilde-audit-${cli}-`));
    const first = await installCodingAgentAuditHooks({ cli, homeDir, mcpServers: [] });
    const second = await installCodingAgentAuditHooks({ cli, homeDir, mcpServers: [] });
    expect(second).toBe(first);
    const contents = await readFile(first!, "utf8");
    expect(contents.match(new RegExp(`openbot plugin audit --cli ${cli}`, "g"))?.length).toBe(
      cli === "claude" ? 7 : 7,
    );
  });

  it("records a Claude prompt using stored non-secret routing config", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "tilde-audit-record-"));
    await writeCodingAgentAuditInstallation(
      "claude",
      { baseUrl: "https://api.test", teamId: "team-1", agentId: "agent-1" },
      homeDir,
    );
    expect(JSON.parse(await readFile(codingAgentAuditConfigPath(homeDir), "utf8"))).toMatchObject({
      installations: { claude: { teamId: "team-1", agentId: "agent-1" } },
    });

    const requests: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = input instanceof Request ? input.url : input.toString();
      requests.push(url);
      if (url.endsWith("/chatkit/sessions")) {
        return Response.json({
          session: { id: "session-1" },
          participants: [
            { participant_type: "human", inbox: { id: "channel" }, instance: { id: "human" } },
            { participant_type: "agent", inbox: { id: "agent-1" }, instance: { id: "agent" } },
          ],
        });
      }
      return Response.json({ id: "message-1" });
    }) as typeof fetch;
    try {
      await runCodingAgentAuditHook({
        cli: "claude",
        homeDir,
        apiKey: "test-key",
        payload: {
          session_id: "claude-session",
          hook_event_name: "UserPromptSubmit",
          prompt: "Audit this change",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(requests).toEqual([
      "https://api.test/api/v1/team/team-1/chatkit/sessions",
      "https://api.test/api/v1/team/team-1/chatkit/session/session-1/message",
    ]);
  });
});
