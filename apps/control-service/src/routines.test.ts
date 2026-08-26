import { describe, expect, it, vi } from "vite-plus/test";
import { createApp } from "./app.js";

const nativeRoutine = {
  id: "routine-1",
  agent_inbox_id: "inbox-1",
  title: "Deploy watchdog",
  prompt: "Check deploy health",
  enabled: true,
  version: 3,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
  triggers: [
    {
      id: "trigger-schedule",
      kind: "schedule",
      enabled: true,
      schedule: "0 7 * * *",
      schedule_description: "Daily at 07:00 UTC",
      next_run_at: "2026-08-25T07:00:00Z",
      last_run_at: "2026-08-24T07:00:00Z",
      last_session_id: "11111111-1111-4111-8111-111111111111",
    },
    {
      id: "trigger-event",
      kind: "event",
      enabled: true,
      signal_provider_instance_id: "spi_abc",
      signal_type: "github.pull_request.opened",
      filter: { json_equals: [{ path: "/pull_request/draft", value: false }] },
    },
  ],
};

const providersPage = {
  items: [
    {
      type_id: "github",
      signal_types: [
        {
          type_id: "github.pull_request.opened",
          default_session_key_template: "chat#{{ repository.full_name }}#{{ number }}",
          default_session_title_template: "{{ repository.full_name }}#{{ number }}",
        },
      ],
    },
  ],
};

interface UpstreamCall {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

function routineApp(respond: (call: UpstreamCall) => Response | undefined) {
  const calls: UpstreamCall[] = [];
  const fetch = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(input);
    const call: UpstreamCall = {
      method: init?.method ?? "GET",
      path: url.pathname,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return respond(call) ?? new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
  });
  return {
    calls,
    app: createApp({
      routines: {
        apiKey: "key",
        orgId: "org-1",
        teamId: "team-1",
        baseUrl: "https://tilde.test",
        fetch: fetch as unknown as typeof globalThis.fetch,
      },
    }),
  };
}

function nativeResponses(call: UpstreamCall): Response | undefined {
  if (call.method === "GET" && call.path === "/api/v1/team/team-1/routines")
    return Response.json({ items: [nativeRoutine], next_page_token: null });
  if (call.method === "GET" && call.path === "/api/v1/team/team-1/signals/providers")
    return Response.json(providersPage);
  return undefined;
}

describe("native routine routes", () => {
  it("lists one native Routine with schedule and event triggers", async () => {
    const { app } = routineApp(nativeResponses);
    const response = await app.request("https://openbot.test/api/routines?agent_id=inbox-1");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: Array<Record<string, unknown>> };
    expect(body.items[0]).toMatchObject({
      id: "routine-1",
      name: "Deploy watchdog",
      instruction: "Check deploy health",
      triggers: [
        { id: "trigger-schedule", kind: "schedule" },
        { id: "trigger-event", kind: "event", instance_id: "spi_abc" },
      ],
    });
  });

  it("creates all triggers with one atomic upstream request", async () => {
    const { app, calls } = routineApp((call) => {
      if (call.method === "POST" && call.path === "/api/v1/team/team-1/routines")
        return Response.json(nativeRoutine);
      return nativeResponses(call);
    });
    const response = await app.request("https://openbot.test/api/routines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent_id: "inbox-1",
        name: "Deploy watchdog",
        instruction: "Check deploy health",
        enabled: true,
        triggers: [
          { kind: "schedule", schedule: "0 7 * * *" },
          {
            kind: "event",
            instance_id: "spi_abc",
            signal_type: "github.pull_request.opened",
            filters: [{ path: "/pull_request/draft", value: false }],
          },
        ],
      }),
    });
    expect(response.status).toBe(201);
    const creates = calls.filter((call) => call.method === "POST");
    expect(creates).toHaveLength(1);
    expect(creates[0]?.body).toMatchObject({
      agent_inbox_id: "inbox-1",
      triggers: [
        { kind: "schedule" },
        {
          kind: "event",
          instruction_policy: "signal_and_instruction",
          action: { type: "invoke_chatkit_agent", agent_inbox_id: "inbox-1" },
        },
      ],
    });
  });

  it("uses optimistic concurrency for one atomic trigger replacement", async () => {
    const { app, calls } = routineApp((call) => {
      if (call.method === "GET" && call.path.endsWith("/routines/routine-1"))
        return Response.json(nativeRoutine);
      if (call.method === "PATCH" && call.path.endsWith("/routines/routine-1"))
        return Response.json({ ...nativeRoutine, version: 4 });
      return nativeResponses(call);
    });
    const response = await app.request(
      "https://openbot.test/api/routines/routine-1?agent_id=inbox-1",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          triggers: [{ id: "trigger-schedule", kind: "schedule", schedule: "0 8 * * *" }],
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
      expected_version: 3,
      triggers: [{ id: "trigger-schedule", schedule: "0 8 * * *" }],
    });
  });

  it("delegates run-now to the native Routine execution endpoint", async () => {
    const { app } = routineApp((call) => {
      if (call.method === "POST" && call.path.endsWith("/routines/routine-1/run"))
        return Response.json({ session_id: "11111111-1111-4111-8111-111111111111" });
      return undefined;
    });
    const response = await app.request(
      "https://openbot.test/api/routines/routine-1/run?agent_id=inbox-1",
      { method: "POST" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      session_id: "11111111-1111-4111-8111-111111111111",
    });
  });
});
