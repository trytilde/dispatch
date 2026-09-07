import {
  defineChatKitProvider,
  type ProviderContext,
  type ProviderDelivery,
  type ProviderDeliveryOptions,
  type ProviderObject,
  type ProviderSetupResult,
} from "@trytilde/sdk/chatkit-provider";
import {
  attachmentContent,
  form,
  object,
  type ProviderHost,
  platform,
  publicMail,
  runtime,
  stored,
  string,
  verifyPlatformWebhook,
} from "./shared";

/** Complete AgentMail transport using only the public provider SDK contract. */
export function agentMailProvider(
  host: ProviderHost & { platformBaseUrl?: string },
) {
  const fetcher = host.fetch ?? fetch;
  const origin = host.platformBaseUrl ?? "https://api.agentmail.to/v0";
  const path = (context: ProviderContext) =>
    `/inboxes/${encodeURIComponent(string(context.configuration.inbox_id))}`;
  const token = (context: ProviderContext) => string(context.secrets.api_key);
  async function configure(
    input: ProviderObject,
    context: ProviderContext,
  ): Promise<ProviderSetupResult> {
    const values = form(input);
    if (
      typeof values.api_key !== "string" &&
      typeof context.secrets.api_key === "string"
    )
      values.api_key = context.secrets.api_key;
    if (
      typeof values.webhook_secret !== "string" &&
      typeof context.secrets.webhook_secret === "string"
    )
      values.webhook_secret = context.secrets.webhook_secret;
    const prior = input.continuation ? object(input.continuation) : {};
    const inboxId = string(
      values.inbox_id ?? prior.inbox_id ?? context.configuration.inbox_id,
    );
    const runtimeToken =
      typeof input.runtime_token === "string"
        ? input.runtime_token
        : host.store.getConnection(context.connectionId).runtimeToken;
    if (
      typeof values.api_key !== "string" ||
      typeof values.webhook_secret !== "string"
    ) {
      host.store.saveConnection(context.connectionId, {
        ...stored(context, runtimeToken),
        configuration: { inbox_id: inboxId },
      });
      return {
        configuration: { inbox_id: inboxId },
        continuation: { inbox_id: inboxId },
        nextAction: {
          type: "render_instructions",
          markdown: `Create an AgentMail webhook for message.received events at ${host.webhookBaseUrl}/${encodeURIComponent(context.connectionId)}. Enter its signing secret and the inbox API key.`,
          fields: [
            {
              name: "api_key",
              label: "Inbox API key",
              fieldType: "password",
              required: true,
            },
            {
              name: "webhook_secret",
              label: "Webhook signing secret",
              fieldType: "password",
              required: true,
            },
          ],
        },
      };
    }
    await platform(
      fetcher,
      origin,
      values.api_key,
      "GET",
      `/inboxes/${encodeURIComponent(inboxId)}`,
    );
    const configuration = { inbox_id: inboxId };
    const secrets = {
      api_key: values.api_key,
      webhook_secret: values.webhook_secret,
    };
    host.store.saveConnection(context.connectionId, {
      ...stored(context, runtimeToken),
      configuration,
      secrets,
    });
    return {
      configuration,
      secrets,
      nextAction: { type: "complete", message: "AgentMail connected" },
    };
  }
  async function deliver(input: ProviderDelivery, context: ProviderContext) {
    const thread = object(input.providerThread);
    const replyTo =
      input.externalMessageId ??
      (typeof thread.message_id === "string" ? thread.message_id : undefined);
    const newThread =
      object(input.options.providerOptions ?? {}).new_thread === true;
    const route =
      replyTo && !newThread
        ? `${path(context)}/messages/${encodeURIComponent(replyTo)}/${input.options.replyAll === false ? "reply" : "reply-all"}`
        : `${path(context)}/messages/send`;
    // URL-backed attachments are the documented AgentMail attachment format:
    // https://www.agentmail.to/docs/attachments
    const receiptKey = `delivery:${input.deliveryId}`;
    const prior = host.store.getEffect(context.connectionId, receiptKey);
    if (prior) return { externalMessageId: string(prior.externalMessageId) };
    const draft = host.store.prepareDelivery(
      JSON.stringify([context.connectionId, input.deliveryId]),
      route,
      {
        text: input.body,
        to: input.options.to ?? null,
        cc: input.options.cc ?? null,
        bcc: input.options.bcc ?? null,
        subject: input.options.subject ?? null,
        html: input.options.html ?? null,
        labels: [`tilde-delivery-${input.deliveryId}`],
        attachments: input.attachments.map((file) => ({
          url: file.url,
          filename: file.filename ?? null,
          content_type: file.mediaType,
        })),
      },
    );
    // AgentMail forgets send keys after 24h. Leave a margin for request duration.
    if (Date.now() - draft.startedAt > 23 * 60 * 60 * 1000)
      throw new Error(
        "Delivery requires reconciliation beyond the idempotency window",
      );
    const value = await platform(
      fetcher,
      origin,
      token(context),
      "POST",
      draft.route,
      draft.body,
      input.deliveryId,
    );
    const result = { externalMessageId: string(value.message_id) };
    host.store.saveEffect(context.connectionId, receiptKey, result);
    return result;
  }
  async function reconcileDelivery(
    input: ProviderDelivery,
    context: ProviderContext,
  ) {
    const key = `delivery:${input.deliveryId}`;
    const receipt = host.store.getEffect(context.connectionId, key);
    if (receipt)
      return {
        status: "applied" as const,
        result: { externalMessageId: string(receipt.externalMessageId) },
      };
    let pageToken: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const query = new URLSearchParams({
        labels: `tilde-delivery-${input.deliveryId}`,
        limit: "100",
      });
      if (pageToken) query.set("page_token", pageToken);
      const listing = await platform(
        fetcher,
        origin,
        token(context),
        "GET",
        `${path(context)}/messages?${query}`,
      );
      if (!Array.isArray(listing.messages))
        return {
          status: "uncertain" as const,
          reason: "Invalid delivery reconciliation response",
        };
      for (const entry of listing.messages) {
        const message = object(entry);
        if (
          !Array.isArray(message.labels) ||
          !message.labels.includes(`tilde-delivery-${input.deliveryId}`)
        )
          continue;
        const result = { externalMessageId: string(message.message_id) };
        host.store.saveEffect(context.connectionId, key, result);
        return { status: "applied" as const, result };
      }
      if (
        typeof listing.next_page_token !== "string" ||
        !listing.next_page_token
      ) {
        const draft = host.store.getDelivery(
          JSON.stringify([context.connectionId, input.deliveryId]),
        );
        if (draft && Date.now() - draft.startedAt > 23 * 60 * 60 * 1000)
          return {
            status: "uncertain" as const,
            reason: "Platform idempotency window expired",
          };
        return {
          status: "applied" as const,
          result: await deliver(input, context),
        };
      }
      if (seen.has(listing.next_page_token)) break;
      seen.add(listing.next_page_token);
      pageToken = listing.next_page_token;
    }
    return {
      status: "uncertain" as const,
      reason: "Delivery marker pagination did not complete",
    };
  }

  const definition = defineChatKitProvider({
    version: "1",
    displayName: "AgentMail (TypeScript)",
    description: "Email conversations with rich replies and session tools",
    configurationSchema: {
      type: "object",
      properties: { inbox_id: { type: "string" } },
      required: ["inbox_id"],
      additionalProperties: false,
    },
    fields: [
      {
        name: "inbox_id",
        label: "AgentMail inbox",
        fieldType: "text" as const,
        required: true,
      },
    ],
    capabilities: {
      inbound: true,
      delivery: true,
      identity: true,
      html: true,
      attachments: true,
    },
    subscriptions: ["message.received"],
    setup: {
      start: configure,
      resume: configure,
      credentialsUpdated: async (
        input: { runtimeToken: string },
        context: ProviderContext,
      ) => {
        host.store.saveConnection(context.connectionId, {
          ...host.store.getConnection(context.connectionId),
          runtimeToken: input.runtimeToken,
        });
      },
      disconnect: async (context: ProviderContext) => {
        host.store.deleteConnection(context.connectionId);
      },
    },
    identity: {
      register: async (_input: ProviderObject, context: ProviderContext) => ({
        kind: "email" as const,
        externalId: string(context.configuration.inbox_id),
        displayName: "Agent",
      }),
      normalizeMentions: async (input: ProviderObject) =>
        (Array.isArray(input.tags) ? input.tags : [])
          .filter(
            (tag): tag is string =>
              typeof tag === "string" && tag.includes("@"),
          )
          .map((tag) => ({
            kind: "email" as const,
            externalId: tag.trim().toLowerCase(),
            displayName: tag,
          })),
    },
    messaging: {
      prepareSend: async (
        input: ProviderObject,
      ): Promise<ProviderDeliveryOptions> => {
        const providerOptions = object(input.provider_options ?? {});
        if (
          providerOptions.new_thread === true &&
          (!Array.isArray(input.to) || input.to.length === 0)
        )
          throw new Error("A new email requires To recipients");
        return {
          providerOptions,
          visibleRecipients: [
            ...(Array.isArray(input.to) ? input.to : []),
            ...(Array.isArray(input.cc) ? input.cc : []),
          ].map((value) => ({
            kind: "email",
            externalId: emailAddress(string(value)),
            displayName: string(value),
          })),
          ...(Array.isArray(input.to) ? { to: input.to.map(string) } : {}),
          ...(Array.isArray(input.cc) ? { cc: input.cc.map(string) } : {}),
          ...(Array.isArray(input.bcc) ? { bcc: input.bcc.map(string) } : {}),
          ...(typeof input.subject === "string"
            ? { subject: input.subject }
            : {}),
          ...(typeof input.html === "string" ? { html: input.html } : {}),
          replyAll: input.reply_all === true,
        };
      },
      deliver,
      reconcile: reconcileDelivery,
    },
    sessionTools: [
      {
        name: "getThread",
        description: "Read this email thread",
        readOnly: true,
        inputSchema: { type: "object", additionalProperties: false },
        outputSchema: { type: "object" },
        execute: async (_input: ProviderObject, context: ProviderContext) =>
          publicMail(
            await platform(
              fetcher,
              origin,
              token(context),
              "GET",
              `${path(context)}/threads/${encodeURIComponent(string(object(context.session?.providerThread).thread_id))}`,
            ),
          ),
      },
    ],
  });
  async function webhook(
    connectionId: string,
    request: Request,
  ): Promise<Response> {
    const state = host.store.getConnection(connectionId);
    const event = await verifyPlatformWebhook(
      request,
      string(state.secrets.webhook_secret),
      "svix",
    );
    if (
      typeof event.event_type !== "string" ||
      !event.event_type.startsWith("message.received")
    )
      return new Response(null, { status: 204 });
    const message = object(event.message);
    if (message.inbox_id !== state.configuration.inbox_id)
      throw new Error("Webhook inbox does not match connection");
    const eventId = string(event.event_id);
    const client = runtime(host, connectionId, state);
    let draft = host.store.getEvent(connectionId, eventId);
    if (!draft) {
      const threadId = string(message.thread_id);
      const providerThread = {
        inbox_id: string(message.inbox_id),
        thread_id: threadId,
        message_id: string(message.message_id),
      };
      const session = await client.ensureConversation({
        conversationKey: threadId,
        title: typeof message.subject === "string" ? message.subject : "Email",
        providerThread,
      });
      const hidden = new Set(
        (Array.isArray(message.bcc) ? message.bcc : []).map((value) =>
          emailAddress(string(value)),
        ),
      );
      const visible = [
        ...(Array.isArray(message.to) ? message.to : []),
        ...(Array.isArray(message.cc) ? message.cc : []),
      ];
      for (const value of visible) {
        const address = emailAddress(string(value));
        if (
          hidden.has(address) ||
          address === emailAddress(string(state.configuration.inbox_id))
        )
          continue;
        await client.upsertParticipant({
          sessionId: session.sessionId,
          identity: {
            kind: "email",
            externalId: address,
            displayName: address,
          },
        });
      }
      const attachmentIds: string[] = [];
      for (const attachment of Array.isArray(message.attachments)
        ? message.attachments
        : []) {
        const file = object(attachment);
        const download = await platform(
          fetcher,
          origin,
          string(state.secrets.api_key),
          "GET",
          `/inboxes/${encodeURIComponent(string(message.inbox_id))}/messages/${encodeURIComponent(string(message.message_id))}/attachments/${encodeURIComponent(string(file.attachment_id))}`,
        );
        const content = await attachmentContent(
          host,
          string(download.download_url),
        );
        const upload = await client.uploadAttachment({
          sessionId: session.sessionId,
          content: content.content,
          mediaType:
            typeof file.content_type === "string"
              ? file.content_type
              : "application/octet-stream",
          ...(typeof file.filename === "string"
            ? { filename: file.filename }
            : {}),
        });
        attachmentIds.push(upload.attachmentId);
      }
      const sender = emailAddress(string(message.from));
      draft = host.store.saveEvent(connectionId, {
        eventId,
        conversationKey: threadId,
        externalMessageId: string(message.message_id),
        sender: {
          externalId: sender.toLowerCase(),
          displayName: sender,
          kind: "email",
        },
        text:
          typeof message.extracted_text === "string"
            ? message.extracted_text
            : typeof message.text === "string"
              ? message.text
              : "",
        attachmentIds,
        providerThread,
        providerMetadata: publicMail(message),
      });
    }
    await client.ingest(draft);
    return new Response(null, { status: 202 });
  }
  return { definition, webhook };
}

function emailAddress(value: string): string {
  return (value.match(/<([^>]+)>/)?.[1] ?? value).trim().toLowerCase();
}
