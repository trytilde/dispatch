import { describe, expect, it, vi } from "vite-plus/test";
import { createPromptRuntime } from "./prompt.js";
import type { PromptAttachmentPlatform } from "./contracts/prompt.js";
const file = { id: "file-one", name: "photo.png", mediaType: "image/png", sizeBytes: 2048 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(overrides: Partial<PromptAttachmentPlatform> = {}) {
  const platform = {
    createPreviewUrl: vi.fn().mockReturnValue("blob:preview"),
    revokePreviewUrl: vi.fn(),
    releaseFile: vi.fn(),
    sha256: vi.fn().mockResolvedValue("digest"),
    upload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const client = {
    createAttachments: vi.fn().mockResolvedValue([
      {
        attachment: { id: "uploaded", media_type: "image/png", status: "created" },
        upload_url: "https://upload.test/file",
        upload_headers: {},
      },
    ]),
    deleteAttachment: vi.fn().mockResolvedValue(undefined),
    rewriteTildeUploadUrl: (url: string) => url,
  };
  const submit = vi.fn().mockResolvedValue(undefined);
  const runtime = createPromptRuntime({
    client,
    platform,
    ensureSession: async () => "session-one",
    submit,
  });
  return { runtime, client, platform, submit };
}
describe("prompt and attachment lifecycle", () => {
  it("owns preview creation, X removal and URL revocation", async () => {
    const { runtime, platform } = fixture();
    runtime.addAttachments([file]);
    expect(runtime.store.getState().attachments[0]!.previewUrl).toBe("blob:preview");
    await runtime.removeAttachment(file.id);
    expect(runtime.store.getState().attachments).toEqual([]);
    expect(platform.revokePreviewUrl).toHaveBeenCalledExactlyOnceWith("blob:preview");
    expect(platform.releaseFile).toHaveBeenCalledWith(file.id);
  });
  it("uploads, reports progress and submits completion proofs before releasing previews", async () => {
    const { runtime, platform, submit, client } = fixture({
      upload: vi.fn(async (_id, request) => {
        request.onProgress(0.5);
      }),
    });
    runtime.setDraft("See this");
    runtime.addAttachments([file]);
    expect(await runtime.send()).toBe(true);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "See this",
        attachmentCompletions: [{ attachmentId: "uploaded", sizeBytes: 2048, sha256: "digest" }],
      }),
    );
    expect(platform.revokePreviewUrl).toHaveBeenCalledWith("blob:preview");
    expect(runtime.store.getState()).toMatchObject({ draft: "", attachments: [], phase: "idle" });
    expect(client.deleteAttachment).not.toHaveBeenCalled();
  });
  it("cleans up a late upload handshake after removal without sending the removed file", async () => {
    const { runtime, client, submit } = fixture();
    const pending = deferred<Awaited<ReturnType<typeof client.createAttachments>>>();
    client.createAttachments.mockImplementation(() => pending.promise);
    runtime.addAttachments([file]);
    const sending = runtime.send();
    await vi.waitFor(() => expect(client.createAttachments).toHaveBeenCalled());
    await runtime.removeAttachment(file.id);
    pending.resolve([
      {
        attachment: { id: "late", media_type: "image/png", status: "created" },
        upload_url: "https://upload.test",
        upload_headers: {},
      },
    ]);
    await sending;
    expect(client.deleteAttachment).toHaveBeenCalledWith("session-one", "late");
    expect(submit).not.toHaveBeenCalled();
  });
  it("aborts a removed upload and ignores late progress", async () => {
    let aborted = false;
    const { runtime, submit } = fixture({
      upload: (_id, request) =>
        new Promise((_resolve, reject) =>
          request.signal.addEventListener("abort", () => {
            aborted = true;
            request.onProgress(1);
            reject(new Error("aborted"));
          }),
        ),
    });
    runtime.addAttachments([file]);
    const sending = runtime.send();
    await vi.waitFor(() =>
      expect(runtime.store.getState().attachments[0]?.status).toBe("uploading"),
    );
    await Promise.resolve();
    await runtime.removeAttachment(file.id);
    await sending;
    expect(aborted).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    expect(runtime.store.getState().attachments).toEqual([]);
  });
  it("retains the draft and preview for retry on failure", async () => {
    const { runtime, platform, submit } = fixture();
    runtime.setDraft("Keep this");
    runtime.addAttachments([file]);
    submit.mockRejectedValueOnce(new Error("offline"));
    expect(await runtime.send()).toBe(false);
    expect(runtime.store.getState()).toMatchObject({
      draft: "Keep this",
      error: "offline",
      phase: "idle",
    });
    expect(platform.revokePreviewUrl).not.toHaveBeenCalled();
    expect(await runtime.send()).toBe(true);
  });
  it("does not delete attachments already handed to a message when the user navigates away", async () => {
    const { runtime, client, submit } = fixture();
    const pending = deferred<void>();
    submit.mockImplementation(() => pending.promise);
    runtime.setDraft("Send");
    runtime.addAttachments([file]);
    const sending = runtime.send();
    await vi.waitFor(() => expect(submit).toHaveBeenCalled());
    runtime.reset("another-chat");
    pending.resolve();
    await sending;
    expect(client.deleteAttachment).not.toHaveBeenCalled();
    expect(runtime.store.getState()).toMatchObject({
      contextId: "another-chat",
      draft: "",
      phase: "idle",
    });
  });
  it("rejects sends when the session contract does not permit participation", async () => {
    const submit = vi.fn();
    const runtime = createPromptRuntime({
      client: fixture().client,
      ensureSession: async () => "s",
      submit,
      canSend: () => false,
    });
    runtime.setDraft("No");
    expect(await runtime.send()).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });
});
