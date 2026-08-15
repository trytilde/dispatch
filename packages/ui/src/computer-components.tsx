export interface ComputerMonitor {
  id: string;
  title: string;
  previewUrl: string;
  needsAttention?: boolean;
}

export interface ComputerMonitorStripProps {
  monitors: readonly ComputerMonitor[];
  activeMonitorId?: string;
  onSelect: (monitorId: string) => void;
}

const visibleMonitorLimit = 3;

export function ComputerMonitorStrip({
  monitors,
  activeMonitorId,
  onSelect,
}: ComputerMonitorStripProps) {
  if (monitors.length < 2) return null;
  const hasOverflow = monitors.length > visibleMonitorLimit + 1;
  const visible = hasOverflow ? monitors.slice(0, visibleMonitorLimit) : monitors;
  const overflow = hasOverflow ? monitors.slice(visibleMonitorLimit) : [];
  return (
    <div aria-label="Computer screens" className="computer-monitor-strip" role="group">
      {visible.map((monitor) => (
        <ComputerMonitorButton
          active={monitor.id === activeMonitorId}
          key={monitor.id}
          monitor={monitor}
          onSelect={onSelect}
        />
      ))}
      {overflow.length ? (
        <details className="computer-monitor-more">
          <summary aria-label={`Show ${overflow.length} more screens`}>
            <span className="computer-monitor-more-preview">⌑</span>
            <span>and {overflow.length} more</span>
          </summary>
          <div aria-label="More screens" role="menu">
            {overflow.map((monitor) => (
              <button key={monitor.id} onClick={() => onSelect(monitor.id)} role="menuitem">
                {monitor.title}
                {monitor.needsAttention ? <i aria-label="Needs attention" /> : null}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ComputerMonitorButton({
  monitor,
  active,
  onSelect,
}: {
  monitor: ComputerMonitor;
  active: boolean;
  onSelect: (monitorId: string) => void;
}) {
  const label = monitor.needsAttention
    ? `${monitor.title} — needs you`
    : `Switch to ${monitor.title}`;
  return (
    <button
      aria-current={active}
      aria-label={label}
      className="computer-monitor-thumb"
      onClick={() => onSelect(monitor.id)}
      title={label}
      type="button"
    >
      <span className="computer-monitor-preview">
        <iframe aria-hidden="true" src={monitor.previewUrl} tabIndex={-1} title="" />
        <span aria-hidden="true" />
      </span>
      <span className="computer-monitor-caption">
        {monitor.needsAttention ? <i aria-hidden="true" /> : null}
        <span>{monitor.title}</span>
      </span>
    </button>
  );
}
