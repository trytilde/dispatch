import type { PromptAttachmentPlatform, PromptFileDescriptor } from "@tryopenbot/client-runtime";

/** Browser bytes and blob APIs stay at the platform boundary. Runtime owns their lifecycle. */
export function createWebAttachments() {
  const files = new Map<string, File>();
  const get = (id: string) => {
    const file = files.get(id);
    if (!file) throw new Error("The selected file is no longer available");
    return file;
  };
  const platform: PromptAttachmentPlatform = {
    createPreviewUrl(id) {
      const file = get(id);
      return file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
    },
    revokePreviewUrl: (url) => URL.revokeObjectURL(url),
    releaseFile: (id) => {
      files.delete(id);
    },
    async sha256(id, signal) {
      signal.throwIfAborted();
      const bytes = await get(id).arrayBuffer();
      signal.throwIfAborted();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      signal.throwIfAborted();
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    },
    upload(id, { url, headers, signal, onProgress }) {
      return new Promise<void>((resolve, reject) => {
        const file = get(id);
        const request = new XMLHttpRequest();
        const cleanup = () => signal.removeEventListener("abort", abort);
        const abort = () => {
          request.abort();
          cleanup();
          reject(new DOMException("Upload aborted", "AbortError"));
        };
        if (signal.aborted) {
          abort();
          return;
        }
        request.open("PUT", url);
        for (const [key, value] of Object.entries(headers)) request.setRequestHeader(key, value);
        if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type"))
          request.setRequestHeader("content-type", file.type || "application/octet-stream");
        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) onProgress(event.loaded / event.total);
        });
        request.addEventListener("load", () => {
          cleanup();
          if (request.status >= 200 && request.status < 300) resolve();
          else reject(new Error(`Attachment upload failed (${request.status})`));
        });
        request.addEventListener("error", () => {
          cleanup();
          reject(new Error("Attachment upload failed"));
        });
        signal.addEventListener("abort", abort, { once: true });
        request.send(file);
      });
    },
  };
  return {
    platform,
    register(incoming: Iterable<File>): PromptFileDescriptor[] {
      return Array.from(incoming, (file) => {
        const id = crypto.randomUUID();
        files.set(id, file);
        return {
          id,
          name: file.name,
          mediaType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        };
      });
    },
  };
}
