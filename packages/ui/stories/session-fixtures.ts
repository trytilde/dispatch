import type { SessionParticipant, ParticipantCandidate } from "@tryopenbot/client-runtime";
export const owner: SessionParticipant = {
  id: "self",
  userId: "me",
  name: "You",
  kind: "human",
  role: "owner",
};
export const assistant: SessionParticipant = {
  id: "assistant-instance",
  agentId: "assistant",
  name: "Assistant",
  kind: "agent",
  role: "member",
};
export const alex: SessionParticipant = {
  id: "alex-instance",
  userId: "alex",
  name: "Alex",
  kind: "human",
  role: "member",
};
export const researcher: SessionParticipant = {
  id: "research-instance",
  agentId: "research",
  name: "Researcher",
  kind: "agent",
  role: "member",
};
export const participantCandidates: ParticipantCandidate[] = [
  { ...assistant, id: "assistant" },
  { ...researcher, id: "research" },
  { id: "blair", userId: "blair", name: "Blair", email: "blair@example.test", kind: "human" },
];

export const apiSource = {
  kind: "api" as const,
  providerId: "chatkit.channel.vercel-ui",
  name: "API",
  inboxId: "example-api-inbox",
};
export const slackSource = {
  kind: "external" as const,
  providerId: "chatkit.channel.slack",
  name: "Slack",
  inboxId: "example-slack-inbox",
};
export const githubSource = {
  kind: "external" as const,
  providerId: "chatkit.channel.github",
  name: "GitHub",
  inboxId: "example-github-inbox",
};
