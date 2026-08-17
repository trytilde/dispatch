import { describe, expect, it, vi } from "vite-plus/test";
import { discoverControlService, normalizeControlOrigin } from "./discovery";

describe("mobile control service discovery", () => {
  it("normalizes a host and discovers public installation metadata", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/healthz")) return Response.json({ ok: true, service: "openbot" });
      return Response.json({
        authorization_endpoint: "https://identity.test/authorize",
        token_endpoint: "https://identity.test/token",
        client_id: "client-one",
        scope: "openid openbot:control",
      });
    });

    await expect(discoverControlService("openbot.example/", request)).resolves.toEqual({
      control_origin: "https://openbot.example",
      authorization_endpoint: "https://identity.test/authorize",
      token_endpoint: "https://identity.test/token",
      client_id: "client-one",
      scope: "openid openbot:control",
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects paths, insecure remote origins, and non-OpenBot services", async () => {
    expect(() => normalizeControlOrigin("https://openbot.example/path")).toThrow("without a path");
    expect(() => normalizeControlOrigin("http://openbot.example")).toThrow("must use HTTPS");
    const request = vi.fn(async () => Response.json({ ok: true, service: "something-else" }));
    await expect(discoverControlService("https://openbot.example", request)).rejects.toThrow();
  });
});
