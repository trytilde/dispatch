import { configFetch, configHeaders, type NormalizedConfig } from "./config";

export interface IdentityIdentifier {
  namespace: string;
  value: string;
}
export interface RuntimeIdentity {
  id: string;
  org_id: string;
  kind: "human" | "agent";
  display_name: string | null;
  disabled: boolean;
  identifiers: IdentityIdentifier[];
}
export interface RuntimeIdentityTeam {
  identity_id: string;
  org_id: string;
  team_id: string;
  role: string;
}
export interface CreateIdentityInput {
  kind?: "human" | "agent";
  displayName?: string;
  identifiers?: IdentityIdentifier[];
}
export interface UpdateIdentityInput {
  displayName?: string;
  disabled?: boolean;
  identifiers?: IdentityIdentifier[];
}
export interface LinkIdentityInput {
  identityId: string;
  returnUrl?: string;
  delivery?: { type: "email"; address: string };
}

/** HTTP failure with a stable status for provisioning conflict/retry handling. */
export class IdentityApiError extends Error {
  constructor(public readonly status: number) {
    super(`Tilde identity operation failed (${status})`);
    this.name = "IdentityApiError";
  }
}

/** Organization-scoped identity provisioning and managed account linking. */
export class IdentitiesClient {
  constructor(private readonly config: NormalizedConfig) {}

  async get(identityId: string): Promise<RuntimeIdentity> {
    return this.request(
      `/api/v1/identity/identities/${encodeURIComponent(identityId)}`,
      undefined,
      "GET",
    );
  }

  async list(offset = 0): Promise<RuntimeIdentity[]> {
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new TypeError("offset must be a nonnegative integer");
    return this.request(`/api/v1/identity/identities?offset=${offset}`, undefined, "GET");
  }

  async update(identityId: string, input: UpdateIdentityInput): Promise<RuntimeIdentity> {
    return this.request(
      `/api/v1/identity/identities/${encodeURIComponent(identityId)}`,
      {
        display_name: input.displayName,
        disabled: input.disabled,
        identifiers: input.identifiers ?? [],
      },
      "PATCH",
    );
  }

  async listTeams(identityId: string, offset = 0): Promise<RuntimeIdentityTeam[]> {
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new TypeError("offset must be a nonnegative integer");
    return this.request(
      `/api/v1/identity/identities/${encodeURIComponent(identityId)}/teams?offset=${offset}`,
      undefined,
      "GET",
    );
  }

  /** Add runtime membership only; this cannot grant account administration. */
  async addTeam(identityId: string, teamId: string): Promise<RuntimeIdentityTeam> {
    return this.request(
      `/api/v1/identity/identities/${encodeURIComponent(identityId)}/teams/${encodeURIComponent(teamId)}`,
      undefined,
      "PUT",
    );
  }

  async removeTeam(identityId: string, teamId: string): Promise<void> {
    await this.request(
      `/api/v1/identity/identities/${encodeURIComponent(identityId)}/teams/${encodeURIComponent(teamId)}`,
      undefined,
      "DELETE",
    );
  }

  async removeIdentifier(
    identityId: string,
    identifier: IdentityIdentifier,
  ): Promise<RuntimeIdentity> {
    return this.request(
      `/api/v1/identity/identities/${encodeURIComponent(identityId)}/identifiers`,
      identifier,
      "DELETE",
    );
  }

  async create(input: CreateIdentityInput): Promise<RuntimeIdentity> {
    return this.request("/api/v1/identity/identities", {
      kind: input.kind ?? "human",
      display_name: input.displayName,
      identifiers: input.identifiers ?? [],
    });
  }

  async link(input: LinkIdentityInput): Promise<{ id: string; url: string; expires_at: string }> {
    return this.request(
      `/api/v1/identity/identities/${encodeURIComponent(input.identityId)}/link-requests`,
      {
        return_url: input.returnUrl,
        delivery: input.delivery,
      },
    );
  }

  async resolve(identifier: IdentityIdentifier): Promise<RuntimeIdentity> {
    return this.request("/api/v1/identity/identities/resolve", identifier);
  }

  async provisionTeam(
    identityId: string,
    name: string,
  ): Promise<{ org_id: string; team_id: string; identity_id: string }> {
    return this.request(`/api/v1/identity/identities/${encodeURIComponent(identityId)}/team`, {
      name,
    });
  }

  private async request<T>(path: string, body: unknown, method = "POST"): Promise<T> {
    if (this.config.identityId || new Headers(this.config.headers).has("x-tilde-identity-id")) {
      throw new TypeError("Identity administration requires an unbound application client");
    }
    const headers = configHeaders(this.config);
    headers.set("content-type", "application/json");
    const response = await configFetch(this.config)(new URL(path, this.config.baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new IdentityApiError(response.status);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}
