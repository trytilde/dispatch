import { createStore } from "zustand/vanilla";
import type { OpenBotClient } from "./chat/client.js";
import type { SendMessageInput } from "./state/runtime.js";
import type { AttachmentCompletion } from "./contracts/workspace.js";
import type {
  PromptAttachment,
  PromptAttachmentPlatform,
  PromptFileDescriptor,
  PromptState,
} from "./contracts/prompt.js";
import { errorMessage } from "./errors.js";

type UploadRecord = { sessionId: string; attachmentId: string; completion: AttachmentCompletion };
export function createPromptRuntime(options: {
  client: Pick<OpenBotClient, "createAttachments" | "deleteAttachment" | "rewriteTildeUploadUrl">;
  platform?: PromptAttachmentPlatform;
  ensureSession: (title?: string) => Promise<string>;
  submit: (input: SendMessageInput) => Promise<void>;
  canSend?: () => boolean;
}) {
  const store = createStore<PromptState>(() => ({
    contextId: "",
    draft: "",
    attachments: [],
    phase: "idle",
    error: "",
  }));
  const uploads = new Map<string, UploadRecord>();
  const controllers = new Map<string, AbortController>();
  let epoch = 0;
  function updateFile(id: string, patch: Partial<PromptAttachment>) {
    store.setState((state) => ({
      attachments: state.attachments.map((file) => (file.id === id ? { ...file, ...patch } : file)),
    }));
  }
  function release(file: PromptAttachment) {
    controllers.get(file.id)?.abort();
    controllers.delete(file.id);
    if (file.previewUrl) options.platform?.revokePreviewUrl(file.previewUrl);
    options.platform?.releaseFile(file.id);
  }
  async function removeAttachment(id: string): Promise<void> {
    if (store.getState().phase === "sending") return;
    const file = store.getState().attachments.find((file) => file.id === id);
    if (!file) return;
    release(file);
    store.setState((state) => ({
      attachments: state.attachments.filter((file) => file.id !== id),
    }));
    const upload = uploads.get(id);
    uploads.delete(id);
    const current = epoch;
    if (upload)
      try {
        await options.client.deleteAttachment(upload.sessionId, upload.attachmentId);
      } catch (error) {
        if (current === epoch) store.setState({ error: errorMessage(error) });
      }
  }
  function clearAttachments(deleteUploaded = true) {
    if (store.getState().phase === "sending") deleteUploaded = false;
    const files = store.getState().attachments;
    for (const file of files) {
      release(file);
      const upload = uploads.get(file.id);
      uploads.delete(file.id);
      if (deleteUploaded && upload)
        void options.client
          .deleteAttachment(upload.sessionId, upload.attachmentId)
          .catch(() => undefined);
    }
    store.setState({ attachments: [] });
  }
  function reset(contextId = "") {
    epoch++;
    clearAttachments();
    store.setState({ contextId, draft: "", attachments: [], phase: "idle", error: "" }, true);
  }
  function addAttachments(incoming: readonly PromptFileDescriptor[]) {
    const current = store.getState().attachments;
    const accepted: PromptAttachment[] = [];
    for (const input of incoming) {
      if (
        current.some((file) => file.id === input.id) ||
        accepted.some((file) => file.id === input.id)
      )
        continue;
      if (current.length + accepted.length >= 10) {
        options.platform?.releaseFile(input.id);
        continue;
      }
      const previewUrl = options.platform?.createPreviewUrl(input.id);
      accepted.push({
        ...input,
        status: "ready",
        progress: 0,
        ...(previewUrl ? { previewUrl } : {}),
      });
    }
    store.setState({ attachments: [...current, ...accepted], error: "" });
  }
  async function prepareAttachment(
    file: PromptAttachment,
    sessionId: string,
  ): Promise<UploadRecord | undefined> {
    const platform = options.platform;
    if (!platform) throw new Error("Attachment uploads are unavailable on this platform");
    const previous = uploads.get(file.id);
    if (previous?.sessionId === sessionId && file.status === "uploaded") return previous;
    const current = epoch;
    const controller = new AbortController();
    controllers.set(file.id, controller);
    const exists = () =>
      current === epoch &&
      !controller.signal.aborted &&
      store.getState().attachments.some((item) => item.id === file.id);
    updateFile(file.id, {
      status: "uploading",
      progress: 0,
      error: undefined,
      attachmentId: undefined,
    });
    let allocated: UploadRecord | undefined;
    try {
      const digest = await platform.sha256(file.id, controller.signal);
      if (!exists()) return;
      const created = await options.client.createAttachments(sessionId, [
        {
          filename: file.name,
          mediaType: file.mediaType,
          sizeBytes: file.sizeBytes,
          sha256: digest,
        },
      ]);
      const upload = created[0];
      if (!upload) throw new Error("The attachment upload handshake was empty");
      allocated = {
        sessionId,
        attachmentId: upload.attachment.id,
        completion: {
          attachmentId: upload.attachment.id,
          sizeBytes: file.sizeBytes,
          sha256: digest,
        },
      };
      if (!exists()) {
        await options.client
          .deleteAttachment(sessionId, upload.attachment.id)
          .catch(() => undefined);
        return;
      }
      uploads.set(file.id, allocated);
      await platform.upload(file.id, {
        url: options.client.rewriteTildeUploadUrl(upload.upload_url),
        headers: upload.upload_headers,
        signal: controller.signal,
        onProgress: (progress) => {
          if (exists())
            updateFile(file.id, {
              progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0,
            });
        },
      });
      if (!exists()) return;
      updateFile(file.id, { status: "uploaded", progress: 1, attachmentId: upload.attachment.id });
      return allocated;
    } catch (error) {
      if (!exists()) return;
      if (allocated) {
        await options.client
          .deleteAttachment(sessionId, allocated.attachmentId)
          .catch(() => undefined);
        uploads.delete(file.id);
      }
      updateFile(file.id, { status: "error", error: errorMessage(error) });
      throw error;
    } finally {
      if (controllers.get(file.id) === controller) controllers.delete(file.id);
    }
  }
  async function send(): Promise<boolean> {
    const snapshot = store.getState();
    if (snapshot.phase !== "idle" || (!snapshot.draft.trim() && !snapshot.attachments.length))
      return false;
    if (options.canSend && !options.canSend()) {
      store.setState({ error: "You cannot send messages to this session." });
      return false;
    }
    const current = epoch;
    const text = snapshot.draft.trim();
    store.setState({ phase: snapshot.attachments.length ? "uploading" : "sending", error: "" });
    try {
      const title = (text || snapshot.attachments.map((file) => file.name).join(", ")).slice(0, 80);
      const sessionId = snapshot.attachments.length
        ? await options.ensureSession(title)
        : undefined;
      if (current !== epoch) return false;
      const prepared = sessionId
        ? await Promise.all(snapshot.attachments.map((file) => prepareAttachment(file, sessionId)))
        : [];
      if (current !== epoch) return false;
      const outgoing = prepared.flatMap((upload, index) =>
        upload &&
        store.getState().attachments.some((file) => file.id === snapshot.attachments[index]!.id)
          ? [{ upload, file: snapshot.attachments[index]! }]
          : [],
      );
      if (!text && !outgoing.length) return false;
      store.setState({ phase: "sending" });
      await options.submit({
        text,
        title,
        attachmentIds: outgoing.map((item) => item.upload.attachmentId),
        attachmentCompletions: outgoing.map((item) => item.upload.completion),
        optimisticParts: [
          ...(text ? [{ type: "text", text }] : []),
          ...outgoing.map(({ upload, file }) => ({
            type: "file",
            filename: file.name,
            media_type: file.mediaType,
            attachment_id: upload.attachmentId,
            url: `tilde://chatkit/attachments/${upload.attachmentId}`,
          })),
        ],
      });
      if (current !== epoch) return false;
      // Successful submission has linked the uploads; X/cancel deletes only unsubmitted ones.
      const ids = new Set(snapshot.attachments.map((file) => file.id));
      for (const file of store.getState().attachments)
        if (ids.has(file.id)) {
          uploads.delete(file.id);
          release(file);
        }
      store.setState((state) => ({
        draft: state.draft === snapshot.draft ? "" : state.draft,
        attachments: state.attachments.filter((file) => !ids.has(file.id)),
      }));
      return true;
    } catch (error) {
      if (current === epoch) store.setState({ error: errorMessage(error) });
      return false;
    } finally {
      if (current === epoch) store.setState({ phase: "idle" });
    }
  }
  return {
    store,
    addAttachments,
    removeAttachment,
    clearAttachments,
    send,
    reset,
    dispose: () => reset(),
    setDraft: (draft: string) => store.setState({ draft, error: "" }),
    setError: (error: string) => store.setState({ error }),
  };
}
export type PromptRuntime = ReturnType<typeof createPromptRuntime>;
