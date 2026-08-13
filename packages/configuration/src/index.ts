import { createHash } from "node:crypto";
import type { AgentProvider } from "@openbot/agent-provider";
import type { ComputerProvider } from "@openbot/computer-provider";
import type { InferenceModelProvider } from "@openbot/inference-model-provider";
import type { Buildable, Deployable, InitializableProvider } from "@openbot/runtime-provider";
import type { SkillProvider } from "@openbot/skills-provider";
import type { ToolProvider } from "@openbot/tools-provider";

export interface ProviderPluginManifest {
  readonly id: string;
  readonly registrations: readonly unknown[];
}

export type ServiceProvider = Buildable & Deployable & InitializableProvider;

export interface OpenBotProviders {
  controlService: ServiceProvider;
  agentService: ServiceProvider;
  agent: AgentProvider;
  computer: ComputerProvider;
  inferenceModel: InferenceModelProvider;
  skills: SkillProvider;
  tools: ToolProvider;
}

export type AgentRuntimeProviders = Pick<
  OpenBotProviders,
  "agent" | "computer" | "inferenceModel" | "skills" | "tools"
>;

export interface OpenBotConfiguration {
  providers: OpenBotProviders;
}

export interface RepositoryManifest {
  configuration: OpenBotConfiguration;
  providerPlugins: readonly ProviderPluginManifest[];
  files: Readonly<Record<string, string>>;
  digest: string;
}

export function Configuration(configuration: OpenBotConfiguration): OpenBotConfiguration {
  return configuration;
}

export function RuntimeProviders(providers: AgentRuntimeProviders): AgentRuntimeProviders {
  return providers;
}

export function repositoryDigest(files: Readonly<Record<string, string>>): string {
  const hash = createHash("sha256");
  for (const [path, content] of Object.entries(files).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    hash.update(path).update("\0").update(content).update("\0");
  }
  return hash.digest("hex");
}
