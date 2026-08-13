import { createOpenAI } from "@ai-sdk/openai";
import type { InferenceModelProvider } from "./core.js";
import { wrapLanguageModel } from "ai";
import { OPENAI_PROMPT_PART, requireCredentialValue, requireModelName } from "./openai-shared.js";

const OPENAI_CHATGPT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const OPENAI_AUTH_CLAIM = "https://api.openai.com/auth";

export interface OpenAIOAuthCredential {
  accessToken: string;
  accountId?: string;
}

export interface OpenAIOAuthInferenceModelProviderOptions {
  credential:
    | OpenAIOAuthCredential
    | (() => OpenAIOAuthCredential | Promise<OpenAIOAuthCredential>);
  fetch?: typeof globalThis.fetch;
}

/**
 * OpenAI ChatGPT/Codex subscription inference.
 * OAuth acquisition, persistence, and refresh remain outside this provider.
 */
export class OpenAIOAuthInferenceModelProvider implements InferenceModelProvider {
  readonly #openai: ReturnType<typeof createOpenAI>;

  constructor(options: OpenAIOAuthInferenceModelProviderOptions) {
    const resolveCredential =
      typeof options.credential === "function"
        ? options.credential
        : () => options.credential as OpenAIOAuthCredential;
    const transport = options.fetch ?? globalThis.fetch;
    this.#openai = createOpenAI({
      apiKey: "oauth-token-resolved-per-request",
      baseURL: OPENAI_CHATGPT_CODEX_BASE_URL,
      name: "openai.chatgpt",
      fetch: async (input, init) => {
        const credential = await resolveCredential();
        const accessToken = requireCredentialValue(
          credential.accessToken,
          "OpenAI OAuth access token",
        );
        const accountId = credential.accountId?.trim() || openAIChatGPTAccountId(accessToken);
        if (!accountId) {
          throw new Error("OpenAI OAuth credential is missing its ChatGPT account ID");
        }
        const headers = new Headers(init?.headers);
        headers.set("authorization", `Bearer ${accessToken}`);
        headers.set("chatgpt-account-id", accountId);
        headers.set("originator", "openbot");
        headers.set("openai-beta", "responses=experimental");
        return transport(input, { ...init, headers });
      },
    });
  }

  model(name: string) {
    return wrapLanguageModel({
      model: this.#openai.responses(requireModelName(name)),
      middleware: {
        specificationVersion: "v3",
        transformParams: async ({ params }) => ({
          ...params,
          providerOptions: {
            ...params.providerOptions,
            openai: {
              ...params.providerOptions?.openai,
              store: false,
            },
          },
        }),
      },
    });
  }

  injectPromptPart() {
    return OPENAI_PROMPT_PART;
  }
}

export function openAIChatGPTAccountId(accessToken: string): string | undefined {
  const payload = decodeJwtPayload(accessToken);
  const auth = payload?.[OPENAI_AUTH_CLAIM];
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) return undefined;
  const accountId = (auth as Record<string, unknown>).chatgpt_account_id;
  return typeof accountId === "string" && accountId.trim() ? accountId.trim() : undefined;
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
