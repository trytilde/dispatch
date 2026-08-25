import { z } from "zod";
import { ChatMessagePageSchema } from "./messages.js";
import { QueuedTurnPageSchema } from "./queue.js";
import { ChatSessionSchema, SidebarResponseSchema } from "./sidebar.js";

export const ConversationSnapshotSchema = z.object({
  messages: ChatMessagePageSchema,
  queued_turns: QueuedTurnPageSchema,
  snapshot_revision: z.number(),
});
export type ConversationSnapshot = z.infer<typeof ConversationSnapshotSchema>;

export const MissionControlBootstrapSchema = z.object({
  sidebar: SidebarResponseSchema,
  active_session_id: z.string().optional(),
  active_conversation: ConversationSnapshotSchema.optional(),
});
export type MissionControlBootstrap = z.infer<typeof MissionControlBootstrapSchema>;

export const SubmitTurnResponseSchema = z.object({
  session: ChatSessionSchema,
  conversation: ConversationSnapshotSchema,
});
export type SubmitTurnResponse = z.infer<typeof SubmitTurnResponseSchema>;

export interface AttachmentCompletion {
  attachmentId: string;
  sizeBytes?: number;
  sha256?: string;
}

export interface SubmitTurnInput {
  sessionId?: string;
  title?: string;
  text: string;
  attachments?: AttachmentCompletion[];
}
