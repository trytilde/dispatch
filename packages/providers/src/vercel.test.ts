import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { VercelDeploymentProvider } from "./vercel.js";

afterEach(() => vi.unstubAllGlobals());

describe("VercelDeploymentProvider", () => {
  it("maps a commit deployment to ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        expect(String(input)).toContain("meta-githubCommitSha=abc123");
        return Response.json({
          deployments: [{ uid: "dep-one", url: "openbot.test", readyState: "READY" }],
        });
      }),
    );
    await expect(
      new VercelDeploymentProvider({ token: "token", projectId: "project" }).deploymentForCommit(
        "abc123",
        { requestId: "test" },
      ),
    ).resolves.toMatchObject({
      id: "dep-one",
      status: "ready",
      url: new URL("https://openbot.test"),
    });
  });
});
