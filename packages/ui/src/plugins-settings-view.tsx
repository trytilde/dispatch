"use client";
import type {
  ChatAgent,
  ResourceScope,
  PluginsCatalog as PluginsCatalogSnapshot,
} from "@tryopenbot/client-runtime";
import { PluginsCatalog, BotSelectionDialog, resolvePluginIconUrl } from "./plugins-catalog.js";
import { ConnectorSetupDialog, type ConnectorSetupSubmit } from "./connector-components.js";
export interface PluginsSettingsViewProps {
  scope?: ResourceScope;
  onScopeChange?: (scope: ResourceScope) => void;
  agents: readonly ChatAgent[];
  kind: "tools" | "skills";
  catalog: PluginsCatalogSnapshot;
  loading: boolean;
  error?: string;
  setup: {
    providerId: string;
    submitting: boolean;
    error?: string;
    authorizationUrl?: string;
  } | null;
  createdAccountId: string | null;
  createdAccountPendingAgentId: string | null;
  onAddToolAccount: (providerId: string) => void;
  onDeleteToolAccounts: (ids: readonly string[]) => Promise<void>;
  onSetSkill: (id: string, agentId: string, enabled: boolean) => Promise<void>;
  onSetToolAccount: (id: string, agentId: string, enabled: boolean) => Promise<void>;
  onCloseSetup: () => void;
  onReopenAuthorization: () => void;
  onSubmitSetup: (input: ConnectorSetupSubmit) => void;
  onCloseAssignment: () => void;
  onAssignAccount: (agentId: string) => void;
}
export function PluginsSettingsView({
  scope,
  onScopeChange,
  agents,
  kind,
  catalog,
  loading,
  error,
  setup,
  createdAccountId,
  createdAccountPendingAgentId,
  onAddToolAccount,
  onDeleteToolAccounts,
  onSetSkill,
  onSetToolAccount,
  onCloseSetup,
  onReopenAuthorization,
  onSubmitSetup,
  onCloseAssignment,
  onAssignAccount,
}: PluginsSettingsViewProps) {
  const setupProvider = setup
    ? catalog.tools.find(({ provider }) => provider.type_id === setup.providerId)?.provider
    : undefined;
  const setupProviderIconUrl = setupProvider
    ? resolvePluginIconUrl(
        setupProvider.icon_url,
        setupProvider.icon_slug,
        setupProvider.type_id,
        setupProvider.name,
      )
    : undefined;

  return (
    <>
      <PluginsCatalog
        scope={scope}
        onScopeChange={onScopeChange}
        agents={agents.map((agent) => ({ id: agent.id, name: agent.display_name }))}
        kind={kind}
        toolProviders={catalog.tools
          .filter(({ provider }) => !provider.categories?.includes("system"))
          .map(({ provider, accounts }) => ({
            id: provider.type_id,
            name: provider.name,
            description: provider.documentation ?? "",
            categories: provider.categories ?? [],
            ...(provider.icon_url ? { iconUrl: provider.icon_url } : {}),
            ...(provider.icon_slug ? { iconKey: provider.icon_slug } : {}),
            canAddAccount: provider.can_add_account ?? true,
            accounts: accounts.map((account) => ({
              id: account.id,
              accountName: account.display_name,
              personalUserId: account.personal_user_id ?? undefined,
              assignedAgentIds: account.assigned_agent_ids,
              enabledForPersonal: account.enabled_for_personal,
            })),
          }))}
        skillProviders={catalog.skills.map((provider) => ({
          id: provider.id,
          name: provider.name,
          description: provider.description,
          categories: provider.categories,
          ...(provider.icon_url ? { iconUrl: provider.icon_url } : {}),
          ...(provider.icon_key ? { iconKey: provider.icon_key } : {}),
          skills: provider.skills.map((skill) => ({
            id: skill.id,
            personalUserId: skill.personal_user_id ?? undefined,
            name: skill.name,
            description: skill.description,
            assignedAgentIds: skill.assigned_agent_ids,
            enabledForPersonal: skill.enabled_for_personal,
          })),
        }))}
        loading={loading}
        {...(error ? { error } : {})}
        onAddToolAccount={onAddToolAccount}
        onDeleteToolAccounts={onDeleteToolAccounts}
        onSetSkill={onSetSkill}
        onSetToolAccount={onSetToolAccount}
      />
      {setup && setupProvider ? (
        <ConnectorSetupDialog
          providerName={setupProvider.name}
          {...(setupProviderIconUrl ? { providerIconUrl: setupProviderIconUrl } : {})}
          credentialSources={setupProvider.credential_sources.map((source) => ({
            typeId: source.type_id,
            name: source.name,
            requiresBrokering: source.requires_brokering,
            ...(source.documentation ? { documentation: source.documentation } : {}),
            supportsAutoDisplayName: source.supports_auto_display_name ?? false,
            ...(source.display_name_description
              ? { displayNameDescription: source.display_name_description }
              : {}),
            resourceServerSchema: source.resource_server_schema,
            userCredentialSchema: source.user_credential_schema,
          }))}
          submitting={setup.submitting}
          {...(setup.error ? { error: setup.error } : {})}
          {...(setup.authorizationUrl ? { authorizationUrl: setup.authorizationUrl } : {})}
          onClose={onCloseSetup}
          onReopenAuthorization={onReopenAuthorization}
          onSubmit={onSubmitSetup}
        />
      ) : null}
      <BotSelectionDialog
        agents={agents.map((agent) => ({ id: agent.id, name: agent.display_name }))}
        onClose={onCloseAssignment}
        onSelect={onAssignAccount}
        open={createdAccountId !== null}
        pendingAgentIds={createdAccountPendingAgentId ? [createdAccountPendingAgentId] : []}
        title="Add account to bot"
      />
    </>
  );
}
