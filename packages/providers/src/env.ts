import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { EnvEntry, EnvProvider, ProviderCallContext } from "@openbot/provider-sdk";
import { ProviderError } from "@openbot/provider-sdk";

type StoredEnvironment = {
  version: 1;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

type VercelEnvironmentRecord = {
  id: string;
  key: string;
  value?: string;
  type: string;
  updatedAt?: number;
};

const managedPrefix = "OPENBOT_";

export class LocalEncryptedEnvProvider implements EnvProvider {
  readonly descriptor = {
    id: "local-encrypted-env",
    version: "1.0.0",
    displayName: "Local encrypted environment",
    kind: "environment" as const,
    capabilities: ["read", "write", "delete", "encrypted-at-rest"] as const,
  };

  readonly #path: string;
  #writeQueue = Promise.resolve();

  constructor(path = process.env.OPENBOT_LOCAL_ENV_FILE ?? ".data/openbot-env.json") {
    this.#path = resolve(path);
  }

  async health(_context: ProviderCallContext) {
    return setupCode()
      ? { healthy: true }
      : { healthy: false, message: "OPENBOT_SETUP_CODE is required" };
  }

  async get(name: string, _context: ProviderCallContext): Promise<string | undefined> {
    const stored = await this.#read();
    return stored[name] ?? process.env[name];
  }

  async list(prefix = managedPrefix, _context: ProviderCallContext): Promise<readonly EnvEntry[]> {
    const stored = await this.#read();
    const names = new Set([
      ...Object.keys(stored),
      ...Object.keys(process.env).filter((name) => name.startsWith(prefix ?? "")),
    ]);
    return [...names]
      .filter((name) => !prefix || name.startsWith(prefix))
      .sort()
      .map((name) => ({ name, sensitive: true }));
  }

  async set(
    name: string,
    value: string,
    _options: { sensitive?: boolean },
    _context: ProviderCallContext,
  ): Promise<void> {
    validateName(name);
    await this.#mutate((values) => ({ ...values, [name]: value }));
    process.env[name] = value;
  }

  async delete(name: string, _context: ProviderCallContext): Promise<void> {
    validateName(name);
    await this.#mutate((values) => {
      const next = { ...values };
      delete next[name];
      return next;
    });
    delete process.env[name];
  }

  async #mutate(update: (values: Record<string, string>) => Record<string, string>): Promise<void> {
    const operation = this.#writeQueue.then(async () => {
      const values = update(await this.#read());
      const encoded = encryptJson(values, setupCodeRequired());
      await mkdir(dirname(this.#path), { recursive: true });
      const temporary = `${this.#path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(encoded)}\n`, { mode: 0o600 });
      await rename(temporary, this.#path);
    });
    this.#writeQueue = operation.catch(() => undefined);
    await operation;
  }

  async #read(): Promise<Record<string, string>> {
    let raw: string;
    try {
      raw = await readFile(this.#path, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return {};
      throw error;
    }
    try {
      return decryptJson(JSON.parse(raw) as StoredEnvironment, setupCodeRequired());
    } catch (error) {
      throw new ProviderError(
        "invalid_configuration",
        `The local environment store could not be decrypted: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}

export class VercelProjectEnvProvider implements EnvProvider {
  readonly descriptor = {
    id: "vercel-project-env",
    version: "1.0.0",
    displayName: "Vercel project environment",
    kind: "environment" as const,
    capabilities: ["read", "write", "delete", "encrypted-at-rest", "project-scoped"] as const,
  };

  readonly #token: string;
  readonly #projectId: string;
  readonly #teamId?: string;
  readonly #target: string;

  constructor(
    options: { token?: string; projectId?: string; teamId?: string; target?: string } = {},
  ) {
    this.#token =
      options.token ?? process.env.OPENBOT_VERCEL_API_TOKEN ?? process.env.VERCEL_TOKEN ?? "";
    this.#projectId =
      options.projectId ??
      process.env.OPENBOT_VERCEL_PROJECT_ID ??
      process.env.VERCEL_PROJECT_ID ??
      "";
    this.#teamId = options.teamId ?? process.env.OPENBOT_VERCEL_TEAM_ID;
    this.#target = options.target ?? process.env.VERCEL_TARGET_ENV ?? "production";
  }

  async health(_context: ProviderCallContext) {
    if (!this.#token || !this.#projectId) {
      return { healthy: false, message: "Vercel API token and project ID are required" };
    }
    try {
      await this.#records();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : "Vercel environment API failed",
      };
    }
  }

  async get(name: string, _context: ProviderCallContext): Promise<string | undefined> {
    const record = (await this.#records()).find((candidate) => candidate.key === name);
    if (!record) return process.env[name];
    const response = await this.#request(
      `/v1/projects/${encodeURIComponent(this.#projectId)}/env/${encodeURIComponent(record.id)}`,
    );
    const decrypted = (await response.json()) as VercelEnvironmentRecord & {
      decrypted?: boolean;
    };
    return decrypted.value ?? process.env[name];
  }

  async list(prefix = managedPrefix, _context: ProviderCallContext): Promise<readonly EnvEntry[]> {
    return (await this.#records())
      .filter((record) => !prefix || record.key.startsWith(prefix))
      .map((record) => ({
        name: record.key,
        sensitive: record.type === "encrypted" || record.type === "sensitive",
        ...(record.updatedAt ? { updatedAt: new Date(record.updatedAt) } : {}),
      }));
  }

  async set(
    name: string,
    value: string,
    options: { sensitive?: boolean },
    _context: ProviderCallContext,
  ): Promise<void> {
    validateName(name);
    await this.#request(`/v10/projects/${encodeURIComponent(this.#projectId)}/env?upsert=true`, {
      method: "POST",
      body: JSON.stringify({
        key: name,
        value,
        // `sensitive` values cannot be decrypted by a later serverless invocation.
        // Vercel `encrypted` values remain encrypted at rest and are readable only
        // through an authorized project API request.
        type: options.sensitive === false ? "plain" : "encrypted",
        target: [this.#target],
      }),
    });
    process.env[name] = value;
  }

  async delete(name: string, _context: ProviderCallContext): Promise<void> {
    const record = (await this.#records()).find((candidate) => candidate.key === name);
    if (!record) return;
    await this.#request(
      `/v10/projects/${encodeURIComponent(this.#projectId)}/env/${encodeURIComponent(record.id)}`,
      { method: "DELETE" },
    );
    delete process.env[name];
  }

  async #records(): Promise<VercelEnvironmentRecord[]> {
    const response = await this.#request(
      `/v10/projects/${encodeURIComponent(this.#projectId)}/env?target=${encodeURIComponent(this.#target)}`,
    );
    const body = (await response.json()) as { envs?: VercelEnvironmentRecord[] };
    return body.envs ?? [];
  }

  async #request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.#token || !this.#projectId) {
      throw new ProviderError(
        "invalid_configuration",
        "Vercel API token and project ID are required",
      );
    }
    const url = new URL(path, "https://api.vercel.com");
    if (this.#teamId) url.searchParams.set("teamId", this.#teamId);
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.#token}`,
        "content-type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProviderError(
        "provider_unavailable",
        `Vercel environment API failed (${response.status})`,
        response.status >= 500,
      );
    }
    return response;
  }
}

let environmentProvider: EnvProvider | undefined;

export function defaultEnvProvider(): EnvProvider {
  environmentProvider ??= process.env.VERCEL
    ? new VercelProjectEnvProvider()
    : new LocalEncryptedEnvProvider();
  return environmentProvider;
}

export function resetDefaultEnvProviderForTests(): void {
  environmentProvider = undefined;
}

function setupCode(): string | undefined {
  return process.env.OPENBOT_SETUP_CODE?.trim() || undefined;
}

function setupCodeRequired(): string {
  const value = setupCode();
  if (!value) throw new ProviderError("invalid_configuration", "OPENBOT_SETUP_CODE is required");
  return value;
}

function validateName(name: string): void {
  if (!/^[A-Z][A-Z0-9_]{0,255}$/.test(name)) {
    throw new ProviderError("invalid_configuration", `Invalid environment variable name: ${name}`);
  }
}

function encryptJson(values: Record<string, string>, code: string): StoredEnvironment {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(code, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("openbot/local-env/v1"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
  return {
    version: 1,
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

function decryptJson(envelope: StoredEnvironment, code: string): Record<string, string> {
  if (envelope.version !== 1) throw new Error("Unsupported environment store version");
  const key = scryptSync(code, Buffer.from(envelope.salt, "base64url"), 32);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
  decipher.setAAD(Buffer.from("openbot/local-env/v1"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid environment store payload");
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
