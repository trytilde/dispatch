import { z } from "zod";

export const AttachmentSchema = z.object({
  id: z.string().min(1),
  filename: z.string().nullable().optional(),
  media_type: z.string(),
  size_bytes: z.number().nullable().optional(),
  status: z.string(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const AttachmentUploadSchema = z.object({
  attachment: AttachmentSchema,
  upload_url: z.string(),
  upload_headers: z.record(z.string(), z.string()),
});
export type AttachmentUpload = z.infer<typeof AttachmentUploadSchema>;

export const AttachmentDownloadSchema = z.object({ download_url: z.string() });

export interface CreateAttachmentInput {
  filename: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
}
