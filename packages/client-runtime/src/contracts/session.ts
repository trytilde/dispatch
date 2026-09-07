import { z } from "zod";

export const SessionParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["human", "agent"]),
  userId: z.string().optional(),
  agentId: z.string().optional(),
  avatarUrl: z.string().optional(),
  role: z.enum(["owner", "admin", "member"]).optional(),
});
export type SessionParticipant = z.infer<typeof SessionParticipantSchema>;
export interface ParticipantCandidate extends SessionParticipant {
  email?: string;
}
export const TeamPeoplePageSchema = z.object({
  items: z.array(
    z.object({
      user: z.object({
        id: z.string(),
        display_name: z.string().nullish(),
        email: z.string().nullish(),
        user_type: z.string(),
      }),
    }),
  ),
  next_page_token: z.string().nullish(),
});
export interface ChatFindShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
}
export function isChatFindShortcut(event: ChatFindShortcut): boolean {
  return Boolean(
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.defaultPrevented &&
    !event.isComposing &&
    event.key.toLowerCase() === "f",
  );
}

/** API-backed channel IDs defined by Tilde ChatKit, rather than inferred provider-name prefixes. */
export const API_CHAT_PROVIDER_IDS = new Set([
  "chatkit.channel.vercel-ui",
  "chatkit.channel.text",
  "chatkit.channel.agent-message",
]);
export interface SessionSource {
  kind: "api" | "external";
  providerId: string;
  name: string;
  iconUrl?: string;
  inboxId: string;
}
export type SessionAccess =
  | { kind: "enabled" }
  | { kind: "checking" }
  | { kind: "external"; source: SessionSource }
  | { kind: "join-required" }
  | { kind: "unavailable"; message: string };
export const ChatChannelsSchema = z.array(
  z.object({
    id: z.string(),
    display_name: z.string(),
    icon_url: z.string().nullish(),
    providers: z.array(z.object({ id: z.string(), display_name: z.string() })),
  }),
);
export type ChatChannelDescriptor = z.infer<typeof ChatChannelsSchema>[number];
