import { createStore } from "zustand/vanilla";
import { z } from "zod";
import type { ProviderSetupNextAction, ProviderSetupField } from "@trytilde/api-client/generated";
import { errorMessage } from "./errors.js";

export type { ProviderSetupNextAction, ProviderSetupField };
export interface ProviderSetupStartInput {
  providerId: string;
  resourceId?: string;
  personalUserId?: string;
  authorizationUrl?: string;
  domain?: "mcp" | "signals" | "chat" | "chatkit";
  authMethodId?: string;
  formValues?: Record<string, unknown>;
  returnUrl: string;
}
export interface ProviderSetupTransport {
  cancel?(): void;
  consumeSecretOutputs?(setupId: string): Record<string, unknown> | undefined;
  start(input: ProviderSetupStartInput, signal: AbortSignal): Promise<unknown>;
  resume(
    setupId: string,
    input: Record<string, unknown>,
    returnUrl: string,
    signal: AbortSignal,
  ): Promise<unknown>;
}
const field = z.object({
  name: z.string(),
  label: z.string(),
  field_type: z.string(),
  required: z.boolean().optional(),
  help_text: z.string().nullish(),
  placeholder: z.string().nullish(),
});
// Native response projection. Output secrets, resource objects and instruction manifests are
// deliberately stripped; only the next UI action and continuation identity enter memory.
const action: z.ZodType<ProviderSetupNextAction> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("redirect"), url: z.string() }),
  z.object({
    type: z.literal("render_instructions"),
    markdown: z.string(),
    fields: z.array(field).optional(),
  }),
  z.object({ type: z.literal("submit_form"), fields: z.array(field), submit_label: z.string() }),
  z.object({ type: z.literal("configure_credential"), setup_item_id: z.string() }),
  z.object({ type: z.literal("download_secret_outputs") }),
  z.object({
    type: z.literal("complete"),
    message: z.string().nullish(),
    redirect_url: z.string().nullish(),
  }),
]);
export const ProviderSetupProjectionSchema = z.object({
  setup_id: z.string().nullish(),
  next_action: action,
  resource: z.preprocess(
    (value) =>
      value && typeof value === "object" && "id" in value && typeof value.id === "string"
        ? value
        : undefined,
    z.object({ id: z.string(), status: z.string().nullish() }).optional(),
  ),
});
export type ProviderSetupProjection = z.infer<typeof ProviderSetupProjectionSchema>;
export interface ProviderSetupState {
  status: "idle" | "submitting" | "action" | "complete" | "error";
  providerId?: string;
  response?: ProviderSetupProjection;
  error?: string;
}

/** Scoped to the authenticated transport supplied by the host; never persisted. */
export function createProviderSetupWorkflow(transport: ProviderSetupTransport) {
  const store = createStore<ProviderSetupState>(() => ({ status: "idle" }));
  let generation = 0;
  let abort: AbortController | undefined;
  function cancel() {
    generation++;
    abort?.abort();
    transport.cancel?.();
    store.setState({ status: "idle" }, true);
  }
  async function run(
    providerId: string,
    request: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<ProviderSetupProjection | undefined> {
    const current = ++generation;
    abort?.abort();
    abort = new AbortController();
    store.setState({ status: "submitting", providerId, error: undefined });
    try {
      const response = ProviderSetupProjectionSchema.parse(await request(abort.signal));
      if (current !== generation) return undefined;
      store.setState(
        {
          status: response.next_action.type === "complete" ? "complete" : "action",
          providerId,
          response,
        },
        true,
      );
      return response;
    } catch (reason) {
      if (current === generation) store.setState({ status: "error", error: errorMessage(reason) });
      return undefined;
    }
  }
  return {
    store,
    cancel,
    dispose: cancel,
    start(input: ProviderSetupStartInput) {
      if (store.getState().status === "submitting") return Promise.resolve(undefined);
      store.setState({ status: "idle" }, true);
      return run(input.providerId, (signal) => transport.start(input, signal));
    },
    resume(input: Record<string, unknown>, returnUrl: string) {
      const { providerId, response, status } = store.getState();
      if (status === "submitting") return Promise.resolve(undefined);
      if (!providerId || !response?.setup_id) {
        store.setState({ status: "error", error: "This connection has no setup continuation." });
        return Promise.resolve(undefined);
      }
      return run(providerId, (signal) =>
        transport.resume(response.setup_id!, input, returnUrl, signal),
      );
    },
  };
}
