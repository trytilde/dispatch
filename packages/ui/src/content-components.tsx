import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

export interface AudioPlayerProps {
  name: string;
  src: string;
  suspended?: boolean;
  onUnavailable?: () => void;
}

export function AudioPlayer({ name, src, suspended = false, onUnavailable }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (suspended) audioRef.current?.pause();
  }, [suspended]);

  function togglePlayback(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => onUnavailable?.());
    else audio.pause();
  }

  return (
    <div className="audio-player">
      {!suspended ? (
        <audio
          onDurationChange={(event) => setDuration(finiteDuration(event.currentTarget.duration))}
          onEnded={() => setPlaying(false)}
          onError={onUnavailable}
          onLoadedMetadata={(event) => setDuration(finiteDuration(event.currentTarget.duration))}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          preload="metadata"
          ref={audioRef}
          src={src}
        />
      ) : null}
      <button
        aria-label={`${playing ? "Pause" : "Play"} ${name}`}
        className="audio-player-transport"
        onClick={togglePlayback}
        type="button"
      >
        {playing ? "Ⅱ" : "▶"}
      </button>
      <input
        aria-label={`Seek in ${name}`}
        className="audio-player-scrubber"
        max={duration}
        min={0}
        onChange={(event) => {
          const value = Number.parseFloat(event.currentTarget.value);
          if (!Number.isFinite(value) || !audioRef.current) return;
          audioRef.current.currentTime = value;
          setPosition(value);
        }}
        style={
          {
            "--audio-progress": `${duration > 0 ? (position / duration) * 100 : 0}%`,
          } as React.CSSProperties
        }
        step="any"
        type="range"
        value={Math.min(position, duration)}
      />
      <span className="audio-player-time">
        {formatMediaTime(position)} / {formatMediaTime(duration)}
      </span>
    </div>
  );
}

export interface LinkPreviewMetadata {
  title?: string;
  description?: string;
  hostname?: string;
  faviconUrl?: string;
  imageUrl?: string;
}

export interface LinkPreviewCardProps {
  url: string;
  metadata?: LinkPreviewMetadata;
  compact?: boolean;
}

export function LinkPreviewCard({ url, metadata, compact = false }: LinkPreviewCardProps) {
  const parsed = safeHttpUrl(url);
  if (!parsed) return null;
  const hostname = metadata?.hostname?.trim() || parsed.hostname;
  const title = metadata?.title?.trim() || hostname;
  const description = metadata?.description?.trim();
  return (
    <article className={`link-preview-card ${compact ? "compact" : ""}`}>
      <a href={parsed.href} rel="noopener noreferrer" target="_blank">
        {metadata?.imageUrl && !compact ? (
          <span className="link-preview-image">
            <img alt="" aria-hidden="true" draggable={false} src={metadata.imageUrl} />
          </span>
        ) : null}
        <span className="link-preview-body">
          <strong>{title}</strong>
          {description && !compact ? <span>{description}</span> : null}
          <small>
            {metadata?.faviconUrl ? (
              <img alt="" aria-hidden="true" draggable={false} src={metadata.faviconUrl} />
            ) : (
              <i aria-hidden="true">◎</i>
            )}
            {hostname}
          </small>
        </span>
      </a>
    </article>
  );
}

export type DiagramRenderState = "loading" | "ready" | "error";

export interface DiagramCardProps {
  state?: DiagramRenderState;
  source: string;
  children?: ReactNode;
  error?: string;
  onCopy?: (source: string) => void;
}

export function DiagramCard({
  state = "ready",
  source,
  children,
  error = "The diagram could not be rendered.",
  onCopy,
}: DiagramCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <section className="diagram-card ob-code-block" data-state={state}>
        <div className="diagram-card-actions ob-code-block-copy-overlay">
          <button aria-label="Expand diagram" onClick={() => setExpanded(true)} type="button">
            ↗
          </button>
          {onCopy ? (
            <button
              aria-label={copied ? "Copied" : "Copy code"}
              className="ob-code-block-copy"
              onClick={() => {
                onCopy(source);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2_000);
              }}
              type="button"
            >
              {copied ? "✓" : "▣"}
            </button>
          ) : null}
        </div>
        <DiagramContent error={error} source={source} state={state}>
          {children}
        </DiagramContent>
      </section>
      {expanded ? (
        <DiagramModal onClose={() => setExpanded(false)}>
          <DiagramContent error={error} source={source} state={state}>
            {children}
          </DiagramContent>
        </DiagramModal>
      ) : null}
    </>
  );
}

function DiagramContent({ state, source, error, children }: DiagramCardProps) {
  if (state === "loading")
    return <div className="diagram-loading ob-mermaid-diagram">Rendering diagram...</div>;
  if (state === "error") {
    return (
      <div className="diagram-error ob-mermaid-diagram ob-mermaid-diagram__error" role="alert">
        <strong className="ob-mermaid-diagram__error-header">
          <span aria-hidden="true">⚠</span> Diagram Syntax Error
        </strong>
        <details>
          <summary>View diagram source</summary>
          <pre>{source}</pre>
        </details>
        <small>{error}</small>
      </div>
    );
  }
  return (
    <div className="diagram-content ob-mermaid-diagram ob-mermaid-diagram__content">{children}</div>
  );
}

function DiagramModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return (
    <div aria-label="Diagram" aria-modal="true" className="diagram-modal" role="dialog">
      <div className="diagram-modal-controls ob-expandable-node__modal-controls">
        <button
          aria-label="Zoom in"
          onClick={() =>
            setTransform((value) => ({ ...value, scale: Math.min(10, value.scale * 1.2) }))
          }
        >
          ＋
        </button>
        <button
          aria-label="Zoom out"
          onClick={() =>
            setTransform((value) => ({ ...value, scale: Math.max(0.1, value.scale * 0.8) }))
          }
        >
          −
        </button>
        <button aria-label="Reset zoom" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}>
          ↻
        </button>
        <button aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div
        className="diagram-modal-viewport ob-expandable-node__modal-viewport"
        onPointerDown={startDrag}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const x = event.clientX - drag.x;
          const y = event.clientY - drag.y;
          dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
          setTransform((value) => ({ ...value, x: value.x + x, y: value.y + y }));
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onWheel={(event) => {
          event.preventDefault();
          setTransform((value) => ({
            ...value,
            scale: Math.min(10, Math.max(0.1, value.scale * (event.deltaY < 0 ? 1.05 : 0.95))),
          }));
        }}
      >
        <div
          className="diagram-modal-content ob-expandable-node__transform-content"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function safeHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function finiteDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatMediaTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${tail}` : `${minutes}:${tail}`;
}
