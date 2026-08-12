export type DeploymentTarget = "preview" | "production";

export interface DeploymentEvent {
  event: string;
  details?: Readonly<Record<string, unknown>>;
}

export type DeploymentReporter = (event: DeploymentEvent) => void;

export interface DeploymentResult {
  outputs?: Readonly<Record<string, string>>;
  secrets?: Readonly<Record<string, string>>;
  environmentVariables?: Readonly<Record<string, string>>;
}

/** Shared, in-memory deployment data. Secret values must never be reported. */
export class DeploymentOutputs {
  readonly #outputs = new Map<string, string>();
  readonly #secrets = new Map<string, string>();
  readonly #environmentVariables = new Map<string, string>();

  merge(result: DeploymentResult | void): void {
    if (!result) return;
    this.#mergeMap(this.#outputs, result.outputs, "output", false);
    this.#mergeMap(this.#secrets, result.secrets, "secret", true);
    this.#mergeMap(this.#environmentVariables, result.environmentVariables, "environment variable", true);
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

  environmentVariables(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.#environmentVariables);
  }

  #mergeMap(target: Map<string, string>, values: Readonly<Record<string, string>> | undefined, kind: string, environmentName: boolean): void {
    for (const [name, value] of Object.entries(values ?? {})) {
      if (!name || !value) throw new Error(`Deployment ${kind} names and values must not be empty`);
      if (environmentName && !/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`Invalid ${kind} name: ${name}`);
      const existing = target.get(name);
      if (existing !== undefined && existing !== value) throw new Error(`Conflicting deployment ${kind}: ${name}`);
      target.set(name, value);
    }
  }
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
export interface DeployableProvider {
  readonly deployable?: Deployable;
}

export interface DeploymentParticipant {
  id: string;
  role?: "provider" | "runtime";
  provider: DeployableProvider;
}

export interface DeploymentRunOptions {
  target: DeploymentTarget;
  dryRun: boolean;
  repositoryRoot: string;
  environment?: NodeJS.ProcessEnv;
  report?: DeploymentReporter;
}

export async function deployProviders(
  participants: readonly DeploymentParticipant[],
  options: DeploymentRunOptions,
): Promise<DeploymentOutputs> {
  const deployable = participants.flatMap((participant) => participant.provider.deployable
    ? [{ ...participant, deployable: participant.provider.deployable }]
    : []);
  const ids = new Set<string>();
  for (const participant of deployable) {
    if (!participant.id) throw new Error("Deployment participant id must not be empty");
    if (ids.has(participant.id)) throw new Error(`Duplicate deployment participant id: ${participant.id}`);
    ids.add(participant.id);
  }
  const runtime = deployable.filter((participant) => participant.role === "runtime");
  if (runtime.length > 1) throw new Error("Only one runtime deployment participant may be registered");

  const inputs = new DeploymentOutputs();
  const report = options.report ?? (() => undefined);
  const context: DeploymentContext = {
    target: options.target,
    repositoryRoot: options.repositoryRoot,
    environment: options.environment ?? process.env,
    inputs,
    report,
  };

  for (const participant of deployable) {
    report({ event: "deployment.provider.plan.started", details: { providerId: participant.id } });
    const plan = await participant.deployable.plan(context);
    report({ event: "deployment.provider.plan.complete", details: { providerId: participant.id, summary: plan.summary, steps: plan.steps ?? [] } });
  }
  if (options.dryRun) return inputs;

  for (const participant of deployable) {
    if (!participant.deployable.configure) continue;
    report({ event: "deployment.provider.configure.started", details: { providerId: participant.id } });
    inputs.merge(await participant.deployable.configure(context));
    report({ event: "deployment.provider.configure.complete", details: { providerId: participant.id } });
  }

  const ordered = [
    ...deployable.filter((participant) => participant.role !== "runtime"),
    ...runtime,
  ];
  for (const participant of ordered) {
    report({ event: "deployment.provider.deploy.started", details: { providerId: participant.id, role: participant.role ?? "provider" } });
    inputs.merge(await participant.deployable.deploy(context));
    report({ event: "deployment.provider.deploy.complete", details: { providerId: participant.id, role: participant.role ?? "provider" } });
  }
  return inputs;
}
