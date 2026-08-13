import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { LocalEncryptedEnvProvider, VercelProjectEnvProvider } from "./env.js";

describe("LocalEncryptedEnvProvider", () => {
  const previousCode = process.env.OPENBOT_SETUP_CODE;
  const context = { requestId: "test" };

  afterEach(() => {
    if (previousCode === undefined) delete process.env.OPENBOT_SETUP_CODE;
    else process.env.OPENBOT_SETUP_CODE = previousCode;
    delete process.env.OPENBOT_TEST_SECRET;
    vi.unstubAllGlobals();
  });

  it("persists local control-plane values encrypted at rest", async () => {
    process.env.OPENBOT_SETUP_CODE = "a-long-local-environment-setup-code";
    const directory = await mkdtemp(join(tmpdir(), "openbot-env-"));
    const path = join(directory, "environment.json");
    const provider = new LocalEncryptedEnvProvider(path);
    await provider.set("OPENBOT_TEST_SECRET", "not-plaintext", { sensitive: true }, context);

    expect(await provider.get("OPENBOT_TEST_SECRET", context)).toBe("not-plaintext");
    expect(await readFile(path, "utf8")).not.toContain("not-plaintext");
    expect((await provider.list("OPENBOT_TEST_", context)).map((entry) => entry.name)).toEqual([
      "OPENBOT_TEST_SECRET",
    ]);
  });

  it("fails closed when the setup code changes", async () => {
    process.env.OPENBOT_SETUP_CODE = "the-first-long-enough-setup-code";
    const directory = await mkdtemp(join(tmpdir(), "openbot-env-"));
    const path = join(directory, "environment.json");
    await new LocalEncryptedEnvProvider(path).set(
      "OPENBOT_TEST_SECRET",
      "secret",
      { sensitive: true },
      context,
    );
    process.env.OPENBOT_SETUP_CODE = "a-different-long-enough-setup-code";
    await expect(
      new LocalEncryptedEnvProvider(path).get("OPENBOT_TEST_SECRET", context),
    ).rejects.toMatchObject({ code: "invalid_configuration" });
  });
});

describe("VercelProjectEnvProvider", () => {
  it("reads decrypted project values and upserts encrypted values", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("teamId")).toBe("team-test");
      if (init?.method === "POST") {
        expect(url.searchParams.get("upsert")).toBe("true");
        expect(JSON.parse(String(init.body))).toMatchObject({
          key: "OPENBOT_TEST_SECRET",
          type: "encrypted",
          target: ["production"],
        });
        return Response.json({ created: true });
      }
      if (url.pathname.endsWith("/env/env-one")) {
        return Response.json({
          id: "env-one",
          key: "OPENBOT_TEST_SECRET",
          value: "secret",
          type: "encrypted",
          decrypted: true,
        });
      }
      expect(url.searchParams.get("decrypt")).toBeNull();
      return Response.json({
        envs: [{ id: "env-one", key: "OPENBOT_TEST_SECRET", value: "secret", type: "encrypted" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new VercelProjectEnvProvider({
      token: "vercel-token",
      projectId: "project-test",
      teamId: "team-test",
    });
    await expect(provider.get("OPENBOT_TEST_SECRET", { requestId: "test" })).resolves.toBe(
      "secret",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await provider.set(
      "OPENBOT_TEST_SECRET",
      "updated",
      { sensitive: true },
      { requestId: "test" },
    );
  });
});
