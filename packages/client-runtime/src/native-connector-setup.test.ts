import { describe, expect, it, vi } from "vite-plus/test";
import { createNativeConnectorSetupTransport } from "./native-connector-setup.js";

describe("native personal setup continuation", () => {
  it("polls the selected personal resource without recreating it in the team", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        id: "account",
        status: "pending",
        tool_group_source_type_id: "gmail",
        credential_source_type_id: "oauth",
      })
      .mockResolvedValueOnce({
        next_action: { type: "redirect", url: "https://trusted.test/oauth" },
      })
      .mockResolvedValueOnce({ id: "account", status: "active" });
    const transport = createNativeConnectorSetupTransport(request, () => "team");
    const response = await transport.start(
      {
        providerId: "gmail",
        resourceId: "account",
        personalUserId: "user",
        authorizationUrl: "https://oauth.test/start",
        returnUrl: "https://app.test/connected",
      },
      new AbortController().signal,
    );
    expect(response).toMatchObject({
      setup_id: "personal:account",
      next_action: { type: "redirect" },
    });
    expect(
      await transport.resume(
        "personal:account",
        {},
        "https://app.test/connected",
        new AbortController().signal,
      ),
    ).toMatchObject({ next_action: { type: "complete" } });
    expect(request).toHaveBeenCalledWith(
      "/api/tilde/user-tools/provider-setup/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          personal: true,
          domain: "mcp",
          provider_id: "gmail",
          auth_method_id: "oauth",
          form_values: { id: "account" },
          return_url: "https://app.test/connected",
        }),
      }),
    );
    expect(response).toMatchObject({ next_action: { url: "https://trusted.test/oauth" } });
    transport.cancel?.();
    await expect(
      transport.resume(
        "personal:account",
        {},
        "https://app.test/connected",
        new AbortController().signal,
      ),
    ).rejects.toThrow("expired");
  });
});

describe("native credential continuation", () => {
  it("finds a pending account beyond the first credential page", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        id: "account",
        team_id: "team",
        status: "pending",
        tool_group_source_type_id: "gmail",
      })
      .mockResolvedValueOnce({ items: [], next_page_token: "next/page" })
      .mockResolvedValueOnce({
        items: [
          {
            id: "setup",
            owner_id: "account",
            credential_source_type_id: "oauth",
            status: "pending",
          },
        ],
      })
      .mockResolvedValueOnce({
        item: {
          id: "setup",
          owner_id: "account",
          credential_source_type_id: "oauth",
          status: "pending",
        },
        next_action: { type: "redirect", url: "https://trusted.test/oauth" },
      });
    const transport = createNativeConnectorSetupTransport(request, () => "team");
    const response = await transport.start(
      { providerId: "gmail", resourceId: "account", returnUrl: "https://app.test/connected" },
      new AbortController().signal,
    );
    expect(response).toMatchObject({
      setup_id: "credential:setup",
      next_action: { type: "redirect" },
    });
    expect(request).toHaveBeenCalledWith(
      "/api/tilde/user-tools/credential/setup-items?next_page_token=next%2Fpage",
      expect.anything(),
    );
  });

  it("rejects a repeated pagination cursor", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        id: "account",
        status: "pending",
        tool_group_source_type_id: "gmail",
      })
      .mockResolvedValue({ items: [], next_page_token: "same" });
    const transport = createNativeConnectorSetupTransport(request, () => "team");
    await expect(
      transport.start(
        { providerId: "gmail", resourceId: "account", returnUrl: "https://app.test/connected" },
        new AbortController().signal,
      ),
    ).rejects.toThrow("did not advance");
    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe("managed catalog continuation", () => {
  it("uses the managed broker and polls the original account", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          { id: "notion", name: "Notion", connection_method: "oauth_dynamic_client_registration" },
        ],
      })
      .mockResolvedValueOnce({
        status: "authorization_required",
        oauth: {
          tool_group_instance: { id: "account", display_name: "Work", status: "pending" },
          broker_response: { type: "redirect", url: "https://notion.test/oauth" },
        },
      })
      .mockResolvedValueOnce({ id: "account", status: "active" });
    const transport = createNativeConnectorSetupTransport(request, () => "team");
    expect(
      await transport.start(
        {
          providerId: "managed_mcp:notion",
          returnUrl: "https://app.test/connected",
          formValues: { displayName: "Work" },
        },
        new AbortController().signal,
      ),
    ).toMatchObject({ setup_id: "managed:account", next_action: { type: "redirect" } });
    expect(
      await transport.resume(
        "managed:account",
        {},
        "https://app.test/connected",
        new AbortController().signal,
      ),
    ).toMatchObject({ resource: { id: "account" }, next_action: { type: "complete" } });
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/api/tilde/user-tools/mcp/provider-catalog/notion/connect",
      expect.objectContaining({ method: "POST" }),
    );
    transport.cancel?.();
    await expect(
      transport.resume(
        "managed:account",
        {},
        "https://app.test/connected",
        new AbortController().signal,
      ),
    ).rejects.toThrow("expired");
  });
});
