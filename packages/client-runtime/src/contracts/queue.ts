import { z } from "zod";
import { pageSchema, type Page } from "./common.js";

export const QueuedTurnSchema = z.object({
  id: z.string().min(1),
  session_id: z.string(),
  queue_position: z.number(),
  status: z.string(),
  chat_request: z.record(z.string(), z.unknown()),
  trigger_message_ids: z.array(z.string()).optional(),
  created_at: z.string(),
});
export type QueuedTurn = z.infer<typeof QueuedTurnSchema>;

export const QueuedTurnPageSchema = pageSchema(QueuedTurnSchema);
export type QueuedTurnPage = Page<QueuedTurn>;
