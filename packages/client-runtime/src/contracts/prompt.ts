/** Prompt chrome is silent unless the owner needs to know about a problem or act. */
export type PromptStatus = {
  kind: "unreachable" | "failed" | "action-needed";
  message?: string;
};

export function promptStatus(input: {
  error?: string;
  unreachable?: boolean;
  actionNeeded?: boolean;
}): PromptStatus | undefined {
  if (input.unreachable)
    return { kind: "unreachable", ...(input.error ? { message: input.error } : {}) };
  if (input.error) return { kind: "failed", message: input.error };
  if (input.actionNeeded) return { kind: "action-needed" };
  return undefined;
}

export interface PromptFileDescriptor {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
}
export interface PromptAttachment extends PromptFileDescriptor {
  status: "ready" | "uploading" | "uploaded" | "error";
  progress: number;
  previewUrl?: string;
  attachmentId?: string;
  error?: string;
}
export interface PromptState {
  contextId: string;
  draft: string;
  attachments: PromptAttachment[];
  phase: "idle" | "uploading" | "sending";
  error: string;
}
/** Platform-only bytes and object URLs. No File, DOM, Electron or Node types enter the runtime. */
export interface PromptAttachmentPlatform {
  createPreviewUrl(fileId: string): string | undefined;
  revokePreviewUrl(url: string): void;
  releaseFile(fileId: string): void;
  sha256(fileId: string, signal: AbortSignal): Promise<string>;
  upload(
    fileId: string,
    request: {
      url: string;
      headers: Record<string, string>;
      signal: AbortSignal;
      onProgress: (progress: number) => void;
    },
  ): Promise<void>;
}
