import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron", () => ({
  safeStorage: {
    decryptString: (value: Buffer) => value.toString("utf8"),
    encryptString: (value: string) => Buffer.from(value),
    getSelectedStorageBackend: () => "gnome_libsecret",
    isEncryptionAvailable: () => true,
  },
  shell: { openExternal: vi.fn() },
}));

import { DesktopAuth } from "./auth.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("DesktopAuth", () => {
  it("asks the control service to verify stored credentials", async () => {
    const path = await storedCredentials();
    const request = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toMatch(/^Bearer /);
      return Response.json({
        authenticated: true,
        user: { subject: "user-1", email: "owner@example.com" },
      });
    });
    vi.stubGlobal("fetch", request);
    const auth = new DesktopAuth(path);
    await auth.load();

    await expect(auth.status("https://openbot.example")).resolves.toEqual({
      authenticated: true,
      user: { subject: "user-1", email: "owner@example.com" },
    });
    expect(request).toHaveBeenCalledWith(
      new URL("https://openbot.example/auth/session"),
      expect.any(Object),
    );
  });

  it("removes stored credentials rejected by the control service", async () => {
    const path = await storedCredentials();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    const auth = new DesktopAuth(path);
    await auth.load();

    await expect(auth.status("https://openbot.example")).resolves.toBeNull();
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function storedCredentials(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "openbot-desktop-auth-"));
  cleanups.push(async () => rm(root, { recursive: true, force: true }));
  const path = join(root, "auth.enc");
  const payload = Buffer.from(
    JSON.stringify({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  await writeFile(
    path,
    JSON.stringify({ accessToken: `header.${payload}.signature`, refreshToken: "refresh" }),
  );
  return path;
}
