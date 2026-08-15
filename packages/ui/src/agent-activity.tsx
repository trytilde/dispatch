export interface ActivityQueueItem {
  id: string;
  text: string;
}

export interface ActivityTimelineItem {
  id: string;
  name: string;
  timestamp: string;
  summary?: string;
}

export interface AgentActivityProps {
  queue: readonly ActivityQueueItem[];
  events: readonly ActivityTimelineItem[];
  onMoveEarlier: (id: string) => void;
  onMoveLater: (id: string) => void;
  onRunNow: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

export function AgentActivity({
  queue,
  events,
  onMoveEarlier,
  onMoveLater,
  onRunNow,
  onEdit,
  onRemove,
}: AgentActivityProps) {
  return (
    <>
      {queue.length ? (
        <section className="queue-panel">
          <header>
            <strong>Queued turns</strong>
            <span>{queue.length}</span>
          </header>
          {queue.map((turn, index) => (
            <article key={turn.id}>
              <span>{index + 1}</span>
              <p>{turn.text}</p>
              <div>
                <button
                  disabled={index === 0}
                  onClick={() => onMoveEarlier(turn.id)}
                  title="Move earlier"
                >
                  ↑
                </button>
                <button
                  disabled={index === queue.length - 1}
                  onClick={() => onMoveLater(turn.id)}
                  title="Move later"
                >
                  ↓
                </button>
                <button onClick={() => onRunNow(turn.id)}>Run now</button>
                <button onClick={() => onEdit(turn.id)}>Edit</button>
                <button onClick={() => onRemove(turn.id)}>Remove</button>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {events.length === 0 ? (
        <div className="activity-empty">
          <span>⌁</span>
          <h3>Agent activity</h3>
          <p>Tool calls, turn status, child agents, and streaming events appear here.</p>
        </div>
      ) : (
        <ol className="event-list">
          {events.map((event) => (
            <li key={event.id}>
              <span className="event-dot" />
              <div>
                <strong>{event.name}</strong>
                <time>{event.timestamp}</time>
                {event.summary ? <p>{event.summary}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
