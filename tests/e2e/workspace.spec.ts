import { expect, test } from "@playwright/test";

test("loads the bare workspace without setup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What should OpenBot do?" })).toBeVisible();
  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.getByText("Agent activity")).toBeVisible();
  await expect(page.getByLabel("Setup code")).toHaveCount(0);

  await page.goto("/api/setup/unlock");
  await expect(page.getByRole("heading", { name: "What should OpenBot do?" })).toBeVisible();
});

test("streams rich messages and uploads a file through Tilde ChatKit", async ({ page }) => {
  const now = new Date().toISOString();
  let messages: Array<Record<string, unknown>> = [
    {
      id: "message-one",
      type: "ui",
      role: "assistant",
      session_id: "session-one",
      user_display_name: "Hello World",
      created_at: now,
      parts: [{ type: "text", text: "Ready when you are." }],
    },
  ];

  await page.route("**/api/computer/**", async (route) => {
    await route.fulfill({ contentType: "text/html", body: "<main>Agent desktop</main>" });
  });

  await page.route("**/api/chat/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/mission-control/sidebar")) {
      await route.fulfill({
        json: {
          items: [
            {
              id: "hello-world",
              display_name: "Hello World",
              provider_id: "chatkit.http-vercel-ai-sdk",
              status: "enabled",
              sessions: {
                items: [
                  { id: "session-one", title: "Working session", created_at: now, updated_at: now },
                ],
              },
            },
          ],
        },
      });
      return;
    }
    if (path.endsWith("/observe")) {
      await route.fulfill({
        contentType: "text/event-stream",
        body:
          'event: agent_turn_status\ndata: {"status":"working"}\n\n' +
          'event: message_streaming\ndata: {"kind":{"message_streaming":{"session_id":"session-one","message_id":"stream-one","delta":{"type":"text-delta","delta":"Streaming preview"}}}}\n\n' +
          'event: agent_turn_status\ndata: {"status":"idle"}\n\n',
      });
      return;
    }
    if (path.endsWith("/agent-turn-queue")) {
      await route.fulfill({
        json: {
          items: [
            {
              id: "queue-one",
              session_id: "session-one",
              queue_position: 1,
              status: "pending",
              chat_request: {
                messages: [{ role: "user", content: [{ type: "text", text: "Queued follow-up" }] }],
              },
              created_at: now,
            },
          ],
        },
      });
      return;
    }
    if (path.endsWith("/agent-turn-queue/queue-one") && request.method() === "DELETE") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (path.endsWith("/messages") && request.method() === "GET") {
      await route.fulfill({ json: { items: messages } });
      return;
    }
    if (path.endsWith("/attachment/upload")) {
      await route.fulfill({
        json: {
          attachment: { id: "attachment-one", media_type: "text/plain", status: "pending" },
          upload_url:
            "https://api.trytilde.ai/api/v1/team/e2e-team/chatkit/session/session-one/attachment/attachment-one/content",
          upload_headers: { "content-type": "text/plain" },
        },
      });
      return;
    }
    if (path.endsWith("/attachment/attachment-one/content")) {
      await route.fulfill({ json: { status: "uploaded" } });
      return;
    }
    if (path.endsWith("/attachment/attachment-one/complete")) {
      await route.fulfill({
        json: { id: "attachment-one", media_type: "text/plain", status: "uploaded" },
      });
      return;
    }
    if (path.endsWith("/messages") && request.method() === "POST") {
      messages = [
        ...messages,
        {
          id: "message-user",
          type: "ui",
          role: "user",
          session_id: "session-one",
          user_display_name: "You",
          created_at: now,
          parts: [
            { type: "text", text: "Read this file" },
            {
              type: "file",
              filename: "brief.txt",
              media_type: "text/plain",
              url: "https://files.test/brief.txt",
            },
          ],
        },
        {
          id: "message-two",
          type: "ui",
          role: "assistant",
          session_id: "session-one",
          user_display_name: "Hello World",
          created_at: now,
          parts: [
            { type: "reasoning", text: "Inspecting the attachment", state: "done" },
            {
              type: "tool",
              tool_name: "read_file",
              tool_invocation_id: "tool-one",
              state: "output-available",
              input: { path: "brief.txt" },
              output: { bytes: 12 },
            },
            { type: "text", text: "The file is **clear** and complete." },
            {
              type: "source-url",
              source_id: "source-one",
              title: "Reference",
              url: "https://example.com",
            },
          ],
        },
      ];
      await route.fulfill({ json: { items: messages } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: `Unhandled ${request.method()} ${path}` } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Working session" }).click();
  await expect(page.getByTitle("Hello World Computer")).toBeVisible();
  await expect(
    page.getByTitle("Hello World Computer").contentFrame().getByText("Agent desktop"),
  ).toBeVisible();
  await page.getByRole("button", { name: /Click to take over/ }).click();
  await expect(page.getByRole("button", { name: "Release" })).toBeVisible();
  await page.getByRole("button", { name: /Activity/ }).click();
  await expect(page.getByText("Ready when you are.")).toBeVisible();
  await expect(page.getByText("Streaming preview")).toBeVisible();
  await expect(page.getByText("Queued follow-up")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run now" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(
    "Queued follow-up",
  );
  await page.getByLabel("Attach files").click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "brief.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("OpenBot brief"),
  });
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Read this file");
  await page.getByLabel("Send").click();

  await expect(page.getByText("The file is clear and complete.")).toBeVisible();
  await expect(page.getByText("read_file")).toBeVisible();
  await expect(page.getByRole("button", { name: /brief.txt/ })).toBeVisible();
  await expect(page.getByText("Agent Turn Status").first()).toBeVisible();
});

test("queues another turn while the agent is busy", async ({ page }) => {
  const now = new Date().toISOString();
  let queued = false;
  let postedText = "";
  let requestedAgentSort = "";

  await page.route("**/api/computer/**", async (route) => {
    await route.fulfill({ contentType: "text/html", body: "<main>Busy agent desktop</main>" });
  });

  await page.route("**/api/chat/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/mission-control/sidebar")) {
      requestedAgentSort = url.searchParams.get("agent_sort") ?? "";
      await route.fulfill({
        json: {
          items: [
            {
              id: "busy-agent",
              display_name: "Busy Agent",
              provider_id: "chatkit.http-vercel-ai-sdk",
              status: "enabled",
              sessions: {
                items: [
                  { id: "busy-session", title: "Busy session", created_at: now, updated_at: now },
                ],
              },
            },
          ],
        },
      });
      return;
    }
    if (path.endsWith("/observe")) {
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'event: agent_turn_status\ndata: {"status":"working"}\n\n',
      });
      return;
    }
    if (path.endsWith("/agent-turn-queue")) {
      await route.fulfill({
        json: {
          items: queued
            ? [
                {
                  id: "queued-two",
                  session_id: "busy-session",
                  queue_position: 1,
                  status: "pending",
                  chat_request: {
                    messages: [{ role: "user", content: [{ type: "text", text: postedText }] }],
                  },
                  created_at: now,
                },
              ]
            : [],
        },
      });
      return;
    }
    if (path.endsWith("/messages") && request.method() === "GET") {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (path.endsWith("/messages") && request.method() === "POST") {
      const body = request.postDataJSON() as { text: string };
      postedText = body.text;
      queued = true;
      await route.fulfill({ json: { items: [] } });
      return;
    }
    await route.fulfill({ status: 204 });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Busy session" }).click();
  await expect(page.getByLabel("Queue message")).toBeVisible();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Do this next");
  await page.getByLabel("Queue message").click();
  await page.getByRole("button", { name: /Activity/ }).click();
  await expect(page.getByText("Do this next")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

  await page.getByLabel("Sort agents").selectOption("created_at");
  await expect.poll(() => requestedAgentSort).toBe("created_at");
});

test("keeps the server healthy and control namespace empty", async ({ request }) => {
  const health = await request.get("/healthz");
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toEqual({ ok: true, service: "openbot" });

  const rpc = await request.post("/rpc/openbot.control.v1.ControlService/Unknown");
  expect(rpc.status()).toBe(404);
});
