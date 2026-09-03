import type { OnboardingResult } from "@trytilde/dispatch-client-runtime";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AgentAvatar, agentAvatarPalette, type AgentAvatarShapeName } from "./agent-avatar.js";
import { Button } from "./beautiful-ui/atoms/button.js";
import { Shimmer } from "./beautiful-ui/atoms/shimmer.js";

export type OnboardingStep =
  | "landing"
  | "meet"
  | "computer-demo"
  | "jobs"
  | "tools"
  | "create"
  | "hand-off";

const STEPS: readonly OnboardingStep[] = [
  "landing",
  "meet",
  "computer-demo",
  "jobs",
  "tools",
  "create",
];

// The shape of a completed onboarding is a persisted, cross-client contract owned by
// `@trytilde/dispatch-client-runtime` per ADR-0017. Import it for local use and re-export it so
// callers keep a single type regardless of which package they import from.
export type { OnboardingResult };

export interface OnboardingProps {
  signedIn: boolean;
  signingIn: boolean;
  error?: string;
  onSignIn: () => void;
  onCancelSignIn?: () => void;
  onComplete: (result: OnboardingResult) => void | Promise<void>;
  /** Hand-off status line; defaults to "Warming up your workspace…". */
  handOffStatus?: string;
}

const CAST = [
  { key: "triage", color: "#e02135", shape: "pebble", x: 0, y: -112 },
  { key: "checks", color: "#00a592", shape: "cloud", x: -132, y: 27 },
  { key: "cleanup", color: "#0e74e0", shape: "hex", x: 138, y: 7 },
] as const;

const JOB_LABELS: Record<string, string> = {
  triage: "Inbox triage",
  checks: "Nightly checks",
  cleanup: "Data cleanup",
};

const TOOLS = [
  "Airtable",
  "Confluence",
  "Datadog",
  "Dropbox",
  "Figma",
  "GitHub",
  "Google Drive",
  "HubSpot",
  "Intercom",
  "Jira",
  "Linear",
  "Notion",
  "Postgres",
  "Sentry",
  "Shopify",
  "Slack",
  "Snowflake",
  "Stripe",
  "Vercel",
  "Zoom",
] as const;

/* Swatches reuse the avatar palette so a picked colour renders
 * identically wherever the bot appears. */
const CHARACTER_COLORS = agentAvatarPalette;

const CHARACTER_SHAPES: readonly AgentAvatarShapeName[] = [
  "blob",
  "pebble",
  "squircle",
  "tablet",
  "wedge",
  "hex",
  "cloud",
  "teardrop",
];

export function Onboarding({
  signedIn,
  signingIn,
  error,
  onSignIn,
  onCancelSignIn,
  onComplete,
  handOffStatus,
}: OnboardingProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [tools, setTools] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(CHARACTER_COLORS[6] ?? "#2a92fe");
  const [shape, setShape] = useState<AgentAvatarShapeName>("blob");
  const [handingOff, setHandingOff] = useState(false);

  const step: OnboardingStep = handingOff ? "hand-off" : (STEPS[stepIndex] ?? "landing");

  // Landing auto-advances once the user is signed in.
  useEffect(() => {
    if (signedIn && stepIndex === 0) setStepIndex(1);
  }, [signedIn, stepIndex]);

  const next = () => setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  const back = () => setStepIndex((index) => Math.max(index - 1, 1));

  const finish = () => {
    setHandingOff(true);
    const result: OnboardingResult = {
      name: name.trim(),
      color,
      shape,
      tools,
    };
    // Minimum dwell so the hand-off frame reads before the app swaps in.
    void Promise.all([
      Promise.resolve(onComplete(result)),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  };

  return (
    <main className="onboarding grid min-h-screen place-items-center bg-page p-6">
      <section className="relative flex w-full max-w-[720px] flex-col items-center text-center">
        {step === "landing" ? (
          <Landing
            error={error}
            signingIn={signingIn}
            onSignIn={onSignIn}
            onCancel={onCancelSignIn}
          />
        ) : null}
        {step === "meet" ? <Meet onNext={next} /> : null}
        {step === "computer-demo" ? (
          <StepFrame title="Every bot gets its own computer" onBack={back} onNext={next}>
            <ComputerDemo />
          </StepFrame>
        ) : null}
        {step === "jobs" ? (
          <StepFrame title="One bot, one job" onBack={back} onNext={next}>
            <JobsScene />
          </StepFrame>
        ) : null}
        {step === "tools" ? (
          <StepFrame title="Which tools should your bots reach?" onBack={back} onNext={next}>
            <ToolsGrid selected={tools} onChange={setTools} />
          </StepFrame>
        ) : null}
        {step === "create" ? (
          <CreateBot
            color={color}
            name={name}
            shape={shape}
            onBack={back}
            onColor={setColor}
            onName={setName}
            onShape={setShape}
            onSubmit={finish}
          />
        ) : null}
        {step === "hand-off" ? (
          <div className="flex flex-col items-center gap-4 py-24">
            <h1 className="text-[26px] font-semibold tracking-[-0.015em] text-ink">Dispatch</h1>
            <p aria-live="polite">
              <Shimmer className="text-[17px]">
                {handOffStatus || "Warming up your workspace…"}
              </Shimmer>
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

/* ── Jobs scene — the three companion bots with their jobs. */
function JobsScene() {
  return (
    <div aria-hidden className="relative h-[340px] w-full">
      {CAST.map((member) => (
        <div
          key={member.key}
          className="absolute left-1/2 top-1/2 flex flex-col items-center"
          style={{
            transform: `translate(calc(${member.x}px - 50%), calc(${member.y * 0.7}px - 50%))`,
          }}
        >
          <AgentAvatar
            className="!size-20"
            color={member.color}
            id={member.key}
            shape={member.shape}
            state="happy"
          />
          <p className="mt-3 rounded-full bg-surface px-3 py-1 text-[12.5px] font-medium text-ink shadow-card">
            {JOB_LABELS[member.key]}
          </p>
        </div>
      ))}
    </div>
  );
}

function StepFrame({
  title,
  children,
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
}: {
  title: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-8">
      <hgroup>
        <h1 className="max-w-[480px] text-[26px] font-semibold leading-8 tracking-[-0.015em] text-ink">
          {title}
        </h1>
      </hgroup>
      {children}
      <footer className="flex items-center gap-3">
        {onBack ? (
          <Button className="!rounded-full" variant="secondary" onClick={onBack}>
            Back
          </Button>
        ) : null}
        {onNext ? (
          <Button className="!rounded-full" disabled={nextDisabled} onClick={onNext}>
            {nextLabel}
          </Button>
        ) : null}
      </footer>
    </div>
  );
}

function Landing({
  signingIn,
  error,
  onSignIn,
  onCancel,
}: {
  signingIn: boolean;
  error?: string;
  onSignIn: () => void;
  onCancel?: (() => void) | undefined;
}) {
  return (
    <div className="flex -translate-y-10 flex-col items-center gap-5">
      <AgentAvatar
        className="!size-16"
        color="#1084FE"
        id="dispatch-hero"
        shape="blob"
        state="happy"
      />
      <h1 className="text-[26px] font-semibold tracking-[-0.015em] text-ink">Dispatch</h1>
      <p className="max-w-[340px] text-[14px] leading-5 text-ink-2">
        Stand up a bot, hand it the work you keep putting off.
      </p>
      {signingIn ? (
        <div className="flex flex-col items-center gap-2">
          <p aria-live="polite" className="flex items-center gap-2 text-[13px] text-ink-2">
            <span
              aria-hidden
              className="size-3.5 animate-spin rounded-full border-[1.5px] border-ink-3 border-t-transparent"
            />
            Finish signing in your browser
          </p>
          <p className="flex items-center gap-2 text-[13px]">
            <button className="text-accent-ink hover:underline" onClick={onSignIn} type="button">
              Open the link again
            </button>
            <span aria-hidden className="text-ink-3">
              ·
            </span>
            <button className="text-ink-2 hover:underline" onClick={onCancel} type="button">
              Cancel
            </button>
          </p>
        </div>
      ) : (
        <Button autoFocus className="!rounded-full !px-5" onClick={onSignIn}>
          Sign in <span aria-hidden>→</span>
        </Button>
      )}
      {error ? <p className="text-[12.5px] text-red">{error}</p> : null}
    </div>
  );
}

/* ── Meet — a fake composer types the pitch, Send advances. */
const MEET_IDLE = "Ready when you are";
const MEET_TYPED = "Send a bot after the thing you keep deferring";

function Meet({ onNext }: { onNext: () => void }) {
  const [typed, setTyped] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const startDelay = setTimeout(() => {
      started.current = true;
      const timer = setInterval(() => {
        setTyped((count) => {
          if (count >= MEET_TYPED.length) {
            clearInterval(timer);
            return count;
          }
          return count + 1;
        });
      }, 35);
    }, 700);
    return () => clearTimeout(startDelay);
  }, []);

  const text = typed > 0 ? MEET_TYPED.slice(0, typed) : "";
  return (
    <StepFrame title="Meet Dispatch">
      <div className="flex flex-col items-center gap-10">
        <AgentAvatar
          className="!size-20"
          color="#1084FE"
          id="dispatch-hero"
          shape="blob"
          state="listening"
        />
        <div className="w-[348px] -translate-y-3.5 rounded-[18px] bg-surface p-3 text-left shadow-card">
          <p className="min-h-10 px-1 py-1.5 text-[14px] leading-5">
            {text ? (
              <span className="text-ink">
                {text}
                <span aria-hidden className="stream-caret" />
              </span>
            ) : (
              <span className="text-ink-3">{MEET_IDLE}</span>
            )}
          </p>
          <div className="flex items-center justify-between pt-1">
            <button
              aria-label="Attach"
              className="flex size-7 items-center justify-center rounded-full bg-field text-ink-2 shadow-hairline"
              tabIndex={-1}
              type="button"
            >
              +
            </button>
            <button
              aria-label="Send"
              className="flex size-7 items-center justify-center rounded-full bg-ink text-page"
              onClick={onNext}
              type="button"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </StepFrame>
  );
}

/* ── Computer demo — a static mock desktop card. */
function ComputerDemo() {
  return (
    <div className="w-[380px] overflow-hidden rounded-card bg-surface text-left shadow-card">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <span aria-hidden className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span aria-hidden className="size-2.5 rounded-full bg-[#febc2e]" />
        <span aria-hidden className="size-2.5 rounded-full bg-[#28c840]" />
      </div>
      <div className="grid grid-cols-3 gap-2 bg-canvas p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="h-16 rounded-[8px] bg-field" key={index} />
        ))}
      </div>
    </div>
  );
}

/* ── Tools grid. */
function ToolsGrid({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (tools: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = TOOLS.filter((tool) => tool.toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (tool: string) => {
    onChange(
      selected.includes(tool) ? selected.filter((item) => item !== tool) : [...selected, tool],
    );
  };

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <label className="flex h-9 w-[300px] items-center gap-2 rounded-full bg-inset px-3 shadow-hairline">
        <span aria-hidden className="text-ink-3">
          ⌕
        </span>
        <input
          aria-label="Filter tools"
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          placeholder="Search"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="grid max-h-[300px] w-full max-w-[624px] grid-cols-3 gap-2 overflow-y-auto p-1">
        {filtered.map((tool) => {
          const active = selected.includes(tool);
          return (
            <button
              aria-pressed={active}
              className={`flex h-11 items-center gap-2.5 rounded-[10px] px-3 text-left text-[13px] font-medium
                transition-[background-color,box-shadow] duration-150
                ${active ? "bg-accent-tint text-ink shadow-[0_0_0_1px_var(--accent)]" : "bg-surface text-ink shadow-hairline hover:bg-hover"}`}
              key={tool}
              onClick={() => toggle(tool)}
              type="button"
            >
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-field text-[11px] font-semibold text-ink-2"
              >
                {tool.charAt(0)}
              </span>
              <span className="truncate">{tool}</span>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <p className="col-span-3 py-8 text-center text-[13px] text-ink-3">
            No tools match “{query.trim()}”
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ── Create step. */
function CreateBot({
  name,
  color,
  shape,
  onName,
  onColor,
  onShape,
  onSubmit,
  onBack,
}: {
  name: string;
  color: string;
  shape: AgentAvatarShapeName;
  onName: (name: string) => void;
  onColor: (color: string) => void;
  onShape: (shape: AgentAvatarShapeName) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-6 text-left">
      <header className="flex items-center justify-center gap-2.5">
        <AgentAvatar className="!size-5" color={color} id="new-bot" paused shape={shape} />
        <h1 className="text-[22px] font-semibold tracking-[-0.012em] text-ink">Set up your bot</h1>
      </header>

      <div aria-label="Bot colour" className="flex justify-center gap-2" role="radiogroup">
        {CHARACTER_COLORS.map((entry, index) => (
          <button
            aria-checked={color === entry}
            aria-label={`Colour ${index + 1}`}
            className={`size-6 rounded-full transition-transform duration-100 active:scale-90
              ${color === entry ? "ring-2 ring-ink ring-offset-2 ring-offset-page" : ""}`}
            key={entry}
            role="radio"
            style={{ background: entry }}
            onClick={() => onColor(entry)}
            type="button"
          />
        ))}
      </div>

      <div aria-label="Bot shape" className="flex justify-center gap-1.5" role="radiogroup">
        {CHARACTER_SHAPES.map((entry) => (
          <button
            aria-checked={shape === entry}
            aria-label={`${entry} shape`}
            className={`flex size-9 items-center justify-center rounded-[8px] transition-colors
              ${shape === entry ? "bg-hover-2" : "hover:bg-hover"}`}
            key={entry}
            role="radio"
            onClick={() => onShape(entry)}
            type="button"
          >
            <AgentAvatar
              className="!size-[22px]"
              color={color}
              id={`shape-${entry}`}
              paused
              shape={entry}
            />
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-ink-2">Name</span>
        <input
          className="h-9 rounded-control bg-surface px-3 text-[13px] text-ink shadow-hairline outline-none
            placeholder:text-ink-3 focus-visible:shadow-[0_0_0_2px_var(--accent)]"
          id="onboarding-create-name"
          placeholder="Name your bot"
          spellCheck={false}
          value={name}
          onChange={(event) => onName(event.target.value)}
        />
      </label>

      <footer className="flex items-center justify-center gap-3">
        <Button className="!rounded-full" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button className="!rounded-full" disabled={!name.trim()} onClick={onSubmit}>
          Create bot
        </Button>
      </footer>
    </div>
  );
}
