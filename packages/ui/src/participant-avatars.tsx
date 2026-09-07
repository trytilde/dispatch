import type { SessionParticipant } from "@tryopenbot/client-runtime";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "./components/ui/avatar.js";
import { AgentAvatar } from "./agent-avatar.js";

export type AvatarParticipant = Pick<
  SessionParticipant,
  "id" | "kind" | "name" | "avatarUrl" | "agentId" | "userId"
>;
export function ParticipantAvatar({ participant }: { participant: AvatarParticipant }) {
  return (
    <Avatar className="participant-avatar" aria-label={participant.name}>
      {participant.avatarUrl ? <AvatarImage src={participant.avatarUrl} alt="" /> : null}
      <AvatarFallback>
        {participant.kind === "agent" ? (
          <AgentAvatar id={participant.agentId ?? participant.id} className="!size-full" paused />
        ) : (
          participant.name
            .split(/\s+/)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()
        )}
      </AvatarFallback>
    </Avatar>
  );
}
export function ParticipantAvatarStack({
  participants,
}: {
  participants: readonly AvatarParticipant[];
}) {
  return (
    <AvatarGroup
      className="participant-avatar-stack"
      aria-label={participants.map((participant) => participant.name).join(", ")}
    >
      {participants.slice(0, 3).map((participant) => (
        <ParticipantAvatar key={participant.id} participant={participant} />
      ))}
      {participants.length > 3 ? (
        <Avatar className="participant-avatar">
          <AvatarFallback>+{participants.length - 3}</AvatarFallback>
        </Avatar>
      ) : null}
    </AvatarGroup>
  );
}
export function SessionIcon({
  participants,
  currentUserId,
}: {
  participants: readonly AvatarParticipant[];
  currentUserId?: string;
}) {
  const others = participants.filter(
    (participant) => !currentUserId || participant.userId !== currentUserId,
  );
  const visible = others.length ? others : participants;
  return <ParticipantAvatarStack participants={visible} />;
}
