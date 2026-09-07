import { CornerDownRightIcon, GripVerticalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { motion, Reorder, useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ActivityQueueItem {
  id: string;
  text: string;
  queuePosition?: number;
  pending?: boolean;
}

export interface ActivityQueueProps {
  items: readonly ActivityQueueItem[];
  onReorder: (id: string, queuePosition: number) => void;
  onRunNow: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

export function queuePositionForIndex(
  items: readonly ActivityQueueItem[],
  destinationIndex: number,
): number {
  const previous = items[destinationIndex - 1]?.queuePosition;
  const next = items[destinationIndex + 1]?.queuePosition;
  if (typeof previous === "number" && typeof next === "number") {
    return Math.trunc((previous + next) / 2);
  }
  if (typeof next === "number") return next - 1;
  if (typeof previous === "number") return previous + 1;
  return destinationIndex;
}

export function ActivityQueue({
  items,
  onReorder,
  onRunNow,
  onEdit,
  onRemove,
}: ActivityQueueProps) {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [orderedItems, setOrderedItems] = useState([...items]);
  const orderedItemsRef = useRef(orderedItems);
  const panelRef = useRef<HTMLElement>(null);
  const draggedRowRef = useRef<HTMLElement | null>(null);
  const [dragSize, setDragSize] = useState({ width: 0, height: 0 });
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const viewportX = useMotionValue(0);
  const viewportY = useMotionValue(0);

  const syncDragPreview = useCallback(() => {
    const row = draggedRowRef.current;
    const panel = panelRef.current;
    if (!row || !panel) return;
    const rect = row.getBoundingClientRect();
    const frame = panel.getBoundingClientRect();
    viewportX.set(-frame.left - panel.clientLeft);
    viewportY.set(-frame.top - panel.clientTop);
    dragX.set(rect.left);
    dragY.set(rect.top);
  }, [dragX, dragY, viewportX, viewportY]);

  // Follow the real row's projection, including reorder layout changes and the
  // release spring. The preview is outside the scroll viewport, but inside the
  // queue's theme context; it never participates in layout or hit testing.
  useEffect(() => {
    if (!draggedItemId) return;
    let frame: number;
    const update = () => {
      syncDragPreview();
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [draggedItemId, syncDragPreview]);

  useEffect(() => {
    setOrderedItems([...items]);
    const draggedId = draggedRowRef.current?.dataset.queueId;
    if (draggedId && !items.some((item) => item.id === draggedId && !item.pending)) {
      draggedRowRef.current = null;
      setDraggedItemId(null);
    }
  }, [items]);

  useEffect(() => {
    orderedItemsRef.current = orderedItems;
  }, [orderedItems]);

  if (!items.length) return null;

  const finishDrag = (item: ActivityQueueItem) => {
    const sourceIndex = items.findIndex((candidate) => candidate.id === item.id);
    const destinationIndex = orderedItemsRef.current.findIndex(
      (candidate) => candidate.id === item.id,
    );
    if (sourceIndex < 0 || destinationIndex < 0 || sourceIndex === destinationIndex) return;
    onReorder(item.id, queuePositionForIndex(orderedItemsRef.current, destinationIndex));
  };

  const draggedItem = orderedItems.find((item) => item.id === draggedItemId);
  const rowContents = (turn: ActivityQueueItem) => (
    <>
      <span aria-label="Reorder queued message" className="queue-grip">
        <GripVerticalIcon aria-hidden="true" />
      </span>
      <span className="queue-message">{turn.text}</span>
      {turn.pending ? (
        <small className="queue-pending">Queuing…</small>
      ) : (
        <>
          <button
            aria-label="Steer queued message"
            className="queue-steer"
            onClick={() => onRunNow(turn.id)}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <CornerDownRightIcon aria-hidden="true" />
            <span>Steer</span>
          </button>
          <button
            aria-label="Delete queued message"
            className="queue-delete"
            onClick={() => onRemove(turn.id)}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <Trash2Icon aria-hidden="true" />
          </button>
          <button
            aria-label="Edit queued message"
            className="queue-edit"
            onClick={() => onEdit(turn.id)}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <PencilIcon aria-hidden="true" />
          </button>
        </>
      )}
    </>
  );

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      aria-label="Queued messages"
      className="queue-panel"
      data-variant="embedded"
      ref={panelRef}
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <motion.div className="queue-viewport" layoutScroll>
        <Reorder.Group
          axis="y"
          className="queue-list"
          onReorder={setOrderedItems}
          values={orderedItems}
        >
          {orderedItems.map((turn) => (
            <Reorder.Item
              aria-busy={turn.pending || undefined}
              as="li"
              className="queue-item"
              data-dragging={draggedItemId === turn.id || undefined}
              data-pending={turn.pending || undefined}
              drag={!turn.pending}
              key={turn.id}
              onDragEnd={() => finishDrag(turn)}
              onDragStart={(event) => {
                const row =
                  event.target instanceof Element
                    ? event.target.closest<HTMLElement>(".queue-item")
                    : null;
                if (!row) return;
                draggedRowRef.current = row;
                const rect = row.getBoundingClientRect();
                setDragSize({ width: rect.width, height: rect.height });
                syncDragPreview();
                setDraggedItemId(turn.id);
              }}
              onDragTransitionEnd={() => {
                if (draggedRowRef.current?.dataset.queueId !== turn.id) return;
                draggedRowRef.current = null;
                setDraggedItemId(null);
              }}
              data-queue-id={turn.id}
              value={turn}
            >
              {rowContents(turn)}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </motion.div>
      {draggedItem ? (
        <motion.div
          className="queue-drag-layer"
          aria-hidden
          inert
          style={{ x: viewportX, y: viewportY }}
        >
          <motion.div
            className="queue-item queue-drag-preview"
            style={{ width: dragSize.width, height: dragSize.height, x: dragX, y: dragY }}
          >
            {rowContents(draggedItem)}
          </motion.div>
        </motion.div>
      ) : null}
    </motion.section>
  );
}
