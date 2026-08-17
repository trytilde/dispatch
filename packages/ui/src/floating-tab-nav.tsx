export interface FloatingTab {
  id: string;
  label: string;
}

export interface FloatingTabNavProps {
  tabs: readonly FloatingTab[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Optional action button that fades in to the right of the tabs. */
  action?: {
    label: string;
    visible: boolean;
    busy?: boolean;
    onClick: () => void;
  };
}

/** Floating pill navigation anchored above the composer, e.g. Build / Test with Deploy. */
export function FloatingTabNav({ tabs, activeId, onSelect, action }: FloatingTabNavProps) {
  return (
    <div className="floating-tab-nav">
      <div className="floating-tab-nav-pill" role="tablist" aria-label="Agent workflow">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === activeId}
            className={tab.id === activeId ? "active" : ""}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {action ? (
        <button
          type="button"
          className={`floating-tab-nav-action${action.visible ? " visible" : ""}${action.busy ? " busy" : ""}`}
          aria-hidden={!action.visible}
          tabIndex={action.visible ? 0 : -1}
          disabled={!action.visible || action.busy}
          onClick={action.onClick}
        >
          {action.busy ? "Deploying…" : action.label}
        </button>
      ) : null}
    </div>
  );
}
