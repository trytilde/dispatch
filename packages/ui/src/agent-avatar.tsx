export interface AgentAvatarProps {
  id: string;
  unread?: boolean;
}

const avatarSources = [
  new URL("./assets/avatars/blue.svg", import.meta.url).href,
  new URL("./assets/avatars/green.svg", import.meta.url).href,
  new URL("./assets/avatars/red.svg", import.meta.url).href,
] as const;

export function AgentAvatar({ id, unread = false }: AgentAvatarProps) {
  const source = avatarSources[stablePalette(id) % avatarSources.length] ?? avatarSources[0];
  return (
    <span aria-hidden="true" className="avatar">
      <img alt="" draggable={false} src={source} />
      {unread ? <i /> : null}
    </span>
  );
}

function stablePalette(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash);
}
