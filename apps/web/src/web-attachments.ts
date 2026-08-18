import type { Attachment, ChatPart, OpenBotClient } from "@tryopenbot/client-runtime";

export interface PendingFile {
  id: string;
  file: File;
  progress: number;
  status: "ready" | "uploading" | "uploaded" | "error";
  attachmentId?: string;
  error?: string;
  /** Blob URL for image previews in the composer tray. */
  previewUrl?: string;
}

export async function uploadAttachment(
  client: OpenBotClient,
  sessionId: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<Attachment> {
  const sha256 = await fileSha256(file);
  const created = await client.createAttachment(sessionId, {
    filename: file.name,
    mediaType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    sha256,
  });
  await uploadFile(
    client.rewriteTildeUploadUrl(created.upload_url),
    created.upload_headers,
    file,
    onProgress,
  );
  return await client.completeAttachment(sessionId, created.attachment.id, {
    sizeBytes: file.size,
    sha256,
  });
}

export function optimisticParts(text: string, files: PendingFile[]): ChatPart[] {
  return [
    ...(text ? [{ type: "text", text }] : []),
    ...files.map(({ file }) => ({
      type: "file",
      filename: file.name,
      media_type: file.type || "application/octet-stream",
      url: URL.createObjectURL(file),
    })),
  ];
}

async function fileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uploadFile(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    if (!Object.keys(headers).some((name) => name.toLowerCase() === "content-type"))
      request.setRequestHeader("content-type", file.type || "application/octet-stream");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Attachment upload failed (${request.status})`));
    });
    request.addEventListener("error", () => reject(new Error("Attachment upload failed")));
    request.addEventListener("abort", () =>
      reject(new DOMException("Upload aborted", "AbortError")),
    );
    request.send(file);
  });
}
