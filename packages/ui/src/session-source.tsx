import { CodeIcon, HashIcon } from "lucide-react";
import type { SessionSource } from "@tryopenbot/client-runtime";
export function SessionSourceIcon({ source }: { source: SessionSource }) {
  const icons: Record<string, string> = {
    "chatkit.channel.slack": new URL("./assets/channels/slack.svg", import.meta.url).href,
    "chatkit.channel.github": new URL("./assets/channels/github.svg", import.meta.url).href,
    "chatkit.channel.whatsapp": new URL("./assets/channels/whatsapp.svg", import.meta.url).href,
  };
  const icon = icons[source.providerId] ?? source.iconUrl;
  return icon ? (
    <img data-provider={source.providerId} className="session-source-icon" src={icon} alt="" />
  ) : source.kind === "api" ? (
    <CodeIcon className="session-source-icon" aria-hidden />
  ) : (
    <HashIcon className="session-source-icon" aria-hidden />
  );
}
export function SessionSourceBadge({ source }: { source: SessionSource }) {
  return (
    <span className="session-source" title={`Source: ${source.name}`}>
      <SessionSourceIcon source={source} />
      <span>{source.name}</span>
    </span>
  );
}
