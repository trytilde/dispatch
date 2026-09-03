import { createHash } from "node:crypto";
import type { AgentProvider } from "@trytilde/dispatch-agent-provider";
import type { AuthProvider } from "@trytilde/dispatch-auth-provider";
import type { AgentServiceProvider } from "@trytilde/dispatch-agent-service-provider";
import type { ComputerProvider } from "@trytilde/dispatch-computer-service-provider";
import type { ControlServiceProvider } from "@trytilde/dispatch-control-service-provider";
import type { GitProvider } from "@trytilde/dispatch-git-provider";
import type { InferenceProvider } from "@trytilde/dispatch-inference-provider";

export interface ProviderPluginManifest {
  readonly id: string;
  readonly registrations: readonly unknown[];
}

export interface DispatchProviders {
  auth: AuthProvider;
  controlService: ControlServiceProvider;
  agentService: AgentServiceProvider;
  agent: AgentProvider;
  computer: ComputerProvider;
  inference?: InferenceProvider;
  git?: GitProvider;
}

export interface DispatchConfiguration {
  providers: DispatchProviders;
}

export type SopsOwnerIdentityConfiguration =
  | { kind: "onepassword"; reference: string }
  | { kind: "native-keychain"; platform: "darwin" | "linux" }
  | { kind: "aws-profile"; profile?: string }
  | { kind: "gcp-kms" }
  | { kind: "azure-key-vault" }
  | { kind: "vault-transit" }
  | { kind: "managed-file"; path: string };

/** User-local Dispatch settings. Stored in the gitignored root local-user-config.json. */
export interface UserConfiguration {
  version: 1;
  sops?: {
    ownerIdentity?: SopsOwnerIdentityConfiguration;
  };
}

export interface RepositoryManifest {
  configuration: DispatchConfiguration;
  providerPlugins: readonly ProviderPluginManifest[];
  files: Readonly<Record<string, string>>;
  digest: string;
}

export function Configuration(configuration: DispatchConfiguration): DispatchConfiguration {
  return configuration;
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
