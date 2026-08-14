export type DeploymentTarget = "development" | "preview" | "production";

export interface DeploymentEvent {
  event: string;
  details?: Readonly<Record<string, unknown>>;
}

export type DeploymentReporter = (event: DeploymentEvent) => void;

export interface DeploymentResult {
  outputs?: Readonly<Record<string, string>>;
}

/** In-memory handoff for non-secret lifecycle artifacts and resource identifiers. */
export class DeploymentOutputs {
  readonly #outputs = new Map<string, string>();

  merge(result: DeploymentResult | void): void {
    for (const [name, value] of Object.entries(result?.outputs ?? {})) {
      if (!name || !value) throw new Error("Deployment output names and values must not be empty");
      const existing = this.#outputs.get(name);
      if (existing !== undefined && existing !== value)
        throw new Error(`Conflicting deployment output: ${name}`);
      this.#outputs.set(name, value);
    }
  }

  get(name: string): string | undefined {
    return this.#outputs.get(name);
  }

  require(name: string): string {
    const value = this.get(name);
    if (!value) throw new Error(`Required deployment output is unavailable: ${name}`);
    return value;
  }

  outputs(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.#outputs);
  }

  result(): DeploymentResult {
    return { outputs: this.outputs() };
  }
}

/** A provider-owned, idempotent software artifact lifecycle. */
export interface Buildable {
  check(context: DeploymentContext): Promise<void>;
  build(context: DeploymentContext): Promise<DeploymentResult | void>;
}

export type InitializationValueDestination = "environment" | "secret";

export interface ProviderInitializationQuestion {
  id: string;
  prompt: string;
  description?: string;
  input: "text" | "secret" | "select";
  required?: boolean;
  choices?: readonly { value: string; label: string; description?: string }[];
  destination: {
    kind: InitializationValueDestination;
    key: string;
  };
  validation?: {
    pattern: string;
    message: string;
  };
}

/** Serializable provider onboarding metadata. Renderers remain CLI/browser agnostic. */
export interface ProviderInitialization {
  id: string;
  label: string;
  description?: string;
  questions: readonly ProviderInitializationQuestion[];
}

export interface ProviderInitializationContext {
  repositoryRoot: string;
  environment: NodeJS.ProcessEnv;
  request?: typeof fetch;
  setEnvironment(name: string, value: string, description: string): Promise<void>;
  setSecret(name: string, value: string, description: string): Promise<void>;
}

/** Provider-owned provisioning that runs after initialization questions are collected. */
export interface ProviderInitializer {
  initialize(context: ProviderInitializationContext): Promise<void>;
}

/** An external platform shared by one or more domain providers. */
export interface Platform {
  readonly id: string;
  readonly initialization: ProviderInitialization;
}

export interface InitializableProvider {
  readonly initialization?: ProviderInitialization;
  /** Shared external platforms required before this provider can be configured. */
  readonly platforms?: readonly Platform[];
  /** Idempotently provision values or resources required by this provider. */
  initialize?(context: ProviderInitializationContext): Promise<void>;
}

/** Collect provider-owned setup and shared platform dependencies once by stable ID. */
export function collectProviderInitializations(
  providers: readonly InitializableProvider[],
): ProviderInitialization[] {
  const result = new Map<string, ProviderInitialization>();
  for (const provider of providers) {
    const initializations = [
      ...(provider.platforms ?? []).map((platform) => {
        if (platform.id !== platform.initialization.id)
          throw new Error(`Platform ${platform.id} has mismatched initialization metadata`);
        return platform.initialization;
      }),
      ...(provider.initialization ? [provider.initialization] : []),
    ];
    for (const initialization of initializations) {
      const previous = result.get(initialization.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(initialization)) {
        throw new Error(
          `Providers define conflicting initialization dependency: ${initialization.id}`,
        );
      }
      result.set(initialization.id, initialization);
    }
  }
  return [...result.values()];
}

/** Run provider-owned initialization provisioning once per stable initialization ID. */
export async function initializeProviders(
  providers: readonly InitializableProvider[],
  context: ProviderInitializationContext,
): Promise<void> {
  const initialized = new Set<string>();
  for (const provider of providers) {
    if (!provider.initialize) continue;
    const id = provider.initialization?.id;
    if (!id) throw new Error("Provider initializers require stable initialization metadata");
    if (initialized.has(id)) continue;
    await provider.initialize(context);
    initialized.add(id);
  }
}

export interface DeploymentPersistence {
  setEnvironment(name: string, value: string, description: string): Promise<void>;
  setSecret(name: string, value: string, description: string): Promise<void>;
  unsetEnvironment(name: string): Promise<void>;
  unsetSecret(name: string): Promise<void>;
}

const noPersistence: DeploymentPersistence = {
  setEnvironment: async () => undefined,
  setSecret: async () => undefined,
  unsetEnvironment: async () => undefined,
  unsetSecret: async () => undefined,
};

export interface DeploymentContext {
  target: DeploymentTarget;
  repositoryRoot: string;
  environment: NodeJS.ProcessEnv;
  persistence?: DeploymentPersistence;
  inputs: DeploymentOutputs;
  agentId?: string;
  agentPath?: string;
  agentServiceOrigin?: string;
  report: DeploymentReporter;
}

export async function persistEnvironment(
  context: DeploymentContext,
  name: string,
  value: string,
  description: string,
): Promise<void> {
  validateEnvironmentName(name);
  if (!value) throw new Error(`Environment value must not be empty: ${name}`);
  if (context.environment[name] !== value)
    await (context.persistence ?? noPersistence).setEnvironment(name, value, description);
  context.environment[name] = value;
}

export async function persistSecret(
  context: DeploymentContext,
  name: string,
  value: string,
  description: string,
): Promise<void> {
  validateEnvironmentName(name);
  if (!value) throw new Error(`Secret value must not be empty: ${name}`);
  if (context.environment[name] !== value)
    await (context.persistence ?? noPersistence).setSecret(name, value, description);
  context.environment[name] = value;
}

export async function unsetEnvironment(context: DeploymentContext, name: string): Promise<void> {
  validateEnvironmentName(name);
  if (context.environment[name] !== undefined)
    await (context.persistence ?? noPersistence).unsetEnvironment(name);
  delete context.environment[name];
}

export async function unsetSecret(context: DeploymentContext, name: string): Promise<void> {
  validateEnvironmentName(name);
  if (context.environment[name] !== undefined)
    await (context.persistence ?? noPersistence).unsetSecret(name);
  delete context.environment[name];
}

function validateEnvironmentName(name: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`Invalid environment name: ${name}`);
}

export interface DeploymentPlan {
  summary: string;
  steps?: readonly string[];
}

/**
 * A provider-owned deployment lifecycle. Every method must be idempotent: callers may invoke
 * planning, configuration, and deployment repeatedly to reconcile the desired state.
 */
export interface Deployable {
  plan(context: DeploymentContext): Promise<DeploymentPlan>;
  configure?(context: DeploymentContext): Promise<DeploymentResult | void>;
  deploy(context: DeploymentContext): Promise<DeploymentResult | void>;
}

/** Provider domains expose a deployment lifecycle only when they need one. */
export interface DeployableProvider extends InitializableProvider {
  readonly buildable?: Buildable;
  readonly deployable?: Deployable;
}

export interface DeploymentParticipant {
  id: string;
  role?: "provider" | "sandbox" | "runtime";
  provider: DeployableProvider;
}

export interface DeploymentRunOptions {
  target: DeploymentTarget;
  dryRun: boolean;
  repositoryRoot: string;
  environment?: NodeJS.ProcessEnv;
  persistence?: DeploymentPersistence;
  initialInputs?: DeploymentResult;
  report?: DeploymentReporter;
}

/** Check and build every opted-in software artifact before deployment begins. */
export async function buildProviders(
  participants: readonly DeploymentParticipant[],
  options: DeploymentRunOptions,
): Promise<DeploymentOutputs> {
  assertUniqueParticipantIds(participants);
  const report = options.report ?? (() => undefined);
  const inputs = new DeploymentOutputs();
  inputs.merge(options.initialInputs);
  const context: DeploymentContext = {
    target: options.target,
    repositoryRoot: options.repositoryRoot,
    environment: options.environment ?? process.env,
    persistence: options.persistence ?? noPersistence,
    inputs,
    report,
  };

  for (const participant of participants) {
    const buildable = participant.provider.buildable;
    if (!buildable) continue;
    const scopedContext = context;
    report({ event: "build.provider.check.started", details: { providerId: participant.id } });
    await buildable.check(scopedContext);
    report({ event: "build.provider.check.complete", details: { providerId: participant.id } });
    report({ event: "build.provider.build.started", details: { providerId: participant.id } });
    inputs.merge(await buildable.build(scopedContext));
    report({ event: "build.provider.build.complete", details: { providerId: participant.id } });
  }
  return inputs;
}

export async function deployProviders(
  participants: readonly DeploymentParticipant[],
  options: DeploymentRunOptions,
): Promise<DeploymentOutputs> {
  assertUniqueParticipantIds(participants);
  const deployable = participants.flatMap((participant) =>
    participant.provider.deployable
      ? [{ ...participant, deployable: participant.provider.deployable }]
      : [],
  );
  for (const participant of deployable) {
    if (!participant.id) throw new Error("Deployment participant id must not be empty");
  }
  const runtime = deployable.filter((participant) => participant.role === "runtime");
  if (runtime.length > 1)
    throw new Error("Only one runtime deployment participant may be registered");

  const report = options.report ?? (() => undefined);
  const inputs = new DeploymentOutputs();
  inputs.merge(options.initialInputs);
  const context: DeploymentContext = {
    target: options.target,
    repositoryRoot: options.repositoryRoot,
    environment: options.environment ?? process.env,
    persistence: options.persistence ?? noPersistence,
    inputs,
    report,
  };
  const contextFor = (_participant: { role?: DeploymentParticipant["role"] }): DeploymentContext =>
    context;

  for (const participant of deployable) {
    report({ event: "deployment.provider.plan.started", details: { providerId: participant.id } });
    const plan = await participant.deployable.plan(contextFor(participant));
    report({
      event: "deployment.provider.plan.complete",
      details: { providerId: participant.id, summary: plan.summary, steps: plan.steps ?? [] },
    });
  }
  if (options.dryRun) return inputs;

  for (const participant of deployable) {
    if (!participant.deployable.configure) continue;
    report({
      event: "deployment.provider.configure.started",
      details: { providerId: participant.id },
    });
    inputs.merge(await participant.deployable.configure(contextFor(participant)));
    report({
      event: "deployment.provider.configure.complete",
      details: { providerId: participant.id },
    });
  }

  const ordered = [
    ...deployable.filter(
      (participant) => participant.role !== "runtime" && participant.role !== "sandbox",
    ),
    ...deployable.filter((participant) => participant.role === "sandbox"),
    ...runtime,
  ];
  for (const participant of ordered) {
    report({
      event: "deployment.provider.deploy.started",
      details: { providerId: participant.id, role: participant.role ?? "provider" },
    });
    inputs.merge(await participant.deployable.deploy(contextFor(participant)));
    report({
      event: "deployment.provider.deploy.complete",
      details: { providerId: participant.id, role: participant.role ?? "provider" },
    });
  }
  return inputs;
}

function assertUniqueParticipantIds(participants: readonly DeploymentParticipant[]): void {
  const ids = new Set<string>();
  for (const participant of participants) {
    if (!participant.id) throw new Error("Deployment participant id must not be empty");
    if (ids.has(participant.id))
      throw new Error(`Duplicate deployment participant id: ${participant.id}`);
    ids.add(participant.id);
  }
}
