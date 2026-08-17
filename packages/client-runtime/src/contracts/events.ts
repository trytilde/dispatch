import { z } from "zod";

export const ChatEventSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  data: z.unknown(),
});
export type ChatEvent = z.infer<typeof ChatEventSchema>;

export interface ActivityEvent extends ChatEvent {
  receivedAt: Date;
}
