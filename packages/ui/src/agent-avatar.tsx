export interface AgentAvatarProps {
  id: string;
  unread?: boolean;
}

const palettes = [
  { surface: "#204f7c", mark: "#159efa" },
  { surface: "#315e45", mark: "#33c276" },
  { surface: "#743927", mark: "#ff6333" },
] as const;

export function AgentAvatar({ id, unread = false }: AgentAvatarProps) {
  const palette = palettes[stablePalette(id) % palettes.length] ?? palettes[0];
  return (
    <span aria-hidden="true" className="avatar">
      <svg viewBox="0 0 40 40">
        <rect width="40" height="40" rx="9.5" fill={palette.surface} />
        <g fill={palette.mark}>
          <circle cx="12" cy="8" r="2.1" />
          <circle cx="20" cy="8" r="2.1" />
          <circle cx="28" cy="8" r="2.1" />
          <circle cx="8" cy="12" r="2.1" />
          <rect x="12" y="10" width="8" height="4.2" rx="2.1" />
          <circle cx="24" cy="12" r="2.1" />
          <circle cx="32" cy="12" r="2.1" />
          <circle cx="12" cy="16" r="2.1" />
          <rect x="16" y="14" width="12" height="4.2" rx="2.1" />
          <circle cx="8" cy="20" r="2.1" />
          <circle cx="16" cy="20" r="2.1" />
          <circle cx="24" cy="20" r="2.1" />
          <circle cx="32" cy="20" r="2.1" />
          <rect x="10" y="22" width="12" height="4.2" rx="2.1" />
          <circle cx="28" cy="24" r="2.1" />
          <circle cx="8" cy="28" r="2.1" />
          <circle cx="16" cy="28" r="2.1" />
          <rect x="20" y="26" width="12" height="4.2" rx="2.1" />
          <circle cx="12" cy="32" r="2.1" />
          <circle cx="24" cy="32" r="2.1" />
        </g>
      </svg>
      {unread ? <i /> : null}
    </span>
  );
}

function stablePalette(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash);
}
