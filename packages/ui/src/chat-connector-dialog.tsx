import { resolvePluginIconUrl } from "./plugins-catalog.js";
import type {
  ChatConnectorState,
  ProviderSetupState,
  CreateConnectorAccountInput,
} from "@tryopenbot/client-runtime";
import {
  ConnectorAccountGrid,
  ConnectorSetupDialog,
  type ConnectorSetupSubmit,
} from "./connector-components.js";
import { DialogSurface } from "./overlay-components.js";
import { MarkdownText } from "./markdown-components.js";
export interface ChatConnectorDialogProps {
  accountNameDescription?: string;
  state: ChatConnectorState;
  setup: ProviderSetupState;
  onRetry?: () => void;
  onDownloadOutputs?: () => void;
  onClose: () => void;
  onAddAccount?: () => void;
  onSelectAccount?: (id: string) => void;
  onSelectTarget?: (id: string) => void;
  onSubmit: (input: CreateConnectorAccountInput) => void;
  onResume: (input?: Record<string, unknown>) => void;
  onReopenAuthorization: () => void;
}
export function ChatConnectorDialog({
  accountNameDescription,
  state,
  setup,
  onRetry,
  onDownloadOutputs,
  onClose,
  onAddAccount = () => {},
  onSelectAccount = () => {},
  onSelectTarget = () => {},
  onSubmit,
  onResume,
  onReopenAuthorization,
}: ChatConnectorDialogProps) {
  if (!state.open || !state.selection) return null;
  const selection = state.selection;
  const error = state.error ?? setup.error;
  if (state.loading || !state.provider)
    return (
      <DialogSurface open title={`Enable ${selection.provider_name}`} onClose={onClose}>
        <p role={error ? "alert" : "status"}>{error ?? "Loading provider setup…"}</p>
      </DialogSurface>
    );
  if (state.stage === "target")
    return (
      <DialogSurface
        open
        title="Choose your tools MCP"
        description="Choose where this connector's tools should be enabled."
        onClose={onClose}
      >
        {error ? <p role="alert">{error}</p> : null}
        {state.targets.map((target) => (
          <button
            className="connector-enable-card"
            type="button"
            disabled={state.binding}
            key={target.id}
            onClick={() => onSelectTarget(target.id)}
          >
            {target.name}
          </button>
        ))}
      </DialogSurface>
    );
  if (state.stage === "accounts")
    return (
      <DialogSurface open title={`Enable ${selection.provider_name}`} onClose={onClose}>
        {error ? <p role="alert">{error}</p> : null}
        <ConnectorAccountGrid
          selection={{
            providerTypeId: selection.provider_type_id,
            providerName: selection.provider_name,
            iconUrl: selection.icon_url,
            accounts: selection.accounts.map((account) => ({
              id: account.id,
              displayName: account.display_name,
              status: account.status,
            })),
            credentialSources: [],
          }}
          onAddAccount={onAddAccount}
          onSelectAccount={(account) => onSelectAccount(account.id)}
          busy={state.binding}
        />
      </DialogSurface>
    );
  const action = setup.response?.next_action;
  if (action?.type === "render_instructions" && !action.fields?.length)
    return (
      <DialogSurface
        open
        title={`Enable ${selection.provider_name}`}
        onClose={onClose}
        actions={
          <button type="button" onClick={() => onResume()}>
            Continue
          </button>
        }
      >
        <MarkdownText text={action.markdown} />
        {error ? <p role="alert">{error}</p> : null}
      </DialogSurface>
    );
  if (action?.type === "download_secret_outputs")
    return (
      <DialogSurface
        open
        title={`Finish ${selection.provider_name} setup`}
        onClose={onClose}
        actions={
          <button type="button" disabled={!onDownloadOutputs} onClick={onDownloadOutputs}>
            Download credentials
          </button>
        }
      >
        <p>
          Save the generated provider credentials securely. They are never included in the chat.
        </p>
        {error ? <p role="alert">{error}</p> : null}
      </DialogSurface>
    );
  if (state.request && !action)
    return (
      <DialogSurface
        open
        title={`Enable ${selection.provider_name}`}
        onClose={onClose}
        actions={
          onRetry ? (
            <button type="button" onClick={onRetry}>
              Retry setup
            </button>
          ) : undefined
        }
      >
        <p role="alert">{error ?? "This setup has not returned its next step yet."}</p>
      </DialogSurface>
    );
  const fields =
    action?.type === "submit_form" || action?.type === "render_instructions"
      ? action.fields
      : undefined;
  const sources = fields
    ? [
        {
          typeId: "follow-up",
          name: "Connection details",
          requiresBrokering: false,
          supportsAutoDisplayName: true,
          userCredentialSchema: {
            type: "object",
            required: fields.filter((field) => field.required).map((field) => field.name),
            properties: Object.fromEntries(
              fields.map((field) => [
                field.name,
                {
                  type: field.field_type === "json" ? "object" : "string",
                  title: field.label,
                  description: field.help_text ?? undefined,
                  ...(["password", "secret"].includes(field.field_type)
                    ? { format: "password" }
                    : {}),
                },
              ]),
            ),
          },
        },
      ]
    : state.provider.credential_sources.map((source) => ({
        typeId: source.type_id,
        name: source.name,
        requiresBrokering: source.requires_brokering,
        supportsAutoDisplayName: source.supports_auto_display_name ?? false,
        documentation: source.documentation,
        displayNameDescription: source.display_name_description,
        resourceServerSchema: source.resource_server_schema,
        userCredentialSchema: source.user_credential_schema,
      }));
  const submit = (input: ConnectorSetupSubmit) =>
    fields
      ? onResume({ ...input.resourceServerValues, ...input.userCredentialValues })
      : onSubmit({ ...input, providerTypeId: selection.provider_type_id });
  return (
    <ConnectorSetupDialog
      key={
        fields
          ? `${setup.response?.setup_id}:${fields.map((field) => field.name).join(",")}`
          : "initial"
      }
      hideAccountName={Boolean(fields)}
      submitLabel={
        action?.type === "submit_form"
          ? action.submit_label
          : action?.type === "render_instructions"
            ? "Continue"
            : undefined
      }
      instructions={
        action?.type === "render_instructions" ? <MarkdownText text={action.markdown} /> : undefined
      }
      providerName={selection.provider_name}
      providerIconUrl={resolvePluginIconUrl(
        selection.icon_url ?? state.provider.icon_url,
        state.provider.icon_slug,
        state.provider.type_id,
        state.provider.name,
      )}
      credentialSources={sources}
      accountNameDescription={accountNameDescription}
      submitting={(setup.status === "submitting" && action?.type !== "redirect") || state.binding}
      error={error}
      authorizationUrl={action?.type === "redirect" ? action.url : undefined}
      onReopenAuthorization={onReopenAuthorization}
      onSubmit={submit}
      onFinishAuthorization={() => onResume()}
      onClose={onClose}
    />
  );
}
