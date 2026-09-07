import { createTildePluginsClient } from "./tilde-plugins.js";
import { z } from "zod";
import type { ProviderSetupTransport } from "./provider-setup.js";
const object = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown) => (typeof value === "string" ? value : "");
const itemSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  credential_source_type_id: z.string(),
  status: z.string(),
});
type RequestJson = (path: string, init?: RequestInit) => Promise<unknown>;
/** Native provider + managed-credential operations share one continuation adapter. */
export function createNativeConnectorSetupTransport(
  request: RequestJson,
  getTeamId: () => string | undefined,
): ProviderSetupTransport {
  const managed = new Map<string, { accountId: string; url: string }>();
  const personal = new Map<string, { userId: string; accountId: string; url: string }>();
  const secretOutputs = new Map<string, Record<string, unknown>>();
  const credentials = new Map<
    string,
    { item: z.infer<typeof itemSchema>; action: Record<string, unknown> }
  >();
  const resources = new Map<string, { id: string; status?: string }>();
  const post = async (path: string, body: unknown, signal: AbortSignal) => {
    signal.throwIfAborted();
    const result = await request(`/api/tilde/user-tools/${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    });
    signal.throwIfAborted();
    return result;
  };
  async function findCredentialItem(ownerId: string, signal: AbortSignal) {
    let cursor = "";
    const seen = new Set<string>();
    do {
      signal.throwIfAborted();
      const suffix = cursor ? `?next_page_token=${encodeURIComponent(cursor)}` : "";
      const page = object(
        await request(`/api/tilde/user-tools/credential/setup-items${suffix}`, { signal }),
      );
      signal.throwIfAborted();
      const item = z
        .array(itemSchema)
        .parse(page.items)
        .find((item) => item.owner_id === ownerId);
      if (item) return item;
      cursor = string(page.next_page_token);
      if (cursor && seen.has(cursor))
        throw new Error("Credential setup pagination did not advance.");
      seen.add(cursor);
    } while (cursor);
    return undefined;
  }
  async function credentialStep(
    id: string,
    returnUrl: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const raw = object(
      await post(
        `credential/setup-items/${encodeURIComponent(id)}/start`,
        { return_url: returnUrl },
        signal,
      ),
    );
    const item = itemSchema.parse(raw.item);
    const action = object(raw.next_action);
    credentials.set(id, { item, action });
    return {
      setup_id: `credential:${id}`,
      resource: { id: item.owner_id, status: item.status },
      next_action: Object.keys(action).length ? action : { type: "complete" },
    };
  }
  async function normalize(
    value: unknown,
    returnUrl: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const raw = object(value),
      action = object(raw.next_action),
      resource = object(raw.resource);
    const setupId = string(raw.setup_id);
    if (action.type === "download_secret_outputs" && setupId) {
      const outputs = object(raw.outputs);
      secretOutputs.set(setupId, outputs);
      signal.addEventListener("abort", () => secretOutputs.delete(setupId), { once: true });
      if (typeof outputs.tool_group_instance_id === "string")
        resource.id = outputs.tool_group_instance_id;
    }
    if (setupId && typeof resource.id === "string")
      resources.set(setupId, { id: resource.id, status: string(resource.status) });
    if (action.type === "configure_credential")
      return credentialStep(string(action.setup_item_id), returnUrl, signal);
    // Some native MCP setup providers return a pending resource with a complete action.
    if (
      action.type === "complete" &&
      resource.tool_group_source_type_id &&
      resource.id &&
      resource.status &&
      resource.status !== "active"
    ) {
      const item = await findCredentialItem(string(resource.id), signal);
      if (!item) throw new Error("Provider setup has not returned a credential continuation.");
      return credentialStep(item.id, returnUrl, signal);
    }
    return {
      setup_id: raw.setup_id,
      next_action: action,
      resource: resource.id ? { id: resource.id, status: resource.status } : resources.get(setupId),
    };
  }
  async function personalStep(key: string, signal: AbortSignal) {
    const continuation = personal.get(key);
    if (!continuation) throw new Error("This personal setup has expired. Reopen it.");
    const account = z
      .object({ id: z.string(), status: z.string() })
      .parse(
        await request(
          `/api/tilde/user-tools/personal/${encodeURIComponent(continuation.userId)}/mcp/tool-group/${encodeURIComponent(continuation.accountId)}`,
          { signal },
        ),
      );
    signal.throwIfAborted();
    if (["error", "disabled", "failed"].includes(account.status))
      throw new Error("Personal account authorization failed. Reopen setup to retry.");
    return {
      setup_id: key,
      resource: account,
      next_action:
        account.status === "active"
          ? { type: "complete" }
          : { type: "redirect", url: continuation.url },
    };
  }
  return {
    cancel() {
      managed.clear();
      personal.clear();
      credentials.clear();
      resources.clear();
      secretOutputs.clear();
    },
    consumeSecretOutputs(setupId) {
      const outputs = secretOutputs.get(setupId);
      secretOutputs.delete(setupId);
      return outputs;
    },
    async start(input, signal) {
      managed.clear();
      personal.clear();
      credentials.clear();
      resources.clear();
      secretOutputs.clear();
      if (!input.resourceId && input.providerId.startsWith("managed_mcp:")) {
        const client = createTildePluginsClient(async (path, init) => {
          signal.throwIfAborted();
          if (path === "/auth/session") return { tilde: { team_id: getTeamId() } };
          const result = await request(path.replace("/api/tilde/", "/api/tilde/user-tools/"), {
            ...init,
            signal,
          });
          signal.throwIfAborted();
          return result;
        });
        const result = await client.createNativeConnectorAccount({
          providerTypeId: input.providerId,
          credentialSourceTypeId: input.authMethodId ?? "",
          displayName: string(input.formValues?.displayName),
          resourceServerValues: input.formValues,
          returnUrl: input.returnUrl,
        });
        const key = `managed:${result.account.id}`;
        if (result.status === "authorize") {
          if (!result.authorization_url)
            throw new Error("Provider setup did not return an authorization URL.");
          managed.set(key, { accountId: result.account.id, url: result.authorization_url });
        }
        return {
          setup_id: key,
          resource: { id: result.account.id, status: result.account.status },
          next_action:
            result.status === "authorize"
              ? { type: "redirect", url: result.authorization_url }
              : { type: "complete" },
        };
      }
      personal.clear();
      credentials.clear();
      resources.clear();
      secretOutputs.clear();
      if (input.personalUserId && input.resourceId) {
        const key = `personal:${input.resourceId}`;
        const account = z
          .object({
            id: z.string(),
            status: z.string(),
            tool_group_source_type_id: z.string(),
            credential_source_type_id: z.string(),
          })
          .parse(
            await request(
              `/api/tilde/user-tools/personal/${encodeURIComponent(input.personalUserId)}/mcp/tool-group/${encodeURIComponent(input.resourceId)}`,
              { signal },
            ),
          );
        if (account.tool_group_source_type_id !== input.providerId)
          throw new Error("The pending account belongs to a different provider.");
        if (account.status === "active")
          return {
            setup_id: key,
            resource: { id: account.id, status: account.status },
            next_action: { type: "complete" },
          };
        // Obtain a fresh authorization URL from Tilde, never from an arbitrary tool payload.
        const response = object(
          await post(
            "provider-setup/start",
            {
              personal: true,
              domain: "mcp",
              provider_id: account.tool_group_source_type_id,
              auth_method_id: account.credential_source_type_id,
              form_values: { id: account.id },
              return_url: input.returnUrl,
            },
            signal,
          ),
        );
        const action = object(response.next_action);
        if (action.type !== "redirect" || typeof action.url !== "string")
          throw new Error("Personal setup did not return an authorization step.");
        personal.set(key, { userId: input.personalUserId, accountId: account.id, url: action.url });
        return {
          setup_id: key,
          resource: { id: account.id, status: account.status },
          next_action: action,
        };
      }
      signal.addEventListener("abort", () => secretOutputs.clear(), { once: true });
      if (input.resourceId) {
        const raw = object(
          await request(
            `/api/tilde/user-tools/mcp/tool-group/${encodeURIComponent(input.resourceId)}`,
            { signal },
          ),
        );
        const account = object(raw.tool_group_instance ?? raw);
        if (
          typeof account.tool_group_source_type_id === "string" &&
          account.tool_group_source_type_id !== input.providerId
        )
          throw new Error("The pending account belongs to a different provider.");
        if (typeof account.team_id === "string" && getTeamId() && account.team_id !== getTeamId())
          throw new Error("The pending account belongs to another workspace.");
        if (account.status === "active")
          return {
            resource: { id: input.resourceId, status: "active" },
            next_action: { type: "complete" },
          };
        const item = await findCredentialItem(input.resourceId, signal);
        if (!item) throw new Error("This account has no credential setup continuation.");
        return credentialStep(item.id, input.returnUrl, signal);
      }
      return normalize(
        await post(
          "provider-setup/start",
          {
            domain: input.domain ?? "mcp",
            provider_id: input.providerId,
            auth_method_id: input.authMethodId,
            form_values: input.formValues ?? {},
            return_url: input.returnUrl,
          },
          signal,
        ),
        input.returnUrl,
        signal,
      );
    },
    async resume(setupId, input, returnUrl, signal) {
      if (setupId.startsWith("managed:")) {
        const continuation = managed.get(setupId);
        if (!continuation) throw new Error("This managed setup has expired. Reopen it.");
        const raw = object(
          await request(
            `/api/tilde/user-tools/mcp/tool-group/${encodeURIComponent(continuation.accountId)}`,
            { signal },
          ),
        );
        const account = z
          .object({ id: z.string(), status: z.string() })
          .parse(raw.tool_group_instance ?? raw);
        signal.throwIfAborted();
        if (["failed", "error", "disabled"].includes(account.status))
          throw new Error("Account authorization failed. Reopen setup to retry.");
        return {
          setup_id: setupId,
          resource: account,
          next_action:
            account.status === "active"
              ? { type: "complete" }
              : { type: "redirect", url: continuation.url },
        };
      }
      if (setupId.startsWith("personal:")) return personalStep(setupId, signal);
      if (!setupId.startsWith("credential:"))
        return normalize(
          await post(
            `provider-setup/${encodeURIComponent(setupId)}/resume`,
            { input, return_url: returnUrl },
            signal,
          ),
          returnUrl,
          signal,
        );
      const id = setupId.slice("credential:".length),
        continuation = credentials.get(id);
      if (!continuation)
        throw new Error("This credential setup is no longer active. Reopen the connector.");
      if (continuation.action.type === "redirect") {
        const item = itemSchema.parse(
          await request(`/api/tilde/user-tools/credential/setup-items/${encodeURIComponent(id)}`, {
            signal,
          }),
        );
        if (item.status === "connected")
          return {
            setup_id: setupId,
            resource: { id: item.owner_id, status: "active" },
            next_action: { type: "complete" },
          };
        return {
          setup_id: setupId,
          resource: { id: item.owner_id, status: item.status },
          next_action: continuation.action,
        };
      }
      if (continuation.action.type === "submit_form") {
        const kind =
          continuation.action.credential_kind === "resource_server_credential"
            ? "resource-server"
            : "user-credential";
        const teamId = getTeamId();
        if (!teamId) throw new Error("Workspace identity is unavailable. Reconnect and try again.");
        const path = `credential/source/${encodeURIComponent(continuation.item.credential_source_type_id)}/${kind}`;
        const dek_alias = `team:${teamId}:default`;
        const encrypted = await post(
          `${path}/encrypt`,
          { dek_alias, value: { ...object(continuation.action.configuration_defaults), ...input } },
          signal,
        );
        const created = object(
          await post(
            path,
            {
              dek_alias,
              metadata: null,
              [kind === "resource-server"
                ? "resource_server_configuration"
                : "user_credential_configuration"]: encrypted,
            },
            signal,
          ),
        );
        await post(
          `credential/setup-items/${encodeURIComponent(id)}/complete`,
          {
            [kind === "resource-server" ? "resource_server_credential_id" : "user_credential_id"]: z
              .string()
              .parse(created.id),
          },
          signal,
        );
      }
      return credentialStep(id, returnUrl, signal);
    },
  };
}
