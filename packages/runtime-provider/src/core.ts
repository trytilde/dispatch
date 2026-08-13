export type DeploymentTarget = "preview" | "production";

export interface DeploymentEvent {
  event: string;
  details?: Readonly<Record<string, unknown>>;
}

export type DeploymentReporter = (event: DeploymentEvent) => void;

export interface DeploymentResult {
  outputs?: Readonly<Record<string, string>>;
  secrets?: Readonly<Record<string, string>>;
  /** Credentials used by deployment participants but never installed in the final runtime. */
  deploymentSecrets?: Readonly<Record<string, string>>;
  /** Secrets consumed only while provisioning the trusted development sandbox. */
  sandboxSecrets?: Readonly<Record<string, string>>;
  environmentVariables?: Readonly<Record<string, string>>;
}

/** A provider-owned software artifact lifecycle. */
export interface Buildable {
  check(context: DeploymentContext): Promise<void>;
  build(context: DeploymentContext): Promise<DeploymentResult | void>;
}

export type InitializationValueDestination = "environment" | "secret" | "deployment-secret";

export interface ProviderInitializationQuestion {
  id: string;
  prompt: string;
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

export interface InitializableProvider {
  readonly initialization?: ProviderInitialization;
}

/** Shared, in-memory deployment data. Secret values must never be reported. */
export class DeploymentOutputs {
  readonly #outputs = new Map<string, string>();
  readonly #secrets = new Map<string, string>();
  readonly #deploymentSecrets = new Map<string, string>();
  readonly #sandboxSecrets = new Map<string, string>();
  readonly #environmentVariables = new Map<string, string>();

  merge(result: DeploymentResult | void): void {
    if (!result) return;
    this.#mergeMap(this.#outputs, result.outputs, "output", false);
    this.#mergeMap(this.#secrets, result.secrets, "secret", true);
    this.#mergeMap(this.#deploymentSecrets, result.deploymentSecrets, "deployment secret", true);
    this.#mergeMap(this.#sandboxSecrets, result.sandboxSecrets, "sandbox secret", true);
    this.#mergeMap(
      this.#environmentVariables,
      result.environmentVariables,
      "environment variable",
      true,
    );
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

  secrets(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.#secrets);
  }

  deploymentSecrets(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.#deploymentSecrets);
  }

  sandboxSecrets(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.#sandboxSecrets);
  }

  environmentVariables(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.#environmentVariables);
  }

  result(): DeploymentResult {
    return {
      outputs: this.outputs(),
      secrets: this.secrets(),
      deploymentSecrets: this.deploymentSecrets(),
      sandboxSecrets: this.sandboxSecrets(),
      environmentVariables: this.environmentVariables(),
    };
  }

  #mergeMap(
    target: Map<string, string>,
    values: Readonly<Record<string, string>> | undefined,
    kind: string,
    environmentName: boolean,
  ): void {
    for (const [name, value] of Object.entries(values ?? {})) {
      if (!name || !value) throw new Error(`Deployment ${kind} names and values must not be empty`);
      if (environmentName && !/^[A-Z][A-Z0-9_]*$/.test(name))
        throw new Error(`Invalid ${kind} name: ${name}`);
      const existing = target.get(name);
      if (existing !== undefined && existing !== value)
        throw new Error(`Conflicting deployment ${kind}: ${name}`);
      target.set(name, value);
    }
  }
}

/** Values installed in the trusted development sandbox, including its SOPS identity. */
export function sandboxDeploymentEnvironment(
  inputs: DeploymentOutputs,
): Readonly<Record<string, string>> {
  const values = new Map<string, string>();
  for (const source of [
    inputs.environmentVariables(),
    inputs.secrets(),
    inputs.deploymentSecrets(),
    inputs.sandboxSecrets(),
  ]) {
    for (const [name, value] of Object.entries(source)) {
      const existing = values.get(name);
      if (existing !== undefined && existing !== value)
        throw new Error(`Conflicting sandbox environment value: ${name}`);
      values.set(name, value);
    }
  }
  return Object.fromEntries(values);
}

export interface DeploymentContext {
  target: DeploymentTarget;
  repositoryRoot: string;
  environment: NodeJS.ProcessEnv;
  inputs: DeploymentOutputs;
  report: DeploymentReporter;
}

export interface DeploymentPlan {
  summary: string;
  steps?: readonly string[];
}

/** A provider-owned deployment lifecycle. Configuration is optional. */
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
  initialInputs?: DeploymentResult;
  report?: DeploymentReporter;
}

/** Check and build every opted-in software artifact before deployment begins. */
export async function buildProviders(
  participants: readonly DeploymentParticipant[],
  options: DeploymentRunOptions,
): Promise<DeploymentOutputs> {
  assertUniqueParticipantIds(participants);
  const inputs = new DeploymentOutputs();
  inputs.merge(options.initialInputs);
  const report = options.report ?? (() => undefined);
  const context: DeploymentContext = {
    target: options.target,
    repositoryRoot: options.repositoryRoot,
    environment: options.environment ?? process.env,
    inputs,
    report,
  };

  for (const participant of participants) {
    const buildable = participant.provider.buildable;
    if (!buildable) continue;
    const scopedContext =
      participant.role === "sandbox"
        ? context
        : { ...context, inputs: withoutSandboxSecrets(inputs) };
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

  const inputs = new DeploymentOutputs();
  inputs.merge(options.initialInputs);
  const report = options.report ?? (() => undefined);
  const context: DeploymentContext = {
    target: options.target,
    repositoryRoot: options.repositoryRoot,
    environment: options.environment ?? process.env,
    inputs,
    report,
  };
  const contextFor = (participant: { role?: DeploymentParticipant["role"] }): DeploymentContext =>
    participant.role === "sandbox"
      ? context
      : { ...context, inputs: withoutSandboxSecrets(inputs) };

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

function withoutSandboxSecrets(inputs: DeploymentOutputs): DeploymentOutputs {
  const scoped = new DeploymentOutputs();
  scoped.merge({
    outputs: inputs.outputs(),
    secrets: inputs.secrets(),
    deploymentSecrets: inputs.deploymentSecrets(),
    environmentVariables: inputs.environmentVariables(),
  });
  return scoped;
}
