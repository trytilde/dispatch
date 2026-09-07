import { useEffect, useId, useRef, type RefObject } from "react";

const activeRanges = new Map<string, Range[]>();
/** DOM highlighting/scrolling port for the runtime's selected search result. */
export function useChatFindHighlight({
  rootRef,
  query,
  messageId,
  revision,
  focusNonce = 0,
}: {
  rootRef: RefObject<HTMLElement | null>;
  query: string;
  messageId?: string;
  revision: unknown;
  focusNonce?: number;
}) {
  const key = useId();
  const focused = useRef<
    { element: HTMLElement; token: string; animation?: Animation } | undefined
  >(undefined);
  useEffect(() => {
    const root = rootRef.current;
    const current =
      query.trim() && messageId
        ? [...(root?.querySelectorAll<HTMLElement>("[data-message-id]") ?? [])].find(
            (node) => node.dataset.messageId === messageId,
          )
        : undefined;
    const token = JSON.stringify([query.trim(), messageId, focusNonce]);
    if (current && focused.current?.element === current && focused.current.token === token) return;
    focused.current?.animation?.cancel();
    focused.current?.element.classList.remove("chat-find-current");
    focused.current = undefined;
    if (!current) return;
    current.classList.add("chat-find-current");
    current.scrollIntoView({ block: "center", behavior: "smooth" });
    const surface =
      current.querySelector<HTMLElement>(".message-bubble, .message-attachment-chip") ?? current;
    const background = getComputedStyle(surface).backgroundColor;
    const animation = surface.animate?.(
      [
        { backgroundColor: background },
        { backgroundColor: "var(--accent)", offset: 0.5 },
        { backgroundColor: background },
      ],
      { duration: 750, iterations: 3, easing: "ease-in-out" },
    );
    focused.current = { element: current, token, animation };
  }, [rootRef, query, messageId, revision, focusNonce]);
  useEffect(
    () => () => {
      focused.current?.animation?.cancel();
      focused.current?.element.classList.remove("chat-find-current");
    },
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !query.trim() || !messageId) return;
    const matches = [...root.querySelectorAll<HTMLElement>("[data-message-id]")];
    const ranges: Range[] = [];
    for (const message of matches) {
      const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
          node.parentElement?.closest("button,time,[aria-hidden=true]")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      });
      const nodes: Text[] = [];
      let node = walker.nextNode();
      while (node) {
        nodes.push(node as Text);
        node = walker.nextNode();
      }
      const text = nodes
        .map((node) => node.data)
        .join("")
        .toLowerCase();
      const needle = query.trim().toLowerCase();
      for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) {
        let offset = 0;
        const range = document.createRange();
        for (const node of nodes) {
          const end = offset + node.length;
          if (at >= offset && at < end) range.setStart(node, at - offset);
          if (at + needle.length > offset && at + needle.length <= end) {
            range.setEnd(node, at + needle.length - offset);
            break;
          }
          offset = end;
        }
        ranges.push(range);
      }
    }
    activeRanges.set(key, ranges);
    const refresh = () => {
      if (typeof Highlight !== "undefined" && globalThis.CSS?.highlights)
        CSS.highlights.set("chat-find-match", new Highlight(...[...activeRanges.values()].flat()));
    };
    refresh();
    return () => {
      activeRanges.delete(key);
      refresh();
    };
  }, [rootRef, query, messageId, revision, key]);
}
