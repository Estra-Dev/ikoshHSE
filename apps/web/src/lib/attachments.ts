/**
 * Client-side attachment rules.
 *
 * These mirror the server's upload policy for immediate feedback only. The
 * API re-validates MIME type, file signature and size, and always computes the
 * authoritative checksum.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "text/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type AllowedAttachmentMimeType =
  (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_MIME_TYPES.join(",");

export function isAllowedAttachmentMimeType(
  mimeType: string,
): mimeType is AllowedAttachmentMimeType {
  return (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(
    mimeType,
  );
}

export function isImageAttachment(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Images, PDFs and plain text can be previewed in the browser. Office formats
 * have no safe inline renderer and are offered as downloads only.
 */
export function isPreviewableAttachment(mimeType: string): boolean {
  return (
    isImageAttachment(mimeType) ||
    mimeType === "application/pdf" ||
    mimeType === "text/plain"
  );
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns a user-facing error, or `null` when the file may be submitted.
 * An empty browser MIME type is tolerated because some platforms cannot infer
 * it; the server still validates the actual file signature.
 */
export function validateAttachmentFile(file: {
  size: number;
  type: string;
}): string | null {
  if (file.size === 0) {
    return "The selected file is empty.";
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `The selected file exceeds the ${formatAttachmentSize(
      MAX_ATTACHMENT_BYTES,
    )} limit.`;
  }

  if (file.type && !isAllowedAttachmentMimeType(file.type)) {
    return "This file type is not supported. Upload an image, PDF, text or Office document.";
  }

  return null;
}

/** Builds the scoped attachment list query for one incident. */
export function buildAttachmentSearchParams({
  incidentId,
  page = 1,
  limit = 20,
}: {
  incidentId: string;
  page?: number;
  limit?: number;
}): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("entityType", "incident");
  searchParams.set("entityId", incidentId);
  searchParams.set("page", String(page));
  searchParams.set("limit", String(limit));
  return searchParams;
}

/** Starts a browser download for an already authenticated blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
