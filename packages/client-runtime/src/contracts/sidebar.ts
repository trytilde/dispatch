import { z } from "zod";
import { pageSchema, type Page } from "./common.js";

export const ChatSessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable().optional(),
  unread: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  last_user_message_at: z.string().nullable().optional(),
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;

export const ChatAgentSchema = z.object({
  id: z.string().min(1),
  display_name: z.string(),
  provider_id: z.string(),
  status: z.string(),
  last_message_preview: z.string().nullable().optional(),
  last_user_message_at: z.string().nullable().optional(),
  sessions: pageSchema(ChatSessionSchema),
});
export type ChatAgent = z.infer<typeof ChatAgentSchema>;

export const SidebarResponseSchema = pageSchema(ChatAgentSchema);
export type SidebarResponse = Page<ChatAgent>;

export const ChatSessionPageSchema = pageSchema(ChatSessionSchema);
export type ChatSessionPage = Page<ChatSession>;

export type AgentSortOrder = "updated_at" | "created_at" | "manual";
export type SessionSortOrder = "updated_at" | "created_at";
