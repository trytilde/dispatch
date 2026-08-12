export const deploymentPhases = ["prepare", "configure", "release"] as const;

export type DeploymentPhase = typeof deploymentPhases[number];
export type DeploymentTarget = "preview" | "production";

export interface DeploymentEvent {
  event: string;
  details?: Readonly<Record<string, unknown>>;
}

export type DeploymentReporter = (event: DeploymentEvent) => void;

/** Shared, in-memory outputs. Providers must never report secret values. */
export class DeploymentOutputs {
  readonly #values = new Map<string, string>();
  readonly #runtimeEnvironment = new Map<string, { value: string; sensitive: boolean }>();

  set(name: string, value: string): void {
    if (!name || !value) throw new Error("Deployment output names and values must not be empty");
    this.#values.set(name, value);
  }

  get(name: string): string | undefined {
    return this.#values.get(name);
  }

  require(name: string): string {
    const value = this.get(name);
    if (!value) throw new Error(`Required deployment output is unavailable: ${name}`);
    return value;
  }

  setRuntimeEnvironment(name: string, value: string, options: { sensitive?: boolean } = {}): void {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`Invalid runtime environment variable name: ${name}`);
    if (!value) throw new Error(`Runtime environment variable must not be empty: ${name}`);
    this.#runtimeEnvironment.set(name, { value, sensitive: options.sensitive ?? true });
  }

  runtimeEnvironment(): readonly { name: string; value: string; sensitive: boolean }[] {
    return [...this.#runtimeEnvironment].map(([name, entry]) => ({ name, ...entry }));
  }
}

export interface ProviderDeployContext {
  phase: DeploymentPhase;
  target: DeploymentTarget;
  dryRun: boolean;
  repositoryRoot: string;
  environment: NodeJS.ProcessEnv;
  outputs: DeploymentOutputs;
  report: DeploymentReporter;
}

/** Optional lifecycle hook shared by every provider domain. */
export interface DeployableProvider {
  deploy?(context: ProviderDeployContext): Promise<void>;
}

export interface DeploymentParticipant {
  /** One owner per deployable unit, regardless of how many adapters use it. */
  id: string;
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
  const unique = new Map<string, DeployableProvider>();
  for (const participant of participants) {
    if (!participant.id) throw new Error("Deployment participant id must not be empty");
    if (!participant.provider.deploy || unique.has(participant.id)) continue;
    unique.set(participant.id, participant.provider);
  }

  const outputs = new DeploymentOutputs();
  const report = options.report ?? (() => undefined);
  for (const phase of deploymentPhases) {
    report({ event: "deployment.phase.started", details: { phase } });
    for (const [providerId, provider] of unique) {
      report({ event: "deployment.provider.started", details: { phase, providerId } });
      await provider.deploy!({
        phase,
        target: options.target,
        dryRun: options.dryRun,
        repositoryRoot: options.repositoryRoot,
        environment: options.environment ?? process.env,
        outputs,
        report,
      });
      report({ event: "deployment.provider.complete", details: { phase, providerId } });
    }
    report({ event: "deployment.phase.complete", details: { phase } });
  }
  return outputs;
}
