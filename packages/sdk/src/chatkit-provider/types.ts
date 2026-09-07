/** JSON carried across the remote-provider boundary. */
export type ProviderJson =
  | null
  | boolean
  | number
  | string
  | ProviderJson[]
  | { [key: string]: ProviderJson };
export type ProviderObject = { [key: string]: ProviderJson };
export type ProviderSchema = ProviderObject;

/** Trusted context verified by Tilde and covered by the endpoint signature. */
export type ProviderContext = {
  requestId: string;
  orgId: string;
  teamId: string;
  definitionId: string;
  connectionId: string;
  configuration: ProviderObject;
  secrets: ProviderObject;
  session?: {
    participants: {
      instanceId: string;
      displayName: string;
      externalId: string | null;
      isAgent: boolean;
    }[];
    sessionId: string;
    agentInboxInstanceId: string;
    targetInboxInstanceId: string;
    triggerMessageId: string;
    executionId: string;
    conversationKey: string;
    externalMessageId: string;
    providerMessage: ProviderJson;
    providerThread: ProviderJson;
  };
  signal: AbortSignal;
};

export type ProviderField = {
  name: string;
  label: string;
  fieldType: "text" | "password" | "textarea" | "number" | "checkbox";
  required?: boolean;
  placeholder?: string;
};
export type ProviderAuthMethod = {
  id: string;
  displayName: string;
  description: string;
  fields: ProviderField[];
};
export type ProviderCapabilities = {
  toolkit?: boolean;
  inbound?: boolean;
  delivery?: boolean;
  identity?: boolean;
  streaming?: boolean;
  markdown?: boolean;
  html?: boolean;
  attachments?: boolean;
  maxLength?: number;
};
export type ProviderSetupResult = {
  toolkit?: { discoveryUrl: string };
  nextAction:
    | { type: "submit_form"; fields: ProviderField[]; submitLabel: string }
    | { type: "redirect"; url: string }
    | {
        type: "render_instructions";
        markdown: string;
        fields?: ProviderField[];
      }
    | { type: "complete"; message?: string };
  configuration?: ProviderObject;
  secrets?: ProviderObject;
  continuation?: ProviderJson;
};
export type ProviderReconciliation<T = ProviderJson> =
  | { status: "applied"; result: T }
  | { status: "absent" }
  | { status: "uncertain"; reason: string };

/** Private delivery options must never be copied to transcript or log payloads. */
export type ProviderDeliveryOptions = {
  visibleRecipients?: ProviderExternalIdentity[];
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  html?: string;
  replyAll?: boolean;
  attachmentIds?: string[];
  providerOptions?: ProviderJson;
};
export type ProviderDelivery = {
  externalMessageId?: string;
  providerMessage?: ProviderJson;
  deliveryId: string;
  attempt: number;
  body: string;
  attachments: { mediaType: string; filename?: string; url: string }[];
  options: ProviderDeliveryOptions;
  providerThread: ProviderJson;
};
export type ProviderDeliveryResult = { externalMessageId: string };
export type ProviderExternalIdentity = {
  externalId: string;
  displayName: string;
  kind: "email" | "mobile_number" | "username";
};
export type ProviderInboundMessage = {
  eventId: string;
  conversationKey: string;
  externalMessageId: string;
  sender: ProviderExternalIdentity;
  text: string;
  attachmentIds?: string[];
  providerThread?: ProviderJson;
  providerMetadata?: ProviderJson;
};

/** Context is not a model argument; mutation handlers must reconcile retries. */
export type ProviderSessionTool = {
  name: string;
  description: string;
  inputSchema: ProviderSchema;
  outputSchema: ProviderSchema;
  readOnly?: boolean;
  available?(context: ProviderContext): boolean | Promise<boolean>;
  execute(input: ProviderObject, context: ProviderContext): Promise<ProviderJson>;
  reconcile?(input: ProviderObject, context: ProviderContext): Promise<ProviderReconciliation>;
};

export type ChatKitProviderDefinition = {
  version: string;
  displayName: string;
  description: string;
  configurationSchema: ProviderSchema;
  fields?: ProviderField[];
  authMethods?: ProviderAuthMethod[];
  subscriptions?: string[];
  capabilities: ProviderCapabilities;
  sessionTools?: ProviderSessionTool[];
  setup: {
    start(input: ProviderObject, context: ProviderContext): Promise<ProviderSetupResult>;
    resume(input: ProviderObject, context: ProviderContext): Promise<ProviderSetupResult>;
    disconnect(context: ProviderContext): Promise<void>;
    toolkitConfigured?(
      input: { toolGroupInstanceId: string; signingKey: string },
      context: ProviderContext,
    ): Promise<void>;
    credentialsUpdated?(input: { runtimeToken: string }, context: ProviderContext): Promise<void>;
  };
  identity?: {
    register(input: ProviderObject, context: ProviderContext): Promise<ProviderExternalIdentity>;
    normalizeMentions(
      input: ProviderObject,
      context: ProviderContext,
    ): Promise<ProviderExternalIdentity[]>;
  };
  messaging?: {
    prepareSend(input: ProviderObject, context: ProviderContext): Promise<ProviderDeliveryOptions>;
    deliver(input: ProviderDelivery, context: ProviderContext): Promise<ProviderDeliveryResult>;
    reconcile(
      input: ProviderDelivery,
      context: ProviderContext,
    ): Promise<ProviderReconciliation<ProviderDeliveryResult>>;
  };
};
