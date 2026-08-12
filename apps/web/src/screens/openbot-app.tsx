import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApprovalCard, TaskRows, Thinking, ToolChips } from "@openbot/ui";
import type { Sandbox } from "@openbot/contracts";
import { InstallationPhase, type Agent, type ChatMessage as OpenBotMessage, type ChatSession, type InstallationStatus, type Skill } from "@openbot/control-service-proto";
import { agentClient, chatClient, installationClient, sandboxClient, skillsClient } from "../client.js";

type Gate = "loading" | "locked" | "app";

const onboarding = [
  {
    id: "meet",
    eyebrow: "Meet OpenBot",
    title: "A dependable place for agents to get work done.",
    copy: "Bring a goal. OpenBot coordinates model responses, tools, and an isolated computer while keeping you close to the work.",
    visual: <OrbitVisual />,
  },
  {
    id: "computer-demo",
    eyebrow: "Its own computer",
    title: "Watch the work, not just the answer.",
    copy: "Each agent can use a disposable desktop and terminal. You can inspect progress, step in, and see exactly what changed.",
    visual: <ComputerVisual />,
  },
  {
    id: "jobs",
    eyebrow: "Agent jobs",
    title: "Turn outcomes into visible tasks.",
    copy: "Longer work stays legible as a sequence of jobs, with status, details, failures, and recovery in one place.",
    visual: <TaskRows />,
  },
  {
    id: "tools",
    eyebrow: "Tools used",
    title: "Every meaningful action leaves a trail.",
    copy: "Tool calls are compact when you want focus and expandable when you need evidence.",
    visual: <ToolChips />,
  },
  {
    id: "create",
    eyebrow: "Create your first agent",
    title: "Give your agent a clear role.",
    copy: "Start with one useful responsibility. You can add provider-backed tools as OpenBot grows.",
    visual: null,
  },
  {
    id: "hand-off",
    eyebrow: "Ready for handoff",
    title: "The workspace is yours.",
    copy: "Ask for work in chat, follow what the agent is thinking, and open its desktop whenever the job needs a computer.",
    visual: <ReadyVisual />,
  },
] as const;

export function OpenBotApp() {
  const [gate, setGate] = useState<Gate>("loading");
  const [status, setStatus] = useState<InstallationStatus>();
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await installationClient.getStatus({});
      setStatus(next);
      setGate("app");
    } catch {
      setGate("locked");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (gate === "loading")
    return (
      <Centered>
        <Brand />
        <p className="muted">Opening your workspace…</p>
      </Centered>
    );
  if (gate === "locked") {
    return <Unlock onUnlocked={refresh} notice={notice} setNotice={setNotice} />;
  }
  if (!status) return null;
  if (status.phase === InstallationPhase.TILDE) {
    return <Setup status={status} onConfigured={(next) => setStatus(next)} />;
  }
  if (status.phase === InstallationPhase.ONBOARDING) {
    return <Onboarding status={status} onChanged={setStatus} />;
  }
  return <Workspace />;
}

function Unlock({
  onUnlocked,
  notice,
  setNotice,
}: {
  onUnlocked(): Promise<void>;
  notice: string;
  setNotice(value: string): void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/setup/unlock", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupCode: code }),
      });
      if (!response.ok) throw new Error("That setup code did not match.");
      await onUnlocked();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "OpenBot could not be unlocked.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Centered>
      <div className="auth-card">
        <Brand />
        <div>
          <p className="eyebrow">Private setup</p>
          <h1>Unlock OpenBot</h1>
          <p className="muted">Enter the setup code chosen when this deployment was created.</p>
        </div>
        <form onSubmit={submit} className="stack">
          <label className="field-label">
            Setup code
            <input
              autoFocus
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              minLength={20}
              required
            />
          </label>
          {notice ? (
            <p className="error" role="alert">
              {notice}
            </p>
          ) : null}
          <button className="primary" disabled={busy || code.length < 20}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    </Centered>
  );
}

function Setup({
  status,
  onConfigured,
}: {
  status: InstallationStatus;
  onConfigured(value: InstallationStatus): void;
}) {
  const [step, setStep] = useState<"tilde" | "secrets">("tilde");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const origin = status.publicOrigin || window.location.origin;
  const deployUrl = new URL("https://api.trytilde.ai/deploy");
  deployUrl.searchParams.set("repository-url", "https://github.com/trytilde/openbot");
  deployUrl.searchParams.set("state-path", "tilde.state.yaml");
  deployUrl.searchParams.set("OPENBOT_CHATKIT_ENDPOINT_URL", `${origin}/api/tilde/chatkit`);

  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const next = await installationClient.configure({
        tildeApiKey: String(values.get("tildeApiKey") ?? ""),
        tildeWebhookSigningKey: String(values.get("tildeWebhookSigningKey") ?? ""),
        tildeOrgId: String(values.get("tildeOrgId") ?? ""),
        tildeTeamId: String(values.get("tildeTeamId") ?? ""),
        tildeAgentId: String(values.get("tildeAgentId") ?? ""),
        tildeUiProviderId: String(values.get("tildeUiProviderId") ?? ""),
        tildeRuntimeMcpServerId: String(values.get("tildeRuntimeMcpServerId") ?? ""),
        tildeSkillRegistryId: String(values.get("tildeSkillRegistryId") ?? ""),
        openaiApiKey: String(values.get("openaiApiKey") ?? ""),
        openaiModel: String(values.get("openaiModel") ?? "gpt-5.4"),
        vercelApiToken: String(values.get("vercelApiToken") ?? ""),
      });
      onConfigured(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "These credentials could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SetupShell step={step === "tilde" ? 1 : 2}>
      {step === "tilde" ? (
        <div className="setup-copy">
          <p className="eyebrow">Connect Tilde</p>
          <h1>Deploy the shared agent gateway.</h1>
          <p className="lede">
            Tilde delivers signed ChatKit turns and tool calls to this OpenBot deployment. The state
            file creates the resources and returns the IDs you will paste in next.
          </p>
          <ol className="instructions">
            <li>Open Tilde in a new tab.</li>
            <li>Select the organization and team for OpenBot.</li>
            <li>Apply the prepared state and keep its output available.</li>
          </ol>
          <a className="tilde-button" href={deployUrl.toString()} target="_blank" rel="noreferrer">
            <span className="tilde-mark">~</span> Deploy with Tilde <Arrow />
          </a>
          <button className="primary" onClick={() => setStep("secrets")}>
            I finished the Tilde deploy
          </button>
        </div>
      ) : (
        <form className="setup-form" onSubmit={configure}>
          <div>
            <p className="eyebrow">Verify connections</p>
            <h1>Add the state outputs.</h1>
            <p className="muted">
              OpenBot stores provider credentials in {status.environmentProvider}. They are never
              written to the control database or returned to this browser.
            </p>
          </div>
          <div className="field-grid">
            {status.environmentProvider.includes("Vercel") &&
            !status.environmentProviderConfigured ? (
              <Field name="vercelApiToken" label="Vercel access token" secret />
            ) : null}
            <Field name="tildeApiKey" label="Tilde API key" secret />
            <Field name="tildeWebhookSigningKey" label="Webhook signing key" secret />
            <Field name="tildeOrgId" label="Organization ID" />
            <Field name="tildeTeamId" label="Team ID" />
            <Field name="tildeAgentId" label="Agent resource ID" />
            <Field name="tildeUiProviderId" label="UI provider resource ID" />
            <Field name="tildeRuntimeMcpServerId" label="Runtime MCP server ID" />
            <Field name="tildeSkillRegistryId" label="Skill registry ID" />
            <Field name="openaiApiKey" label="OpenAI API key" secret />
            <Field name="openaiModel" label="OpenAI model" defaultValue="gpt-5.4" />
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="button-row">
            <button type="button" className="secondary" onClick={() => setStep("tilde")}>
              Back
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Verifying…" : "Verify and continue"}
            </button>
          </div>
        </form>
      )}
    </SetupShell>
  );
}

function Onboarding({
  status,
  onChanged,
}: {
  status: InstallationStatus;
  onChanged(value: InstallationStatus): void;
}) {
  const initial = Math.max(
    0,
    onboarding.findIndex((item) => item.id === status.onboardingStep),
  );
  const [index, setIndex] = useState(initial);
  const [name, setName] = useState("Scout");
  const [busy, setBusy] = useState(false);
  const [primaryAgent, setPrimaryAgent] = useState<Agent>();
  const item = onboarding[index] ?? onboarding[0];
  const last = index === onboarding.length - 1;

  useEffect(() => {
    void agentClient
      .listAgents({})
      .then((result) => setPrimaryAgent(result.agents[0]))
      .catch(() => undefined);
  }, []);

  async function move(next: number) {
    const nextItem = onboarding[next];
    if (!nextItem) return;
    const state = await installationClient.setOnboardingStep({ step: nextItem.id });
    onChanged(state);
    setIndex(next);
  }
  async function continueOnboarding() {
    setBusy(true);
    try {
      if (item.id === "create") {
        if (!primaryAgent) throw new Error("The configured Tilde agent is not available");
        const agent = await agentClient.updateAgent({ id: primaryAgent.id, displayName: name });
        setPrimaryAgent(agent);
      }
      if (last) {
        onChanged(await installationClient.setOnboardingStep({ step: "complete" }));
      } else await move(index + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <Brand />
        <span>
          {index + 1} of {onboarding.length}
        </span>
      </header>
      <section className="onboarding-card">
        <div className="onboarding-copy">
          <p className="eyebrow">{item.eyebrow}</p>
          <h1>{item.title}</h1>
          <p className="lede">{item.copy}</p>
          {item.id === "create" ? (
            <div className="stack agent-form">
              <Field label="Agent name" name="agentName" value={name} onChange={setName} />
              <p className="muted">
                This renames the Tilde agent endpoint deployed during setup. Its browser, terminal,
                and files are provided by this OpenBot instance.
              </p>
              <div className="tool-list">
                <span>Browser</span>
                <span>Terminal</span>
                <span>Files</span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="onboarding-visual">{item.visual}</div>
      </section>
      <footer className="onboarding-footer">
        <div className="progress-dots">
          {onboarding.map((entry, i) => (
            <button
              key={entry.id}
              aria-label={`Go to ${entry.eyebrow}`}
              className={i === index ? "active" : ""}
              onClick={() => void move(i)}
            />
          ))}
        </div>
        <div className="button-row">
          <button
            className="secondary"
            disabled={index === 0 || busy}
            onClick={() => void move(index - 1)}
          >
            Back
          </button>
          <button
            className="primary"
            disabled={busy || (item.id === "create" && !name.trim())}
            onClick={() => void continueOnboarding()}
          >
            {last ? "Open workspace" : item.id === "create" ? "Save agent" : "Continue"}
          </button>
        </div>
      </footer>
    </main>
  );
}

function Workspace() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [messages, setMessages] = useState<OpenBotMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState("Desktop");
  const [desktopUrl, setDesktopUrl] = useState("");
  const [computer, setComputer] = useState<Sandbox>();
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [draft, setDraft] = useState("");

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];

  useEffect(() => {
    void agentClient.listAgents({}).then((result) => {
      setAgents(result.agents);
      setSelectedAgentId((current) => current || result.agents[0]?.id || "");
    });
    void skillsClient.listSkills({ pageSize: 8 }).then((result) => setSkills(result.skills)).catch(() => undefined);
    void sandboxClient.getSandbox({}).then(setComputer).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    void chatClient
      .listSessions({ agentId: selectedAgentId })
      .then((result) => {
        setSessions(result.sessions);
        setSelectedSessionId((current) =>
          result.sessions.some((session) => session.id === current)
            ? current
            : result.sessions[0]?.id || "",
        );
        if (result.sessions.length === 0) setMessages([]);
      })
      .catch((error: unknown) =>
        setChatError(error instanceof Error ? error.message : "Sessions could not be loaded."),
      );
  }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedSessionId) return;
    void chatClient
      .listMessages({ sessionId: selectedSessionId })
      .then((result) => setMessages(result.messages))
      .catch((error: unknown) =>
        setChatError(error instanceof Error ? error.message : "Messages could not be loaded."),
      );
  }, [selectedSessionId]);

  async function newSession() {
    if (!selectedAgent) return undefined;
    const session = await chatClient.createSession({ agentId: selectedAgent.id, title: "" });
    setSessions((current) => [session, ...current]);
    setSelectedSessionId(session.id);
    setMessages([]);
    return session;
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selectedAgent || chatBusy) return;
    setDraft("");
    setChatError("");
    setChatBusy(true);
    try {
      const sessionId = selectedSessionId || (await newSession())?.id;
      if (!sessionId) throw new Error("A Tilde ChatKit session could not be created.");
      const response = await chatClient.sendMessage({ agentId: selectedAgent.id, sessionId, text });
      setMessages(response.messages);
      const refreshed = await chatClient.listSessions({ agentId: selectedAgent.id });
      setSessions(refreshed.sessions);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "The message could not be sent.");
      setDraft(text);
    } finally {
      setChatBusy(false);
    }
  }

  async function startComputer() {
    setSandboxBusy(true);
    try {
      const sandbox = await sandboxClient.createSandbox({ image: "" });
      setComputer(sandbox);
      const desktop = await sandboxClient.getDesktop({});
      setDesktopUrl(desktop.url);
      setWorkspaceTab("Desktop");
    } finally {
      setSandboxBusy(false);
    }
  }
  return (
    <main className="workspace-shell">
      <aside className="rail">
        <Brand />
        <button className="new-chat" onClick={() => void newSession()} disabled={!selectedAgent}>
          <span>+</span> New chat
        </button>
        <nav>
          <p>Agents</p>
          {agents.map((agent) => (
            <div key={agent.id}>
              <button
                className={`agent-row ${agent.id === selectedAgent?.id ? "active" : ""}`}
                onClick={() => setSelectedAgentId(agent.id)}
              >
                <span className="avatar">{agent.displayName.slice(0, 1)}</span>
                <span>
                  <strong>{agent.displayName}</strong>
                  <small>{agent.status}</small>
                </span>
              </button>
              {agent.id === selectedAgent?.id ? (
                <div className="session-list">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      className={session.id === selectedSessionId ? "active" : ""}
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      {session.title || "New chat"}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {skills.length ? (
            <div className="managed-skills">
              <p>Managed skills</p>
              {skills.map((skill) => <span key={skill.id} title={skill.description}>{skill.name}</span>)}
            </div>
          ) : null}
        </nav>
        <div className="rail-footer">
          <span className="status-dot" /> Tilde ChatKit
        </div>
      </aside>
      <section className="chat-pane">
        <header>
          <div>
            <p className="eyebrow">Agent workspace</p>
            <h2>{selectedAgent?.displayName ?? "OpenBot"}</h2>
          </div>
          <button className="secondary" onClick={() => void startComputer()} disabled={sandboxBusy}>
            {sandboxBusy ? "Starting…" : computer ? "Open computer" : "Start computer"}
          </button>
        </header>
        <div className="conversation">
          {messages.length === 0 ? (
            <EmptyChat name={selectedAgent?.displayName ?? "your agent"} />
          ) : (
            messages.map((message) => <ChatMessage key={message.id} message={message} />)
          )}
          {chatBusy ? (
            <div className="thinking-inline">
              <span /> Thinking
            </div>
          ) : null}
          {chatError ? <p className="error">{chatError}</p> : null}
        </div>
        <form className="composer" onSubmit={send}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask OpenBot to get something done…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div>
            <span>Tilde ChatKit · OpenAI</span>
            <button aria-label="Send" disabled={!draft.trim() || chatBusy || !selectedAgent}>
              <Arrow />
            </button>
          </div>
        </form>
      </section>
      <section className="work-pane">
        <header className="tabs">
          {["Desktop", "Files", "Terminal", "Activity"].map((tab) => (
            <button
              className={workspaceTab === tab ? "active" : ""}
              onClick={() => setWorkspaceTab(tab)}
              key={tab}
            >
              {tab}
            </button>
          ))}
        </header>
        <div className="workspace-content">
          {workspaceTab === "Desktop" ? (
            desktopUrl ? (
              <iframe title="Agent desktop" src={desktopUrl} />
            ) : (
              <DesktopEmpty onStart={() => void startComputer()} busy={sandboxBusy} />
            )
          ) : workspaceTab === "Terminal" ? (
            <TerminalStub sandboxId={computer?.id ?? ""} />
          ) : workspaceTab === "Files" ? (
            <FilesStub />
          ) : (
            <ActivityStub />
          )}
        </div>
      </section>
    </main>
  );
}

function ChatMessage({ message }: { message: OpenBotMessage }) {
  return (
    <article className={`message ${message.role}`}>
      <div className="message-label">{message.role === "user" ? "You" : "OpenBot"}</div>
      <p>{message.text}</p>
    </article>
  );
}

function EmptyChat({ name }: { name: string }) {
  return (
    <div className="empty-chat">
      <div className="openbot-glyph">✣</div>
      <h1>What should {name} work on?</h1>
      <p>Ask for research, a browser task, or work inside an isolated computer.</p>
      <div className="suggestions">
        <button>Research a topic and summarize the evidence</button>
        <button>Open a browser and inspect a website</button>
        <button>Draft a plan, then execute its first step</button>
      </div>
    </div>
  );
}
function DesktopEmpty({ onStart, busy }: { onStart(): void; busy: boolean }) {
  return (
    <div className="desktop-empty">
      <div className="desktop-frame">
        <div className="browser-chrome">
          <i />
          <i />
          <i />
        </div>
        <div className="desktop-wallpaper">✣</div>
      </div>
      <h3>No computer is running</h3>
      <p>Start an isolated desktop for browser and computer work.</p>
      <button className="primary" onClick={onStart} disabled={busy}>
        {busy ? "Starting computer…" : "Start computer"}
      </button>
    </div>
  );
}
function TerminalStub({ sandboxId }: { sandboxId: string }) {
  return (
    <div className="terminal">
      <p>
        <span>$</span> openbot sandbox status
      </p>
      <p>{sandboxId ? `attached ${sandboxId}` : "no sandbox attached"}</p>
      <i>Terminal streaming is the next control-plane connection.</i>
    </div>
  );
}
function FilesStub() {
  return (
    <div className="pane-empty">
      <h3>Files</h3>
      <p>Workspace files appear here after a computer starts.</p>
    </div>
  );
}
function ActivityStub() {
  return (
    <div className="activity">
      <Thinking />
      <ApprovalCard />
    </div>
  );
}
function SetupShell({ children, step }: { children: ReactNode; step: number }) {
  return (
    <main className="setup-shell">
      <aside>
        <Brand />
        <div className="setup-steps">
          <span className={step >= 1 ? "done" : ""}>
            1<i>Deploy Tilde</i>
          </span>
          <span className={step >= 2 ? "done" : ""}>
            2<i>Verify connections</i>
          </span>
          <span>
            3<i>Meet OpenBot</i>
          </span>
        </div>
        <p>Your secrets stay encrypted at rest.</p>
      </aside>
      <section>{children}</section>
    </main>
  );
}
function Field({
  label,
  name,
  secret,
  defaultValue,
  value,
  onChange,
}: {
  label: string;
  name: string;
  secret?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?(value: string): void;
}) {
  return (
    <label className="field-label">
      {label}
      <input
        required
        name={name}
        type={secret ? "password" : "text"}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        autoComplete="off"
      />
    </label>
  );
}
function Centered({ children }: { children: ReactNode }) {
  return <main className="centered">{children}</main>;
}
function Brand() {
  return (
    <div className="brand">
      <span>✣</span>
      <strong>OpenBot</strong>
    </div>
  );
}
function Arrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function OrbitVisual() {
  return (
    <div className="orbit">
      <span>✣</span>
      <i />
      <i />
      <i />
    </div>
  );
}
function ComputerVisual() {
  return (
    <div className="computer-demo">
      <div className="browser-chrome">
        <i />
        <i />
        <i />
      </div>
      <div className="demo-content">
        <span className="demo-sidebar" />
        <div>
          <b />
          <b />
          <b />
          <em />
        </div>
      </div>
      <span className="cursor">↖</span>
    </div>
  );
}
function ReadyVisual() {
  return (
    <div className="ready-visual">
      <span>✣</span>
      <i className="pulse one" />
      <i className="pulse two" />
      <i className="pulse three" />
    </div>
  );
}
