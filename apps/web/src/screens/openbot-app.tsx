import { type FormEvent, useEffect, useState } from "react";

interface ChatAgent {
  id: string;
  displayName: string;
  status: string;
}

interface ChatSession {
  id: string;
  agentId: string;
  title?: string;
}

interface ChatMessage {
  id: string;
  sessionId: string;
  role: string;
  text: string;
}

export function OpenBotApp() {
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [session, setSession] = useState<ChatSession>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void rpc<{ agents: ChatAgent[] }>("ListAgents", {})
      .then(({ agents: available }) => {
        setAgents(available);
        setAgentId(available[0]?.id ?? "");
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);

  const selectedAgent = agents.find((agent) => agent.id === agentId);

  async function send(event: FormEvent): Promise<void> {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !agentId || sending) return;
    setSending(true);
    setError("");
    try {
      const activeSession =
        session ??
        (await rpc<ChatSession>("CreateSession", {
          agentId,
          title: text.length > 80 ? `${text.slice(0, 77)}...` : text,
        }));
      setSession(activeSession);
      setDraft("");
      const response = await rpc<{ messages: ChatMessage[] }>("SendMessage", {
        agentId,
        sessionId: activeSession.id,
        text,
      });
      setMessages(response.messages);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSending(false);
    }
  }

  function selectAgent(id: string): void {
    setAgentId(id);
    setSession(undefined);
    setMessages([]);
    setError("");
  }

  return (
    <main className="workspace-shell">
      <aside className="rail">
        <div className="brand">
          <span>✣</span>
          <strong>OpenBot</strong>
        </div>
        <button
          className="new-chat"
          disabled={!agentId}
          onClick={() => {
            setSession(undefined);
            setMessages([]);
          }}
        >
          <span>+</span> New chat
        </button>
        <nav>
          <p>Agents</p>
          {loading ? <p className="agent-status">Loading agents…</p> : null}
          {!loading && agents.length === 0 ? (
            <p className="agent-status">No agents are available.</p>
          ) : null}
          {agents.map((agent) => (
            <button
              className={agent.id === agentId ? "agent active" : "agent"}
              key={agent.id}
              onClick={() => selectAgent(agent.id)}
            >
              <strong>{agent.displayName}</strong>
              <span>{agent.status}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <span className="status-dot" /> Server ready
        </div>
      </aside>

      <section className="chat-pane">
        <header>
          <div>
            <p className="eyebrow">Agent workspace</p>
            <h2>{selectedAgent?.displayName ?? "OpenBot"}</h2>
          </div>
        </header>
        <div className="conversation" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <div className="openbot-glyph">✣</div>
              <h1>What should OpenBot become?</h1>
              <p>Choose an agent and start a conversation.</p>
            </div>
          ) : (
            <div className="message-list">
              {messages
                .filter((message) => message.text)
                .map((message) => (
                  <article className={`message ${message.role}`} key={message.id}>
                    <span>{message.role === "user" ? "You" : selectedAgent?.displayName}</span>
                    <p>{message.text}</p>
                  </article>
                ))}
            </div>
          )}
        </div>
        <form className="composer" onSubmit={(event) => void send(event)}>
          <textarea
            aria-label="Message"
            disabled={!agentId || sending}
            placeholder={agentId ? "Message your agent…" : "No agent is available."}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div>
            <span className={error ? "error" : ""}>
              {error || (sending ? "Agent is responding…" : "")}
            </span>
            <button aria-label="Send" disabled={!agentId || !draft.trim() || sending}>
              ↑
            </button>
          </div>
        </form>
      </section>

      <section className="work-pane">
        <header className="tabs">
          <button className="active">Preview</button>
        </header>
        <div className="workspace-content">
          <div className="desktop-empty">
            <div className="desktop-frame">
              <div className="browser-chrome">
                <i />
                <i />
                <i />
              </div>
              <div className="desktop-wallpaper">✣</div>
            </div>
            <h3>Workspace preview</h3>
            <p>The agent can use its OpenBot Computer while you chat.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

async function rpc<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/rpc/openbot.control.v1.ControlService/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "connect-protocol-version": "1",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => undefined)) as
      | { message?: string }
      | undefined;
    throw new Error(failure?.message ?? `OpenBot request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "OpenBot request failed";
}
