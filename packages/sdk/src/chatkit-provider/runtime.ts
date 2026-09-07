import { type Config, createConfig } from "../config";
import { requestJson } from "../internal/fetch-client";
import { teamPath } from "../internal/paths";
import type {
  ProviderExternalIdentity,
  ProviderInboundMessage,
  ProviderJson,
  ProviderObject,
} from "./types";

/** A connection credential has no general team or user impersonation authority. */
export function createProviderRuntimeClient(
  options: Pick<Config, "baseUrl" | "orgId" | "teamId" | "orgSubdomain" | "fetch"> & {
    connectionId: string;
    token: string;
  },
) {
  const config = createConfig({ ...options, bearerToken: options.token });
  const base =
    teamPath(config, "/api/v1/team/{team_id}/chatkit/custom-connections") +
    `/${encodeURIComponent(options.connectionId)}`;
  const command = <T>(body: ProviderObject) =>
    requestJson<T>(config, { method: "POST", path: `${base}/runtime`, body });
  return {
    async registerAgentIdentity(): Promise<ProviderJson> {
      return command({ operation: "register_agent_identity" });
    },
    async normalizeMentions(input: { tags: string[] }): Promise<ProviderJson> {
      return command({ operation: "normalize_mentions", tags: input.tags });
    },
    async ensureConversation(input: {
      conversationKey: string;
      title?: string;
      providerThread?: ProviderJson;
    }): Promise<{ sessionId: string }> {
      const result = await command<{ session_id: string }>({
        operation: "ensure_conversation",
        conversation_key: input.conversationKey,
        title: input.title ?? null,
        provider_thread: input.providerThread ?? {},
      });
      return { sessionId: result.session_id };
    },
    async upsertParticipant(input: {
      sessionId: string;
      identity: ProviderExternalIdentity;
    }): Promise<ProviderJson> {
      return command({
        operation: "upsert_participant",
        session_id: input.sessionId,
        identity: {
          external_id: input.identity.externalId,
          display_name: input.identity.displayName,
          kind: input.identity.kind,
        },
      });
    },
    async leaveParticipant(input: { sessionId: string; externalId: string }): Promise<void> {
      await command({
        operation: "leave_participant",
        session_id: input.sessionId,
        external_id: input.externalId,
      });
    },
    async history(input: {
      sessionId: string;
      pageSize?: number;
      nextPageToken?: string;
    }): Promise<{
      messages: {
        id: string;
        role: string;
        text: string;
        senderDisplayName: string;
        createdAt: string;
      }[];
      nextPageToken?: string;
    }> {
      const result = await command<{
        messages: {
          id: string;
          role: string;
          text: string;
          sender_display_name: string;
          created_at: string;
        }[];
        next_page_token?: string;
      }>({
        operation: "history",
        session_id: input.sessionId,
        page_size: input.pageSize ?? 100,
        next_page_token: input.nextPageToken ?? null,
      });
      return {
        messages: result.messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          senderDisplayName: m.sender_display_name,
          createdAt: m.created_at,
        })),
        ...(result.next_page_token ? { nextPageToken: result.next_page_token } : {}),
      };
    },
    async uploadAttachment(input: {
      sessionId: string;
      content: Uint8Array;
      mediaType: string;
      filename?: string;
    }): Promise<{ attachmentId: string }> {
      const result = await command<{
        upload: {
          attachment: { id: string };
          upload_url: string;
          upload_headers: Record<string, string>;
        };
      }>({
        operation: "create_attachment_upload",
        session_id: input.sessionId,
        media_type: input.mediaType,
        filename: input.filename ?? null,
        size_bytes: input.content.byteLength,
      });
      const upload = await (options.fetch ?? fetch)(result.upload.upload_url, {
        method: "PUT",
        headers: result.upload.upload_headers,
        body: new Blob([Uint8Array.from(input.content)], {
          type: input.mediaType,
        }),
      });
      if (!upload.ok) throw new Error(`Provider attachment upload failed: ${upload.status}`);
      await command({
        operation: "complete_attachment_upload",
        session_id: input.sessionId,
        attachment_id: result.upload.attachment.id,
        size_bytes: input.content.byteLength,
        sha256: null,
      });
      return { attachmentId: result.upload.attachment.id };
    },
    async attachmentDownload(input: {
      sessionId: string;
      attachmentId: string;
    }): Promise<{ downloadUrl: string; expiresAt: string }> {
      const result = await command<{
        download: { download_url: string; expires_at: string };
      }>({
        operation: "attachment_download",
        session_id: input.sessionId,
        attachment_id: input.attachmentId,
      });
      return {
        downloadUrl: result.download.download_url,
        expiresAt: result.download.expires_at,
      };
    },
    async ingest(
      message: ProviderInboundMessage,
    ): Promise<{ eventId: string; messageId: string; status: string }> {
      const raw = await requestJson<{
        event_id: string;
        message_id: string;
        status: string;
      }>(config, {
        method: "POST",
        path: `${base}/messages`,
        body: {
          event_id: message.eventId,
          conversation_key: message.conversationKey,
          external_message_id: message.externalMessageId,
          sender: {
            external_id: message.sender.externalId,
            display_name: message.sender.displayName,
            kind: message.sender.kind,
          },
          text: message.text,
          attachment_ids: message.attachmentIds ?? [],
          provider_thread: message.providerThread ?? {},
          provider_metadata: message.providerMetadata ?? {},
        },
      });
      return {
        eventId: raw.event_id,
        messageId: raw.message_id,
        status: raw.status,
      };
    },
  };
}
