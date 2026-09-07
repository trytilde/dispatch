import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatEventSurface } from "./chat-events.js";
import { ChatMessage, MessageContent } from "./message-content.js";

describe("event disclosure", () => {
  it("renders a projected tool summary without a bubble or raw tool details", () => {
    const html = renderToStaticMarkup(
      <ChatEventSurface>
        <MessageContent
          message={{
            type: "ui",
            session_id: "session",
            parts: [
              {
                type: "data",
                data_type: "tilde-tool-summary",
                data: {
                  toolName: "Read files",
                  toolCallId: "call",
                  state: "output-available",
                  summary: "Reviewed four files",
                  input: "hidden-input",
                  output: "hidden-output",
                },
              },
            ],
          }}
          resolveAttachmentUrl={async () => ""}
        />
      </ChatEventSurface>,
    );
    expect(html).toContain("Reviewed four files");
    expect(html).not.toContain("hidden-input");
    expect(html).not.toContain("hidden-output");
    expect(html).not.toContain("message-bubble");
  });
});

describe("message attachments", () => {
  const part = {
    type: "file",
    filename: "notes.txt",
    mediaType: "text/plain",
    url: "https://example.test/notes.txt",
  };
  it("renders attachment-only messages without a bubble or removal button", () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        role="user"
        createdAt="2026-09-07"
        message={{ type: "ui", session_id: "chat", parts: [part] }}
        resolveAttachmentUrl={async () => part.url}
      />,
    );
    expect(html).toContain("message-attachment-chip");
    expect(html).not.toContain("message-bubble");
    expect(html).not.toContain("Remove file");
  });
  it("renders attachment chips after the text bubble", () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        role="user"
        createdAt="2026-09-07"
        message={{
          type: "ui",
          session_id: "chat",
          parts: [{ type: "text", text: "Read this" }, part],
        }}
        resolveAttachmentUrl={async () => part.url}
      />,
    );
    expect(html).toMatch(/Read this.*<\/div><div class="message-attachments">/);
    expect(html).toContain("message-attachment-chip");
  });
});

describe("chained tool calls", () => {
  const tool = (id: string) => ({
    type: "tool-shell",
    toolCallId: id,
    summary: `Step ${id}`,
    input: { command: "npm run freeze" },
    output: "FULL OUTPUT",
    state: "output-available",
  });
  it("groups consecutive generic tools but keeps specialized media outside the chain", () => {
    const html = renderToStaticMarkup(
      <MessageContent
        message={{
          type: "ui",
          session_id: "session",
          parts: [
            tool("a"),
            tool("b"),
            { type: "tool-image", output: { attachment_id: "image", media_type: "image/png" } },
            tool("c"),
            tool("d"),
          ],
        }}
        resolveAttachmentUrl={async () => ""}
      />,
    );
    expect(html.match(/class="tool-call-chain"/g)).toHaveLength(2);
    expect(html).toContain("media-part");
    expect(html).toContain("$command = &quot;npm run freeze&quot;");
    expect(html).not.toContain("FULL OUTPUT");
    expect(html).not.toContain("Files edited");
  });
  it("renders a summary-only chain with no argument chips or expansion buttons", () => {
    const part = {
      type: "data",
      data_type: "tilde-tool-summary",
      data: {
        toolName: "Run command",
        toolCallId: "summary",
        summary: "Everything passed",
        state: "output-available",
        input: "HIDDEN",
      },
    };
    const html = renderToStaticMarkup(
      <MessageContent
        message={{ type: "ui", session_id: "session", parts: [part, part] }}
        resolveAttachmentUrl={async () => ""}
      />,
    );
    expect(html).toContain("Everything passed");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("tool-pattern-input");
    expect(html).not.toContain("HIDDEN");
    expect(html).not.toContain("Run command");
  });
});
