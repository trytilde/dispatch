import {
  defineChatKitProvider,
  type ProviderContext,
  type ProviderDelivery,
  type ProviderObject,
  type ProviderSessionTool,
  type ProviderSetupResult,
} from "@trytilde/sdk/chatkit-provider";
import {
  attachmentContent,
  form,
  object,
  type ProviderHost,
  platform,
  runtime,
  stored,
  string,
  verifyPlatformWebhook,
} from "./shared";

/** Linq account/line-pool transport, including session-scoped reactions and polls. */
export function linqProvider(
  host: ProviderHost & { platformBaseUrl?: string },
) {
  const fetcher = host.fetch ?? fetch;
  const origin =
    host.platformBaseUrl ?? "https://api.linqapp.com/api/partner/v3";
  const token = (context: ProviderContext) => string(context.secrets.api_token);
  async function configure(
    input: ProviderObject,
    context: ProviderContext,
  ): Promise<ProviderSetupResult> {
    const values = form(input);
    const prior = host.store.findConnection(context.connectionId);
    const apiToken = string(
      values.api_token ?? context.secrets.api_token ?? prior?.secrets.api_token,
    );
    values.phone_numbers ??=
      context.configuration.phone_numbers ??
      prior?.configuration.phone_numbers ??
      [];
    const phoneNumbers = Array.isArray(values.phone_numbers)
      ? values.phone_numbers.map(string)
      : typeof values.phone_numbers === "string"
        ? values.phone_numbers
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const runtimeToken =
      typeof input.runtime_token === "string"
        ? input.runtime_token
        : host.store.getConnection(context.connectionId).runtimeToken;
    const targetUrl = `${host.webhookBaseUrl}/${encodeURIComponent(context.connectionId)}`;
    // Reuse a stored subscription during setup retry; subscription IDs remain connection-owned.
    let subscriptionId = prior?.configuration.subscription_id;
    let signingSecret = prior?.secrets.webhook_secret;
    if (
      typeof subscriptionId !== "string" ||
      typeof signingSecret !== "string"
    ) {
      // A lost create response also loses Linq's one-time signing secret. Recover
      // by deleting only subscriptions owned by this connection's exact URL.
      if (prior) await removeOwnedSubscriptions(apiToken, targetUrl);
      host.store.saveConnection(context.connectionId, {
        ...stored(context, runtimeToken),
        configuration: { phone_numbers: phoneNumbers },
        secrets: { api_token: apiToken },
      });
      const subscription = await platform(
        fetcher,
        origin,
        apiToken,
        "POST",
        "/webhook-subscriptions",
        {
          target_url: targetUrl,
          subscribed_events: ["message.received"],
          ...(phoneNumbers.length ? { phone_numbers: phoneNumbers } : {}),
        },
      );
      subscriptionId = string(subscription.id);
      signingSecret = string(subscription.signing_secret);
    } else {
      await platform(
        fetcher,
        origin,
        apiToken,
        "PUT",
        `/webhook-subscriptions/${encodeURIComponent(subscriptionId)}`,
        {
          target_url: targetUrl,
          phone_numbers: phoneNumbers,
          subscribed_events: ["message.received"],
          is_active: true,
        },
      );
    }
    const configuration = {
      phone_numbers: phoneNumbers,
      subscription_id: subscriptionId,
    };
    const secrets = { api_token: apiToken, webhook_secret: signingSecret };
    host.store.saveConnection(context.connectionId, {
      ...stored(context, runtimeToken),
      configuration,
      secrets,
    });
    return {
      configuration,
      secrets,
      nextAction: { type: "complete", message: "Linq connected" },
    };
  }
  async function removeOwnedSubscriptions(
    apiToken: string,
    targetUrl: string,
  ): Promise<void> {
    const result = await platform(
      fetcher,
      origin,
      apiToken,
      "GET",
      "/webhook-subscriptions",
    );
    if (!Array.isArray(result.subscriptions))
      throw new Error("Cannot reconcile webhook subscriptions");
    for (const entry of result.subscriptions) {
      const subscription = object(entry);
      if (subscription.target_url === targetUrl)
        await platform(
          fetcher,
          origin,
          apiToken,
          "DELETE",
          `/webhook-subscriptions/${encodeURIComponent(string(subscription.id))}`,
        );
    }
  }
  const reaction = (value: unknown) =>
    ({
      heart: "love",
      thumbsup: "like",
      thumbsdown: "dislike",
      "!!": "emphasize",
      "?": "question",
      "👍": "like",
      "❤️": "love",
      "❤": "love",
      "😂": "laugh",
      "👎": "dislike",
      "‼️": "emphasize",
      "❓": "question",
    })[string(value)] ?? string(value);
  const specs = [
    ["addReaction", { emoji: { type: "string" } }, ["emoji"]],
    ["removeReaction", { emoji: { type: "string" } }, ["emoji"]],
    ["getThread", {limit:{type:"integer",minimum:1,maximum:100},order:{type:"string",enum:["asc","desc"]}}, []],
    [
      "createPoll",
      {
        options: {
          type: "array",
          items: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
                additionalProperties: false,
              },
            ],
          },
          minItems: 2,
        },
      },
      ["options"],
    ],
    [
      "addPollOptions",
      {
        options: {
          type: "array",
          items: {
            oneOf: [
              { type: "string" },
              {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
                additionalProperties: false,
              },
            ],
          },
          minItems: 1,
        },
      },
      ["options"],
    ],
    [
      "votePoll",
      {
        option_id: { type: "string" },
        operation: { type: "string", enum: ["add", "remove"] },
      },
      ["option_id", "operation"],
    ],
  ] as const;
  const sessionTools: ProviderSessionTool[] = specs.map(
    ([name, properties, required]) => {
      async function execute(
        input: ProviderObject,
        context: ProviderContext,
      ): Promise<ProviderObject> {
        const session = context.session;
        if (!session) throw new Error("Session context is required");
        const prior = host.store.getEffect(
          context.connectionId,
          session.executionId,
        );
        if (name !== "getThread" && prior) return prior;
        const chatId = encodeURIComponent(
          string(object(session.providerThread).chat_id),
        );
        const messageId = encodeURIComponent(session.externalMessageId);
        let method = "POST";
        let path: string;
        let body: ProviderObject | undefined;
        switch (name) {
          case "getThread":
            method = "GET";
            const query=new URLSearchParams();
            if (typeof input.limit==="number") query.set("limit",String(input.limit));
            if (typeof input.order==="string") query.set("order",input.order);
            path = `/chats/${chatId}/messages${query.size?`?${query}`:""}`;
            break;
          case "addReaction":
          case "removeReaction":
            path = `/messages/${messageId}/reactions`;
            body = {
              operation: name === "addReaction" ? "add" : "remove",
              type: reaction(input.emoji),
            };
            break;
          case "createPoll":
            path = `/chats/${chatId}/polls`;
            body = {
              poll: {
                options: (input.options as unknown[]).map((value) =>
                  typeof value === "string" ? { text: value } : object(value),
                ),
                idempotency_key: session.executionId,
              },
            };
            break;
          case "addPollOptions":
            path = `/messages/${messageId}/poll/options`;
            body = {
              options: (input.options as unknown[]).map((value) =>
                typeof value === "string" ? { text: value } : object(value),
              ),
              idempotency_key: session.executionId,
            };
            break;
          case "votePoll":
            path = `/messages/${messageId}/poll/votes`;
            body = {
              option_id: string(input.option_id),
              operation: string(input.operation),
              idempotency_key: session.executionId,
            };
            break;
        }
        const result = await platform(
          fetcher,
          origin,
          token(context),
          method,
          path,
          body,
          name === "getThread" ? undefined : session.executionId,
        );
        if (name !== "getThread")
          host.store.saveEffect(
            context.connectionId,
            session.executionId,
            result,
          );
        return result;
      }
      return {
        name,
        description: `${name} in the current Linq conversation`,
        readOnly: name === "getThread",
        inputSchema: {
          type: "object",
          properties: properties as ProviderObject,
          required: [...required],
          additionalProperties: false,
        },
        outputSchema: { type: "object" },
        execute,
        reconcile: async (input, context) => {
          const id = string(context.session?.executionId);
          const receipt = host.store.getEffect(context.connectionId, id);
          if (receipt) return { status: "applied", result: receipt };
          if (
            name === "createPoll" ||
            name === "addPollOptions" ||
            name === "votePoll"
          )
            return { status: "applied", result: await execute(input, context) };
          if (name === "addReaction" || name === "removeReaction") {
            // Linq documents is_me and per-part reactions; absent data is not proof of absence.
            // https://docs.linqapp.com/channel/imessage/api/resources/messages/methods/retrieve/
            const message = await platform(
              fetcher,
              origin,
              token(context),
              "GET",
              `/messages/${encodeURIComponent(string(context.session?.externalMessageId))}`,
            );
            const firstPart =
              Array.isArray(message.parts) && message.parts[0]
                ? object(message.parts[0])
                : undefined;
            const reactions = firstPart?.reactions ?? message.reactions;
            if (!Array.isArray(reactions))
              return {
                status: "uncertain",
                reason: "Platform omitted reaction state",
              };
            const present = reactions.some((value) => {
              const item = object(value);
              return item.is_me === true && item.type === reaction(input.emoji);
            });
            if (
              (name === "addReaction" && present) ||
              (name === "removeReaction" && !present)
            ) {
              const result = { reconciled: true };
              host.store.saveEffect(context.connectionId, id, result);
              return { status: "applied", result };
            }
            return { status: "absent" };
          }
          return {
            status: "uncertain",
            reason: "Platform outcome is not established",
          };
        },
      };
    },
  );
  async function deliver(input: ProviderDelivery, context: ProviderContext) {
    const chatId = encodeURIComponent(
      string(object(input.providerThread).chat_id),
    );
    const result = await platform(
      fetcher,
      origin,
      token(context),
      "POST",
      `/chats/${chatId}/messages`,
      {
        message: {
          parts: [
            { type: "text", value: input.body },
            ...input.attachments.map((file) => ({
              type: "media",
              url: file.url,
            })),
          ],
        },
      },
      input.deliveryId,
    );
    return { externalMessageId: string(object(result.message).id) };
  }
  const definition = defineChatKitProvider({
    version: "1",
    displayName: "Linq (TypeScript)",
    description:
      "iMessage, RCS and SMS with session-scoped reactions and polls",
    configurationSchema: {
      type: "object",
      properties: {
        phone_numbers: { type: "array", items: { type: "string" } },
        subscription_id: { type: "string" },
      },
      required: ["subscription_id"],
      additionalProperties: false,
    },
    authMethods: [
      {
        id: "api_token",
        displayName: "Linq API token",
        description: "Use a token for an account or selected phone-line pool",
        fields: [
          {
            name: "api_token",
            label: "API token",
            fieldType: "password" as const,
            required: true,
          },
          {
            name: "phone_numbers",
            label: "Phone-line filters",
            fieldType: "text" as const,
          },
        ],
      },
    ],
    capabilities: {
      inbound: true,
      delivery: true,
      attachments: true,
      identity: true,
      maxLength: 1600,
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
        const prior = host.store.findConnection(context.connectionId);
        if (!prior) return;
        const apiToken = string(
          context.secrets.api_token ?? prior.secrets.api_token,
        );
        const subscription =
          context.configuration.subscription_id ??
          prior.configuration.subscription_id;
        if (typeof subscription === "string")
          await platform(
            fetcher,
            origin,
            apiToken,
            "DELETE",
            `/webhook-subscriptions/${encodeURIComponent(subscription)}`,
          );
        else
          await removeOwnedSubscriptions(
            apiToken,
            `${host.webhookBaseUrl}/${encodeURIComponent(context.connectionId)}`,
          );
        host.store.deleteConnection(context.connectionId);
      },
    },
    identity: {
      register: async (_input: ProviderObject, context: ProviderContext) => {
        const lines = Array.isArray(context.configuration.phone_numbers)
          ? context.configuration.phone_numbers
          : [];
        let handle = lines[0];
        if (!handle) {
          const response = await platform(
            fetcher,
            origin,
            token(context),
            "GET",
            "/phone-numbers",
          );
          const numbers = response.phone_numbers;
          if (!Array.isArray(numbers) || numbers.length !== 1)
            throw new Error(
              "Select a phone line when registering an agent address for a pool",
            );
          handle = object(numbers[0]).phone_number;
        }
        const account = { handle };
        return {
          kind: "mobile_number" as const,
          externalId: string(account.handle),
          displayName: "Agent",
        };
      },
      normalizeMentions: async (input: ProviderObject) =>
        (Array.isArray(input.tags) ? input.tags : [])
          .filter(
            (tag): tag is string =>
              typeof tag === "string" && /^\+[1-9]\d{6,14}$/.test(tag),
          )
          .map((tag) => ({
            kind: "mobile_number" as const,
            externalId: tag,
            displayName: tag,
          })),
    },
    messaging: {
      prepareSend: async () => ({}),
      deliver,
      reconcile: async (input: ProviderDelivery, context: ProviderContext) => ({
        status: "applied" as const,
        result: await deliver(input, context),
      }),
    },
    sessionTools,
  });
  async function webhook(
    connectionId: string,
    request: Request,
  ): Promise<Response> {
    const state = host.store.getConnection(connectionId);
    const event = await verifyPlatformWebhook(
      request,
      string(state.secrets.webhook_secret),
      "webhook",
    );
    if (event.event_type !== "message.received")
      return new Response(null, { status: 204 });
    const data = object(event.data);
    const chat = object(data.chat);
    const owner = object(chat.owner_handle);
    const sender = object(data.sender_handle);
    const filters = Array.isArray(state.configuration.phone_numbers)
      ? state.configuration.phone_numbers
      : [];
    if (filters.length && !filters.includes(string(owner.handle)))
      return new Response(null, { status: 204 });
    const eventId = string(event.event_id);
    const client = runtime(host, connectionId, state);
    let draft = host.store.getEvent(connectionId, eventId);
    if (!draft) {
      const chatId = string(chat.id);
      const providerThread = {
        chat_id: chatId,
        owner_handle: string(owner.handle),
      };
      const session = await client.ensureConversation({
        conversationKey: chatId,
        providerThread,
      });
      const texts: string[] = [];
      const attachmentIds: string[] = [];
      for (const value of Array.isArray(data.parts) ? data.parts : []) {
        const part = object(value);
        if (part.type === "text" && typeof part.value === "string")
          texts.push(part.value);
        if (part.type === "media" && typeof part.url === "string") {
          const download = await attachmentContent(host, part.url);
          const upload = await client.uploadAttachment({
            sessionId: session.sessionId,
            content: download.content,
            mediaType: download.mediaType,
          });
          attachmentIds.push(upload.attachmentId);
        }
      }
      draft = host.store.saveEvent(connectionId, {
        eventId,
        externalMessageId: string(data.id),
        conversationKey: chatId,
        sender: {
          externalId: string(sender.handle),
          displayName: string(sender.handle),
          kind: "mobile_number",
        },
        text: texts.join("\n"),
        attachmentIds,
        providerThread,
        providerMetadata: data,
      });
    }
    await client.ingest(draft);
    return new Response(null, { status: 202 });
  }
  return { definition, webhook };
}
