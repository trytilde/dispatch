import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { SessionParticipant, SessionSource } from "@tryopenbot/client-runtime";
import { ChatHeader, SessionParticipantsDialog } from "@tryopenbot/ui";
import { useChatExample } from "./chat-preview.js";
import {
  owner,
  assistant,
  alex,
  researcher,
  participantCandidates,
  apiSource,
  slackSource,
  githubSource,
} from "./session-fixtures.js";
const meta = {
  title: "Chat/Controls",
  parameters: { layout: "fullscreen", chatPlacement: "header" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function HeaderExample({
  initialParticipants = [owner, assistant, alex],
  initialName = "Launch review",
  source = apiSource,
}: {
  initialParticipants?: SessionParticipant[];
  initialName?: string;
  source?: SessionSource;
}) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [name, setName] = useState(initialName);
  const [managing, setManaging] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <>
      <ChatHeader
        participants={participants}
        currentUserId="me"
        source={source}
        sessionName={name || undefined}
        onRenameSession={async (title) => setName(title)}
        onManageParticipants={() => setManaging(true)}
      />
      <SessionParticipantsDialog
        open={managing}
        participants={participants}
        candidates={participantCandidates.filter(
          (candidate) =>
            `${candidate.name} ${candidate.email ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            !participants.some((person) =>
              candidate.kind === "agent"
                ? person.agentId === candidate.agentId
                : person.userId === candidate.userId,
            ),
        )}
        onSearch={setQuery}
        currentUserId="me"
        onClose={() => setManaging(false)}
        onRemove={(id) =>
          setParticipants((current) => current.filter((person) => person.id !== id))
        }
        onAdd={(candidate) =>
          setParticipants((current) => [...current, { ...candidate, role: "member" }])
        }
      />
    </>
  );
}
function HeaderVariants() {
  return useChatExample() ? (
    <HeaderExample />
  ) : (
    <div className="chat-story-header-variants">
      <div>
        <small>Single agent</small>
        <HeaderExample initialParticipants={[owner, assistant]} initialName="" />
      </div>
      <div>
        <small>Single person</small>
        <HeaderExample initialParticipants={[owner, alex]} initialName="" />
      </div>
      <div>
        <small>Group</small>
        <HeaderExample
          initialParticipants={[owner, assistant, alex, researcher]}
          source={githubSource}
          initialName=""
        />
      </div>
      <div>
        <small>Named session</small>
        <HeaderExample source={slackSource} />
      </div>
    </div>
  );
}
export const Header: Story = { render: () => <HeaderVariants /> };
import { FindChatExample } from "./find-in-chat-example.js";
export const FindInChat: Story = {
  parameters: { chatOwnLayout: true },
  render: () => <FindChatExample />,
};
