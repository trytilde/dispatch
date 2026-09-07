import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { createClient } from "../src";
import type { ChatKitProviderDefinition, ProviderObject } from "../src/chatkit-provider";
import {
  chatKitProviderEndpoint,
  createProviderRuntimeClient,
  defineChatKitProvider,
} from "../src/chatkit-provider";

const key = "provider-test-signing-key";
const context = {
  session_id: "session-1",
  agent_inbox_instance_id: "agent-1",
  target_inbox_instance_id: "human-1",
  trigger_message_id: "message-1",
  execution_id: "execution-1",
  conversation_key: "thread-1",
  external_message_id: "platform-message-1",
  provider_message: {},
  provider_thread: {},
};
function envelope(operation: string, input: ProviderObject = {}) {
  return {
    protocol_version: 1,
    manifest_version: "1",
    request_id: "request-1",
    scope: {
      org_id: "org-1",
      team_id: "team-1",
      definition_id: "provider-1",
      connection_id: "connection-1",
    },
    operation,
    context,
    input,
    configuration: {},
    secrets: {},
  };
}
function signed(body?: unknown, timestamp = Math.floor(Date.now() / 1000)) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  return new Request("https://provider.example/chatkit", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "x-tilde-timestamp": String(timestamp),
      "x-tilde-signature": `hmac-sha256=${createHmac("sha256", key).update(`${timestamp}.${raw}`).digest("hex")}`,
    },
    ...(body === undefined ? {} : { body: raw }),
  });
}
function fixture() {
  const execute = vi.fn(async () => ({ reacted: true }));
  const reconcile = vi.fn(async () => ({
    status: "applied" as const,
    result: { reacted: true },
  }));
  const provider: ChatKitProviderDefinition = {
    version: "1",
    displayName: "Complex provider",
    description: "Parity fixture",
    configurationSchema: { type: "object" },
    capabilities: { inbound: true },
    setup: {
      start: async () => ({ nextAction: { type: "complete" } }),
      resume: async () => ({ nextAction: { type: "complete" } }),
      disconnect: async () => {},
    },
    sessionTools: [
      {
        name: "addReaction",
        description: "React to the triggering message",
        inputSchema: {
          type: "object",
          properties: { emoji: { type: "string" } },
          required: ["emoji"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: { reacted: { type: "boolean" } },
          required: ["reacted"],
        },
        execute,
        reconcile,
      },
    ],
  };
  const endpoint = chatKitProviderEndpoint({
    provider,
    signingKey: key,
    definitionId: "provider-1",
    endpointUrl: "https://provider.example/chatkit",
  });
  return { provider, endpoint, execute, reconcile };
}

describe("ChatKit provider contract", () => {
  it("serves authenticated discovery and never reflects a forged Host into invoke_url", async () => {
    const { endpoint } = fixture();
    const request = signed();
    request.headers.set("host", "attacker.example");
    const response = await endpoint.GET(request);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { invoke_url: string }).invoke_url).toBe(
      "https://provider.example/chatkit",
    );
    expect((await endpoint.GET(new Request("https://provider.example/chatkit"))).status).toBe(401);
  });
  it("rejects expired signatures and signed cross-definition scopes before executing", async () => {
    const { endpoint, execute } = fixture();
    const body = envelope("invoke_session_tool", {
      name: "addReaction",
      arguments: { emoji: "like" },
    });
    expect((await endpoint.POST(signed(body, 1))).status).toBe(401);
    body.scope.definition_id = "another-provider";
    expect((await endpoint.POST(signed(body))).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it("keeps routing outside model inputs and passes exact message context", async () => {
    const { endpoint, execute } = fixture();
    const payload = envelope("invoke_session_tool", {
      name: "addReaction",
      arguments: { emoji: "like" },
    });
    expect((await endpoint.POST(signed(payload))).status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      { emoji: "like" },
      expect.objectContaining({
        connectionId: "connection-1",
        session: expect.objectContaining({
          externalMessageId: "platform-message-1",
          executionId: "execution-1",
        }),
      }),
    );
    payload.input.arguments = { emoji: "like", sessionId: "other-session" };
    expect((await endpoint.POST(signed(payload))).status).toBe(400);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("rechecks contextual availability on direct invocation", async () => {
    const { provider, execute } = fixture();
    provider.sessionTools![0]!.available = () => false;
    const endpoint = chatKitProviderEndpoint({
      provider,
      signingKey: key,
      definitionId: "provider-1",
      endpointUrl: "https://provider.example/chatkit",
    });
    expect(await (await endpoint.POST(signed(envelope("list_session_tools")))).json()).toEqual({
      tools: [],
    });
    expect(
      (
        await endpoint.POST(
          signed(
            envelope("invoke_session_tool", {
              name: "addReaction",
              arguments: { emoji: "like" },
            }),
          ),
        )
      ).status,
    ).toBe(422);
    expect(execute).not.toHaveBeenCalled();
  });
  it("reconciles without calling the mutation handler", async () => {
    const { endpoint, execute, reconcile } = fixture();
    const response = await endpoint.POST(
      signed(
        envelope("reconcile_session_tool", {
          name: "addReaction",
          arguments: { emoji: "like" },
        }),
      ),
    );
    expect(await response.json()).toEqual({
      status: "applied",
      result: { reacted: true },
    });
    expect(reconcile).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });
  it("rejects missing reconciliation and reserved tool names at definition time", () => {
    const { provider } = fixture();
    delete provider.sessionTools![0]!.reconcile;
    expect(() => defineChatKitProvider(provider)).toThrow(/reconciliation/);
    provider.sessionTools![0]!.name = "sendMessage";
    expect(() => defineChatKitProvider(provider)).toThrow(/reserved/);
  });
  it("does not expose provider exception payloads", async () => {
    const { endpoint, execute } = fixture();
    execute.mockRejectedValueOnce(new Error("Authorization: SECRET; BCC: hidden@example.com"));
    const response = await endpoint.POST(
      signed(
        envelope("invoke_session_tool", {
          name: "addReaction",
          arguments: { emoji: "like" },
        }),
      ),
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("hidden@example.com");
  });
});

describe("provider SDK clients", () => {
  it("maps registration paths, auth, and one-time credentials", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        provider: {
          id: "p",
          org_id: "org",
          team_id: "team",
          display_name: "Mine",
          discovery_url: "https://provider.example",
          enabled: true,
          revision: 0,
          manifest: null,
        },
        signing_key: "secret",
      }),
    );
    const client = createClient({
      baseUrl: "https://api.example",
      orgId: "org",
      orgSubdomain: false,
      teamId: "team",
      apiKey: "admin",
      fetch: fetchMock,
    });
    const result = await client.chatkit.customProviders.create({
      displayName: "Mine",
      discoveryUrl: "https://provider.example",
    });
    expect(result.signingKey).toBe("secret");
    expect(result.provider.displayName).toBe("Mine");
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [URL, RequestInit];
    expect(requestUrl(url)).toContain("/api/v1/team/team/chatkit/custom-providers");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer admin");
    expect(JSON.parse(init.body as string)).toEqual({
      display_name: "Mine",
      discovery_url: "https://provider.example",
      local_running_endpoint: false,
    });
  });
  it("uses only the connection credential for normalized ingress", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ event_id: "e", message_id: "m", status: "pending" }),
    );
    const runtime = createProviderRuntimeClient({
      baseUrl: "https://api.example",
      orgId: "org",
      orgSubdomain: false,
      teamId: "team",
      connectionId: "connection/1",
      token: "scoped",
      fetch: fetchMock,
    });
    expect(
      await runtime.ingest({
        eventId: "e",
        externalMessageId: "external",
        conversationKey: "thread",
        sender: { externalId: "human", displayName: "Human", kind: "username" },
        text: "hello",
      }),
    ).toEqual({ eventId: "e", messageId: "m", status: "pending" });
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [URL, RequestInit];
    expect(requestUrl(url)).toContain("connection%2F1/messages");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer scoped");
    expect(JSON.parse(init.body as string).sender).toEqual({
      external_id: "human",
      display_name: "Human",
      kind: "username",
    });
  });
});

describe("Rust and TypeScript protocol conformance", () => {
  it("validates discovery and invocation against generated Rust OpenAPI schemas", async () => {
    const spec = JSON.parse(
      readFileSync(new URL("../../api-client/specs/openapi.cloud.json", import.meta.url), "utf8"),
    );
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    const validate = (name: string, value: unknown) => {
      const schema = {
        components: spec.components,
        $ref: `#/components/schemas/${name}`,
      };
      const check = ajv.compile(schema);
      expect(check(value), JSON.stringify(check.errors)).toBe(true);
    };
    const { endpoint } = fixture();
    const registration = spec.components.schemas.CustomChatKitProvider;
    const manifestName = registration.properties.manifest.oneOf
      .find((entry: { $ref?: string }) => entry.$ref)
      .$ref.split("/")
      .at(-1);
    validate(manifestName, await (await endpoint.GET(signed())).json());
    const invocation = envelope("invoke_session_tool", {
      name: "addReaction",
      arguments: { emoji: "like" },
    });
    validate("CustomProviderInvocation", invocation);
    expect((await endpoint.POST(signed(invocation))).status).toBe(200);
  });
});

describe("Associated toolkit lifecycle", () => {
  it("requires a credential callback and keeps child signing material outside model arguments", async () => {
    const { provider } = fixture();
    provider.capabilities.toolkit = true;
    expect(() => defineChatKitProvider(provider)).toThrow(/toolkit/i);
    const configured = vi.fn(async () => {});
    provider.setup.toolkitConfigured = configured;
    const endpoint = chatKitProviderEndpoint({
      provider,
      definitionId: "provider-1",
      signingKey: key,
      endpointUrl: "https://provider.example/chatkit",
    });
    const response = await endpoint.POST(
      signed(
        envelope("toolkit_configured", {
          tool_group_instance_id: "tools-1",
          signing_key: "child-test-key",
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(configured).toHaveBeenCalledWith(
      { toolGroupInstanceId: "tools-1", signingKey: "child-test-key" },
      expect.objectContaining({ connectionId: "connection-1" }),
    );
    expect(await response.text()).not.toContain("child-test-key");
  });
});

function requestUrl(value: Parameters<typeof fetch>[0]): string {
  return typeof value === "string" ? value : value instanceof URL ? value.href : value.url;
}
