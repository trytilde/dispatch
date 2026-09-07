import { ConnectorGlyph } from "./connector-components.js";
export interface ConnectorEnableCardProps {
  providerName: string;
  iconUrl?: string;
  disabled?: boolean;
  enabled?: boolean;
  onEnable: () => void;
}
/** A tool event that opens secure provider setup; no credentials or redirect URLs in chat. */
export function ConnectorEnableCard({
  providerName,
  iconUrl,
  disabled,
  enabled,
  onEnable,
}: ConnectorEnableCardProps) {
  return (
    <button className="connector-enable-card" type="button" disabled={disabled} onClick={onEnable}>
      <ConnectorGlyph name={providerName} iconUrl={iconUrl} />
      <span>{enabled ? `${providerName} enabled` : `Click to enable ${providerName}`}</span>
    </button>
  );
}
