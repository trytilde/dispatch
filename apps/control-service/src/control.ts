import { randomUUID } from "node:crypto";
import { Code, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import { ControlService } from "@tryopenbot/control-service-proto";
import {
  ChatProviderError,
  type ChatMessage,
  type ChatProvider,
  type ChatProviderCallContext,
} from "@tryopenbot/chat-provider";

export function registerControlServices(router: ConnectRouter, chatProvider: ChatProvider): void {
  router.service(ControlService, {
    async listAgents(_request, context) {
      const page = await call(() => chatProvider.listAgents({}, providerContext(context.signal)));
      return {
        agents: page.items.map((agent) => ({
          id: agent.id,
          displayName: agent.displayName,
          status: agent.status,
        })),
      };
    },
    async createSession(request, context) {
      requireValue(request.agentId, "agent_id");
      const session = await call(() =>
        chatProvider.createSession(request.agentId, request.title, providerContext(context.signal)),
      );
      return { id: session.id, agentId: session.agentId, title: session.title };
    },
    async listMessages(request, context) {
      requireValue(request.sessionId, "session_id");
      const page = await call(() =>
        chatProvider.listMessages(
          { sessionId: request.sessionId },
          providerContext(context.signal),
        ),
      );
      return { messages: page.items.map(message) };
    },
    async sendMessage(request, context) {
      requireValue(request.agentId, "agent_id");
      requireValue(request.sessionId, "session_id");
      requireValue(request.text.trim(), "text");
      const page = await call(() =>
        chatProvider.sendMessage(
          request.agentId,
          request.sessionId,
          request.text,
          providerContext(context.signal),
        ),
      );
      return { messages: page.items.map(message) };
    },
  });
}

function providerContext(signal: AbortSignal): ChatProviderCallContext {
  return { requestId: randomUUID(), signal };
}

function message(value: ChatMessage) {
  return {
    id: value.id,
    sessionId: value.sessionId,
    role: value.role,
    text: value.text,
  };
}

async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof ChatProviderError)) throw error;
    throw new ConnectError(error.message, connectCode(error.code));
  }
}

function connectCode(code: ChatProviderError["code"]): Code {
  switch (code) {
    case "invalid_configuration":
    case "internal":
      return Code.Internal;
    case "invalid_request":
      return Code.InvalidArgument;
    case "not_supported":
      return Code.Unimplemented;
    case "not_found":
      return Code.NotFound;
    case "deadline_exceeded":
      return Code.DeadlineExceeded;
    case "provider_unavailable":
      return Code.Unavailable;
    case "permission_denied":
      return Code.PermissionDenied;
  }
}

function requireValue(value: string, name: string): void {
  if (!value) throw new ConnectError(`${name} is required`, Code.InvalidArgument);
}
