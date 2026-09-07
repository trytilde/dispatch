import { useEffect, type RefObject, type FocusEventHandler } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { shouldSubmitComposerKey } from "./chat-composer.js";

/** Rich editing stays in UI; the runtime stores and sends ordinary Markdown. */
export function MarkdownPromptInput({
  draft,
  onChange,
  disabled,
  placeholder,
  inputRef,
  onFocus,
  onBlur,
}: {
  draft: string;
  onChange: (markdown: string) => void;
  disabled: boolean;
  placeholder: string;
  inputRef: RefObject<HTMLElement | null>;
  onFocus?: FocusEventHandler<HTMLElement>;
  onBlur?: FocusEventHandler<HTMLElement>;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), Markdown],
    content: draft,
    contentType: "markdown",
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Message",
        "aria-multiline": "true",
        "data-placeholder": placeholder,
        class: "markdown-prompt-input",
      },
      handleKeyDown(view, event) {
        if (
          shouldSubmitComposerKey({
            key: event.key,
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            composing: event.isComposing || view.composing,
            coarsePointer: window.matchMedia("(pointer: coarse)").matches,
          })
        ) {
          event.preventDefault();
          view.dom.closest("form")?.requestSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getMarkdown()),
  });
  useEffect(() => {
    if (!editor) return;
    inputRef.current = editor.view.dom;
    return () => {
      inputRef.current = null;
    };
  }, [editor, inputRef]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(() => {
    if (editor && draft !== (editor.isEmpty ? "" : editor.getMarkdown()))
      editor.commands.setContent(draft, { contentType: "markdown", emitUpdate: false });
  }, [editor, draft]);
  return (
    <div className="markdown-prompt-frame" onFocus={onFocus} onBlur={onBlur}>
      <EditorContent editor={editor} />
    </div>
  );
}
