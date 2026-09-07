import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { agentMailProvider } from "../examples/custom-chatkit/agentmail";
import { linqProvider } from "../examples/custom-chatkit/linq";
import { ProviderStore } from "../examples/custom-chatkit/store";
import { chatKitProviderEndpoint } from "../src/chatkit-provider";

const key = "test-tilde-signing-key";
const stores: ProviderStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
function store() {
  const store = new ProviderStore(":memory:", new Uint8Array(32).fill(7));
  stores.push(store);
  return store;
}
const session = {
  session_id: "session",
  agent_inbox_instance_id: "agent",
  target_inbox_instance_id: "human",
  trigger_message_id: "trigger",
  execution_id: "execution",
  conversation_key: "conversation",
  external_message_id: "exact-message",
  provider_message: {},
  provider_thread: {
    chat_id: "chat",
    thread_id: "thread",
    message_id: "old-message",
  },
};
function invoke(
  operation: string,
  input: unknown,
  options: { configuration?: unknown; secrets?: unknown } = {},
) {
  const body = JSON.stringify({
    protocol_version: 1,
    manifest_version: "1",
    request_id: "request",
    operation,
    input,
    context: session,
    scope: {
      org_id: "org",
      team_id: "team",
      definition_id: "definition",
      connection_id: "connection",
    },
    configuration: options.configuration ?? {},
    secrets: options.secrets ?? {},
  });
  const timestamp = Math.floor(Date.now() / 1000);
  return new Request("https://provider.example/endpoint", {
    method: "POST",
    body,
    headers: {
      "x-tilde-timestamp": String(timestamp),
      "x-tilde-signature": `hmac-sha256=${createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex")}`,
    },
  });
}
function platformWebhook(payload: unknown, family: "svix" | "webhook", secret: string) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", Buffer.from(secret.replace("whsec_", ""), "base64"))
    .update(`event.${timestamp}.${body}`)
    .digest("base64");
  return new Request("https://provider.example/webhooks/connection", {
    method: "POST",
    body,
    headers: {
      [`${family}-id`]: "event",
      [`${family}-timestamp`]: String(timestamp),
      [`${family}-signature`]: `v1,${signature}`,
    },
  });
}

describe("Linq provider parity", () => {
  it("configures subscriptions and exposes the complete session action set", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ id: "subscription", signing_secret: "whsec_c2VjcmV0" }),
    );
    const adapter = linqProvider({
      store: store(),
      apiBaseUrl: "https://tilde.example",
      webhookBaseUrl: "https://provider.example/webhooks",
      fetch: fetcher,
    });
    const endpoint = chatKitProviderEndpoint({
      provider: adapter.definition,
      definitionId: "definition",
      signingKey: key,
      endpointUrl: "https://provider.example/endpoint",
    });
    const setup = await endpoint.POST(
      invoke("setup_start", {
        runtime_token: "runtime",
        form_values: {
          configFields: {
            api_token: "linq-token",
            phone_numbers: "+12025551234",
          },
        },
      }),
    );
    expect(setup.status).toBe(200);
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request).toMatchObject({
      target_url: "https://provider.example/webhooks/connection",
      subscribed_events: ["message.received"],
      phone_numbers: ["+12025551234"],
    });
    expect(adapter.definition.sessionTools.map((t) => t.name)).toEqual([
      "addReaction",
      "removeReaction",
      "getThread",
      "createPoll",
      "addPollOptions",
      "votePoll",
    ]);
  });
  it("reconciles a lost poll response with the original idempotency key", async () => {
    let effects = 0;
    let loseResponse = true;
    const receipts = new Map<string, object>();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const id = new Headers(init?.headers).get("idempotency-key")!;
      if (!receipts.has(id)) {
        effects++;
        receipts.set(id, { message_id: "poll" });
      }
      if (loseResponse) {
        loseResponse = false;
        throw new Error("Response lost after platform commit");
      }
      return Response.json(receipts.get(id));
    });
    const adapter = linqProvider({
      store: store(),
      apiBaseUrl: "https://tilde.example",
      webhookBaseUrl: "https://provider.example/webhooks",
      fetch: fetcher,
    });
    const endpoint = chatKitProviderEndpoint({
      provider: adapter.definition,
      definitionId: "definition",
      signingKey: key,
      endpointUrl: "https://provider.example/endpoint",
    });
    const input = { name: "createPoll", arguments: { options: ["A", "B"] } };
    const context = { secrets: { api_token: "linq-token" } };
    expect((await endpoint.POST(invoke("invoke_session_tool", input, context))).status).toBe(500);
    expect(
      await (await endpoint.POST(invoke("reconcile_session_tool", input, context))).json(),
    ).toEqual({ status: "applied", result: { message_id: "poll" } });
    expect(effects).toBe(1);
    expect(
      fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get("idempotency-key")),
    ).toEqual(["execution", "execution"]);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).poll.idempotency_key).toBe(
      "execution",
    );
  });
  it("targets reactions at the bound triggering message and refuses an unprovable retry", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ applied: true }));
    const adapter = linqProvider({
      store: store(),
      apiBaseUrl: "https://tilde.example",
      webhookBaseUrl: "https://provider.example/webhooks",
      fetch: fetcher,
    });
    const endpoint = chatKitProviderEndpoint({
      provider: adapter.definition,
      definitionId: "definition",
      signingKey: key,
      endpointUrl: "https://provider.example/endpoint",
    });
    const input = { name: "addReaction", arguments: { emoji: "👍" } };
    expect(
      (
        await endpoint.POST(
          invoke("reconcile_session_tool", input, {
            secrets: { api_token: "token" },
          }),
        )
      ).status,
    ).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]![1]?.method).toBe("GET");
    expect(
      (
        await endpoint.POST(
          invoke("invoke_session_tool", input, {
            secrets: { api_token: "token" },
          }),
        )
      ).status,
    ).toBe(200);
    expect(requestUrl(fetcher.mock.calls[1]![0])).toContain("/messages/exact-message/reactions");
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual({
      operation: "add",
      type: "like",
    });
  });
});

describe("AgentMail provider parity", () => {
  it("keeps BCC private while preparing visible To/CC participants", async () => {
    const adapter = agentMailProvider({
      store: store(),
      apiBaseUrl: "https://tilde.example",
      webhookBaseUrl: "https://provider.example/webhooks",
    });
    const endpoint = chatKitProviderEndpoint({
      provider: adapter.definition,
      definitionId: "definition",
      signingKey: key,
      endpointUrl: "https://provider.example/endpoint",
    });
    const response = await endpoint.POST(
      invoke("prepare_send", {
        content: "hello",
        to: ["visible@example.com"],
        cc: ["copy@example.com"],
        bcc: ["hidden@example.com"],
        subject: "Subject",
        html: "<p>hello</p>",
        reply_all: false,
      }),
    );
    const result = (await response.json()) as {
      bcc: string[];
      visible_recipients: { external_id: string }[];
      reply_all: boolean;
    };
    expect(result.bcc).toEqual(["hidden@example.com"]);
    expect(result.visible_recipients.map((p: { external_id: string }) => p.external_id)).toEqual([
      "visible@example.com",
      "copy@example.com",
    ]);
    expect(result.reply_all).toBe(false);
  });
  it("delivers rich replies to the exact source message with URL-backed attachments", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ message_id: "sent" }));
    const adapter = agentMailProvider({
      store: store(),
      apiBaseUrl: "https://tilde.example",
      webhookBaseUrl: "https://provider.example/webhooks",
      fetch: fetcher,
    });
    const endpoint = chatKitProviderEndpoint({
      provider: adapter.definition,
      definitionId: "definition",
      signingKey: key,
      endpointUrl: "https://provider.example/endpoint",
    });
    const response = await endpoint.POST(
      invoke(
        "deliver",
        {
          delivery_id: "delivery",
          attempt: 1,
          body: "hello",
          external_message_id: "latest",
          provider_thread: session.provider_thread,
          options: {
            to: ["visible@example.com"],
            bcc: ["hidden@example.com"],
            html: "<p>hello</p>",
            subject: "Subject",
            reply_all: true,
          },
          attachments: [
            {
              media_type: "application/pdf",
              filename: "report.pdf",
              url: "https://storage.example/signed",
            },
          ],
        },
        {
          configuration: { inbox_id: "agent@example.com" },
          secrets: { api_key: "mail-token" },
        },
      ),
    );
    expect(await response.json()).toEqual({ external_message_id: "sent" });
    expect(requestUrl(fetcher.mock.calls[0]![0])).toContain("/messages/latest/reply-all");
    const sent = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(sent).toMatchObject({
      bcc: ["hidden@example.com"],
      attachments: [
        {
          url: "https://storage.example/signed",
          filename: "report.pdf",
          content_type: "application/pdf",
        },
      ],
    });
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get("idempotency-key")).toBe("delivery");
  });
  it("redacts hidden recipients from thread tool output", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        messages: [{ text: "hello", bcc: ["hidden@example.com"] }],
      }),
    );
    const adapter = agentMailProvider({
      store: store(),
      apiBaseUrl: "https://tilde.example",
      webhookBaseUrl: "https://provider.example/webhooks",
      fetch: fetcher,
    });
    const endpoint = chatKitProviderEndpoint({
      provider: adapter.definition,
      definitionId: "definition",
      signingKey: key,
      endpointUrl: "https://provider.example/endpoint",
    });
    const response = await endpoint.POST(
      invoke(
        "invoke_session_tool",
        { name: "getThread", arguments: {} },
        {
          configuration: { inbox_id: "agent@example.com" },
          secrets: { api_key: "token" },
        },
      ),
    );
    expect(await response.text()).not.toContain("hidden@example.com");
  });
  it("verifies webhooks and reuses the durable normalized draft on replay", async () => {
    const state = store();
    const secret = "whsec_c2VjcmV0";
    state.saveConnection("connection", {
      orgId: "org",
      teamId: "team",
      runtimeToken: "scoped",
      configuration: { inbox_id: "agent@example.com" },
      secrets: { webhook_secret: secret, api_key: "token" },
    });
    const bodies: object[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.operation === "ensure_conversation")
        return Response.json({ type: "conversation", session_id: "session" });
      bodies.push(body);
      return Response.json({
        event_id: "event",
        message_id: "message",
        status: "pending",
      });
    });
    const adapter = agentMailProvider({
      store: state,
      apiBaseUrl: "https://tilde.example",
      webhookBaseUrl: "https://provider.example/webhooks",
      fetch: fetcher,
    });
    const event = {
      event_id: "event",
      event_type: "message.received",
      message: {
        inbox_id: "agent@example.com",
        thread_id: "thread",
        message_id: "source",
        from: "Person <person@example.com>",
        text: "hello",
        bcc: ["hidden@example.com"],
      },
    };
    expect(
      (await adapter.webhook("connection", platformWebhook(event, "svix", secret))).status,
    ).toBe(202);
    expect(
      (await adapter.webhook("connection", platformWebhook(event, "svix", secret))).status,
    ).toBe(202);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(JSON.stringify(bodies)).not.toContain("hidden@example.com");
    const invalid = platformWebhook(event, "svix", secret);
    invalid.headers.set("svix-signature", "v1,ZmFrZQ==");
    await expect(adapter.webhook("connection", invalid)).rejects.toThrow(/signature/);
  });
});

describe("AgentMail durable delivery recovery", () => {
  it("recovers a post-effect crash by finding its marker on a later page", async () => {
    let sends = 0;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === "POST") {
        sends++;
        throw new Error("Lost response after email was sent");
      }
      return Response.json(
        requestUrl(url).includes("page_token=second")
          ? {
              messages: [{ message_id: "sent", labels: ["tilde-delivery-mail-send"] }],
            }
          : { messages: [], next_page_token: "second" },
      );
    });
    const adapter = agentMailProvider({
      store: store(),
      apiBaseUrl: "https://tilde.example",
      webhookBaseUrl: "https://provider.example/webhooks",
      fetch: fetcher,
    });
    const endpoint = chatKitProviderEndpoint({
      provider: adapter.definition,
      definitionId: "definition",
      signingKey: key,
      endpointUrl: "https://provider.example/endpoint",
    });
    const input = {
      delivery_id: "mail-send",
      attempt: 1,
      body: "hello",
      options: {},
      attachments: [],
      provider_thread: session.provider_thread,
    };
    const context = {
      configuration: { inbox_id: "agent@example.com" },
      secrets: { api_key: "token" },
    };
    expect((await endpoint.POST(invoke("deliver", input, context))).status).toBe(500);
    expect(
      await (await endpoint.POST(invoke("reconcile_delivery", input, context))).json(),
    ).toEqual({ status: "applied", result: { external_message_id: "sent" } });
    expect(sends).toBe(1);
  });
  it("does not repeat an unknown email after the platform forgets its idempotency key", async () => {
    const state = store();
    state.prepareDelivery(JSON.stringify(["connection", "old-send"]), "/original", { text: "old" });
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ messages: [] }));
    const adapter = agentMailProvider({
      store: state,
      apiBaseUrl: "https://tilde.example",
      webhookBaseUrl: "https://provider.example/webhooks",
      fetch: fetcher,
    });
    const endpoint = chatKitProviderEndpoint({
      provider: adapter.definition,
      definitionId: "definition",
      signingKey: key,
      endpointUrl: "https://provider.example/endpoint",
    });
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 25 * 60 * 60 * 1000);
    try {
      const input = {
        delivery_id: "old-send",
        attempt: 2,
        body: "old",
        options: {},
        attachments: [],
        provider_thread: session.provider_thread,
      };
      const response = await endpoint.POST(
        invoke("reconcile_delivery", input, {
          configuration: { inbox_id: "agent@example.com" },
          secrets: { api_key: "token" },
        }),
      );
      expect(await response.json()).toMatchObject({ status: "uncertain" });
      expect(fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
});

describe("Linq setup recovery", () => {
  it("replaces only its own orphan subscription when a create response is lost", async () => {
    const state = store();
    let createCount = 0;
    const removed: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === "POST") {
        createCount++;
        if (createCount === 1) throw new Error("Lost signing secret");
        return Response.json({
          id: "replacement",
          signing_secret: "whsec_c2VjcmV0",
        });
      }
      if (init?.method === "DELETE") {
        removed.push(requestUrl(url));
        return new Response(null, { status: 204 });
      }
      return Response.json({
        subscriptions: [
          {
            id: "orphan",
            target_url: "https://provider.example/webhooks/connection",
          },
          {
            id: "unrelated",
            target_url: "https://provider.example/webhooks/other",
          },
        ],
      });
    });
    const adapter = linqProvider({
      store: state,
      apiBaseUrl: "https://tilde.example",
      webhookBaseUrl: "https://provider.example/webhooks",
      fetch: fetcher,
    });
    const endpoint = chatKitProviderEndpoint({
      provider: adapter.definition,
      definitionId: "definition",
      signingKey: key,
      endpointUrl: "https://provider.example/endpoint",
    });
    const input = {
      runtime_token: "runtime",
      form_values: { api_token: "token", phone_numbers: "+12025551234" },
    };
    expect((await endpoint.POST(invoke("setup_start", input))).status).toBe(500);
    expect((await endpoint.POST(invoke("setup_start", input))).status).toBe(200);
    expect(removed).toEqual([
      "https://api.linqapp.com/api/partner/v3/webhook-subscriptions/orphan",
    ]);
    expect(state.getConnection("connection").configuration.subscription_id).toBe("replacement");
  });
});

function requestUrl(value: Parameters<typeof fetch>[0]): string {
  return typeof value === "string" ? value : value instanceof URL ? value.href : value.url;
}
