import Ajv from "ajv";
import type {
  ChatKitProviderDefinition,
  ProviderContext,
  ProviderDelivery,
  ProviderDeliveryOptions,
  ProviderField,
  ProviderObject,
  ProviderSetupResult,
} from "./types";

const reserved = new Set([
  "sendMessage",
  "listAgents",
  "delegate",
  "waitForResponse",
  "listParticipants",
]);
const bound = new Set([
  "orgid",
  "teamid",
  "definitionid",
  "connectionid",
  "sessionid",
  "agentinboxinstanceid",
  "targetinboxinstanceid",
  "triggermessageid",
  "executionid",
  "idempotencykey",
]);
const schemas = new Ajv({ strict: false, allErrors: true });
const MAX_BODY_BYTES = 1024 * 1024;

/** Protocol failures contain no request, credential, or provider exception payload. */
export class ProviderProtocolError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ProviderProtocolError";
  }
}

/** Validate a complete provider implementation before exposing discovery. */
export function defineChatKitProvider<T extends ChatKitProviderDefinition>(definition: T): T {
  if (!definition.version.trim() || !definition.displayName.trim())
    throw new TypeError("Provider version and displayName are required");
  if (definition.configurationSchema.type !== "object")
    throw new TypeError("configurationSchema must describe an object");
  schemas.compile(definition.configurationSchema);
  if (definition.capabilities.delivery && !definition.messaging)
    throw new TypeError("Delivery requires prepareSend, deliver, and reconcile handlers");
  if (definition.capabilities.identity && !definition.identity)
    throw new TypeError("Identity capability requires identity handlers");
  if (definition.capabilities.toolkit && !definition.setup.toolkitConfigured)
    throw new TypeError("Associated toolkits require a toolkitConfigured handler");
  const names = new Set<string>();
  for (const tool of definition.sessionTools ?? []) {
    if (!/^[A-Za-z0-9_]+$/.test(tool.name) || reserved.has(tool.name) || names.has(tool.name))
      throw new TypeError("Invalid, duplicate, or reserved session tool name");
    names.add(tool.name);
    if (tool.inputSchema.type !== "object")
      throw new TypeError("Session tool input schema must describe an object");
    for (const field of Object.keys(asObject(tool.inputSchema.properties ?? {}))) {
      if (bound.has(field.replaceAll("_", "").toLowerCase()))
        throw new TypeError("Tool schema exposes trusted context");
    }
    schemas.compile(tool.inputSchema);
    schemas.compile(tool.outputSchema);
    if (!tool.readOnly && !tool.reconcile)
      throw new TypeError(`Mutation ${tool.name} requires reconciliation`);
  }
  return definition;
}

export type ChatKitProviderEndpointOptions = {
  provider: ChatKitProviderDefinition;
  signingKey: string;
  /** Fixed registered endpoint; never derive the manifest target from Host headers. */
  endpointUrl: string;
  /** Bind invocations to the registration that issued signingKey. */
  definitionId: string;
  toleranceSeconds?: number;
};

/** Signed discovery and invocation handlers for any Fetch-compatible server. */
export function chatKitProviderEndpoint(options: ChatKitProviderEndpointOptions): {
  GET(request: Request): Promise<Response>;
  POST(request: Request): Promise<Response>;
} {
  const definition = defineChatKitProvider(options.provider);
  const url = new URL(options.endpointUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash)
    throw new TypeError("Invalid endpointUrl");
  if (!options.signingKey || !options.definitionId)
    throw new TypeError("signingKey and definitionId are required");
  const tools = new Map((definition.sessionTools ?? []).map((tool) => [tool.name, tool]));
  const manifest = {
    protocol_version: 1,
    version: definition.version,
    display_name: definition.displayName,
    description: definition.description,
    invoke_url: url.toString(),
    configuration_schema: definition.configurationSchema,
    fields: (definition.fields ?? []).map(wireField),
    auth_methods: (definition.authMethods ?? []).map((method) => ({
      id: method.id,
      display_name: method.displayName,
      description: method.description,
      fields: method.fields.map(wireField),
    })),
    subscriptions: definition.subscriptions ?? [],
    capabilities: {
      toolkit: definition.capabilities.toolkit ?? false,
      inbound: definition.capabilities.inbound ?? false,
      delivery: definition.capabilities.delivery ?? false,
      identity: definition.capabilities.identity ?? false,
      streaming: definition.capabilities.streaming ?? false,
      markdown: definition.capabilities.markdown ?? false,
      html: definition.capabilities.html ?? false,
      attachments: definition.capabilities.attachments ?? false,
      max_length: definition.capabilities.maxLength ?? null,
    },
    session_tools: [...tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
      output_schema: tool.outputSchema,
      read_only: tool.readOnly ?? false,
    })),
  };
  async function handle(request: Request, discovery: boolean): Promise<Response> {
    try {
      if (request.method !== (discovery ? "GET" : "POST"))
        throw new ProviderProtocolError("Method not allowed", 405);
      const body = await verify(request, options);
      if (discovery) return Response.json(manifest);
      let decoded: unknown;
      try {
        decoded = JSON.parse(new TextDecoder().decode(body));
      } catch {
        throw new ProviderProtocolError("Invalid JSON");
      }
      const envelope = asObject(decoded);
      if (envelope.protocol_version !== 1 || envelope.manifest_version !== definition.version)
        throw new ProviderProtocolError("Unsupported provider version", 409);
      const scope = asObject(envelope.scope);
      if (scope.definition_id !== options.definitionId)
        throw new ProviderProtocolError("Incorrect provider registration", 403);
      const context = decodeContext(envelope, request.signal);
      const input = asObject(envelope.input ?? {});
      let result: unknown;
      switch (envelope.operation) {
        case "setup_start":
          result = wireSetup(await definition.setup.start(input, context));
          break;
        case "setup_resume":
          result = wireSetup(await definition.setup.resume(input, context));
          break;
        case "disconnect":
          await definition.setup.disconnect(context);
          result = {};
          break;
        case "toolkit_configured":
          if (!definition.setup.toolkitConfigured)
            throw new ProviderProtocolError("Associated toolkit handler is unavailable", 422);
          await definition.setup.toolkitConfigured(
            {
              toolGroupInstanceId: text(input.tool_group_instance_id),
              signingKey: text(input.signing_key),
            },
            context,
          );
          result = { acknowledged: true };
          break;
        case "runtime_credentials_updated":
          if (!definition.setup.credentialsUpdated)
            throw new ProviderProtocolError("Credential notification is unsupported", 422);
          await definition.setup.credentialsUpdated(
            { runtimeToken: text(input.runtime_token) },
            context,
          );
          result = { acknowledged: true };
          break;
        case "register_identity": {
          if (!definition.identity) throw new ProviderProtocolError("Unsupported capability", 422);
          result = wireIdentity(await definition.identity.register(input, context));
          break;
        }
        case "normalize_mentions": {
          if (!definition.identity) throw new ProviderProtocolError("Unsupported capability", 422);
          result = (await definition.identity.normalizeMentions(input, context)).map(wireIdentity);
          break;
        }
        case "list_session_tools": {
          requireSession(context);
          const available: string[] = [];
          for (const tool of tools.values())
            if (!tool.available || (await tool.available(context))) available.push(tool.name);
          result = { tools: available };
          break;
        }
        case "invoke_session_tool":
        case "reconcile_session_tool": {
          requireSession(context);
          const tool = tools.get(text(input.name));
          if (!tool || (tool.available && !(await tool.available(context))))
            throw new ProviderProtocolError("Session tool unavailable", 422);
          const params = asObject(input.arguments);
          for (const key of Object.keys(params))
            if (bound.has(key.replaceAll("_", "").toLowerCase()))
              throw new ProviderProtocolError("Tool input contains trusted context");
          if (!schemas.validate(tool.inputSchema, params))
            throw new ProviderProtocolError("Invalid tool input");
          if (envelope.operation === "reconcile_session_tool") {
            if (!tool.reconcile) throw new ProviderProtocolError("Reconciliation unavailable", 422);
            const outcome = await tool.reconcile(params, context);
            if (
              outcome.status === "applied" &&
              !schemas.validate(tool.outputSchema, outcome.result)
            )
              throw new ProviderProtocolError("Invalid reconciled tool output", 502);
            result = outcome;
          } else {
            result = await tool.execute(params, context);
            if (!schemas.validate(tool.outputSchema, result))
              throw new ProviderProtocolError("Invalid tool output", 502);
          }
          break;
        }
        case "prepare_send": {
          requireSession(context);
          if (!definition.messaging) throw new ProviderProtocolError("Delivery unavailable", 422);
          result = wireDeliveryOptions(await definition.messaging.prepareSend(input, context));
          break;
        }
        case "deliver":
        case "reconcile_delivery": {
          if (!definition.messaging) throw new ProviderProtocolError("Delivery unavailable", 422);
          const delivery = decodeDelivery(input);
          if (envelope.operation === "deliver") {
            const outcome = await definition.messaging.deliver(delivery, context);
            result = { external_message_id: outcome.externalMessageId ?? null };
          } else {
            const outcome = await definition.messaging.reconcile(delivery, context);
            result =
              outcome.status === "applied"
                ? {
                    status: "applied",
                    result: {
                      external_message_id: outcome.result.externalMessageId ?? null,
                    },
                  }
                : outcome;
          }
          break;
        }
        default:
          throw new ProviderProtocolError("Unknown provider operation", 422);
      }
      return Response.json(result);
    } catch (error) {
      if (error instanceof ProviderProtocolError)
        return Response.json({ error: error.message }, { status: error.status });
      // Provider exceptions often contain platform request headers and recipient data.
      return Response.json({ error: "Provider operation failed" }, { status: 500 });
    }
  }
  return {
    GET: (request) => handle(request, true),
    POST: (request) => handle(request, false),
  };
}

async function verify(
  request: Request,
  options: ChatKitProviderEndpointOptions,
): Promise<Uint8Array> {
  const timestamp = request.headers.get("x-tilde-timestamp") ?? "";
  const signature = request.headers.get("x-tilde-signature") ?? "";
  if (!/^[0-9]+$/.test(timestamp) || !/^hmac-sha256=[0-9a-f]{64}$/.test(signature))
    throw new ProviderProtocolError("Invalid signature", 401);
  const seconds = Number(timestamp);
  if (
    !Number.isSafeInteger(seconds) ||
    Math.abs(Date.now() / 1000 - seconds) > (options.toleranceSeconds ?? 300)
  )
    throw new ProviderProtocolError("Expired signature", 401);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_BODY_BYTES) {
          await reader.cancel();
          throw new ProviderProtocolError("Request too large", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(options.signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const digest = Uint8Array.from(signature.slice(12).match(/../g) ?? [], (value) =>
    Number.parseInt(value, 16),
  );
  if (!(await crypto.subtle.verify("HMAC", key, digest, signed)))
    throw new ProviderProtocolError("Invalid signature", 401);
  return body;
}
function asObject(value: unknown): ProviderObject {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new ProviderProtocolError("Expected an object");
  return value as ProviderObject;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new ProviderProtocolError("Expected a nonempty string");
  return value;
}
function decodeContext(value: ProviderObject, signal: AbortSignal): ProviderContext {
  const scope = asObject(value.scope);
  const context: ProviderContext = {
    requestId: text(value.request_id),
    orgId: text(scope.org_id),
    teamId: text(scope.team_id),
    definitionId: text(scope.definition_id),
    connectionId: text(scope.connection_id),
    configuration: asObject(value.configuration ?? {}),
    secrets: asObject(value.secrets ?? {}),
    signal,
  };
  if (value.context) {
    const session = asObject(value.context);
    context.session = {
      participants: (Array.isArray(session.participants) ? session.participants : []).map(
        (value) => {
          const participant = asObject(value);
          return {
            instanceId: text(participant.instance_id),
            displayName: text(participant.display_name),
            externalId:
              typeof participant.external_id === "string" ? participant.external_id : null,
            isAgent: participant.is_agent === true,
          };
        },
      ),
      sessionId: text(session.session_id),
      agentInboxInstanceId: text(session.agent_inbox_instance_id),
      targetInboxInstanceId: text(session.target_inbox_instance_id),
      triggerMessageId: text(session.trigger_message_id),
      executionId: text(session.execution_id),
      conversationKey: text(session.conversation_key),
      externalMessageId: text(session.external_message_id),
      providerMessage: session.provider_message ?? {},
      providerThread: session.provider_thread ?? {},
    };
  }
  return context;
}
function requireSession(context: ProviderContext): void {
  if (!context.session) throw new ProviderProtocolError("Session context required", 403);
}
function wireField(field: ProviderField): ProviderObject {
  return {
    name: field.name,
    label: field.label,
    field_type: field.fieldType,
    required: field.required ?? false,
    placeholder: field.placeholder ?? "",
  };
}
function wireIdentity(value: {
  externalId: string;
  displayName: string;
  kind: string;
}): ProviderObject {
  return {
    external_id: value.externalId,
    display_name: value.displayName,
    kind: value.kind,
  };
}
function wireSetup(value: ProviderSetupResult): ProviderObject {
  let action: ProviderObject;
  switch (value.nextAction.type) {
    case "submit_form":
      action = {
        type: "submit_form",
        fields: value.nextAction.fields.map(wireField),
        submit_label: value.nextAction.submitLabel,
      };
      break;
    case "render_instructions":
      action = {
        type: "render_instructions",
        markdown: value.nextAction.markdown,
        fields: (value.nextAction.fields ?? []).map(wireField),
      };
      break;
    case "redirect":
      action = { type: "redirect", url: value.nextAction.url };
      break;
    case "complete":
      action = { type: "complete", message: value.nextAction.message ?? null };
      break;
  }
  return {
    toolkit: value.toolkit ? { discovery_url: value.toolkit.discoveryUrl } : null,
    next_action: action,
    configuration: value.configuration ?? {},
    secrets: value.secrets ?? {},
    continuation: value.continuation ?? null,
  };
}
function wireDeliveryOptions(value: ProviderDeliveryOptions): ProviderObject {
  return {
    visible_recipients: (value.visibleRecipients ?? []).map(wireIdentity),
    to: value.to ?? null,
    cc: value.cc ?? null,
    bcc: value.bcc ?? null,
    subject: value.subject ?? null,
    html: value.html ?? null,
    reply_all: value.replyAll ?? null,
    attachment_ids: value.attachmentIds ?? [],
    provider_options: value.providerOptions ?? null,
  };
}
function decodeDelivery(value: ProviderObject): ProviderDelivery {
  const options = asObject(value.options ?? {});
  const deliveryOptions: ProviderDeliveryOptions = {};
  for (const key of ["to", "cc", "bcc"] as const)
    if (options[key] != null) {
      if (!Array.isArray(options[key]) || !options[key].every((v) => typeof v === "string"))
        throw new ProviderProtocolError("Invalid delivery recipients");
      deliveryOptions[key] = options[key] as string[];
    }
  for (const key of ["subject", "html"] as const)
    if (typeof options[key] === "string") deliveryOptions[key] = options[key];
  if (typeof options.reply_all === "boolean") deliveryOptions.replyAll = options.reply_all;
  deliveryOptions.providerOptions = options.provider_options ?? null;
  if (options.attachment_ids != null) {
    if (
      !Array.isArray(options.attachment_ids) ||
      !options.attachment_ids.every((v) => typeof v === "string")
    )
      throw new ProviderProtocolError("Invalid attachment IDs");
    deliveryOptions.attachmentIds = options.attachment_ids as string[];
  }
  if (!Number.isSafeInteger(value.attempt) || Number(value.attempt) < 1)
    throw new ProviderProtocolError("Invalid delivery attempt");
  return {
    ...(typeof value.external_message_id === "string"
      ? { externalMessageId: value.external_message_id }
      : {}),
    providerMessage: value.provider_message ?? null,
    deliveryId: text(value.delivery_id),
    attempt: Number(value.attempt),
    body: typeof value.body === "string" ? value.body : "",
    attachments: (Array.isArray(value.attachments) ? value.attachments : []).map((v) => {
      const file = asObject(v);
      return {
        mediaType: text(file.media_type),
        url: text(file.url),
        ...(typeof file.filename === "string" ? { filename: file.filename } : {}),
      };
    }),
    options: deliveryOptions,
    providerThread: value.provider_thread ?? {},
  };
}
