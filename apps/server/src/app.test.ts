import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("bare OpenBot server", () => {
  it("reports healthy without setup", async () => {
    const response = await app.request("https://openbot.test/healthz");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: "openbot" });
  });

  it("federates the empty control namespace", async () => {
    const response = await app.request("https://openbot.test/rpc/openbot.control.v1.ControlService/Unknown", {
      method: "POST",
    });
    expect(response.status).toBe(404);
  });

  it("does not retain setup endpoints", async () => {
    const response = await app.request("https://openbot.test/api/setup/unlock", { method: "POST" });
    expect(response.status).toBe(404);
  });
});
