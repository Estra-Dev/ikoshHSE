import { HttpError } from "../http-error.js";

/**
 * Content families detectable from file signatures. The client-declared MIME
 * type is only accepted when it belongs to the family actually present in the
 * uploaded bytes.
 */
export type AttachmentFileFamily =
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "pdf"
  | "text"
  | "rtf"
  | "zip"
  | "ole";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const OLE_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

const MIME_FAMILIES: Record<string, AttachmentFileFamily> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "text",
  "text/rtf": "rtf",
  "application/msword": "ole",
  "application/vnd.ms-excel": "ole",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "zip",
};

function ascii(buffer: Buffer, start: number, end: number): string {
  return buffer.subarray(start, end).toString("latin1");
}

function looksLikeText(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  const text = buffer.toString("utf8");

  // Invalid UTF-8 is replaced during decoding, changing the byte length.
  if (Buffer.from(text, "utf8").length !== buffer.length) {
    return false;
  }

  // Disallow binary control characters while allowing TAB, LF and CR.
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
}

/** Detects a file family from magic bytes, never from the client MIME type. */
export function detectFileFamily(
  buffer: Buffer,
): AttachmentFileFamily | null {
  if (buffer.length === 0) {
    return null;
  }

  if (
    buffer.length >= PNG_SIGNATURE.length &&
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return "png";
  }

  if (buffer.length >= 3) {
    const bytes = buffer.subarray(0, 3);

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "jpeg";
    }
  }

  const header = ascii(buffer, 0, 6);

  if (header === "GIF87a" || header === "GIF89a") {
    return "gif";
  }

  if (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 12) === "WEBP") {
    return "webp";
  }

  if (ascii(buffer, 0, 5) === "%PDF-") {
    return "pdf";
  }

  if (ascii(buffer, 0, 5) === "{\\rtf") {
    return "rtf";
  }

  if (
    buffer.length >= OLE_SIGNATURE.length &&
    buffer.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE)
  ) {
    return "ole";
  }

  if (ascii(buffer, 0, 2) === "PK") {
    return "zip";
  }

  if (looksLikeText(buffer)) {
    return "text";
  }

  return null;
}

/**
 * Validates the uploaded bytes against the declared MIME type. Throws a 400
 * when the content is disallowed, empty, or inconsistent with the declaration
 * (for example a text file renamed to `.png`).
 */
export function assertAttachmentContent(
  buffer: Buffer,
  declaredMimeType: string,
): AttachmentFileFamily {
  const expectedFamily = MIME_FAMILIES[declaredMimeType];

  if (!expectedFamily) {
    throw new HttpError(400, "This file type is not allowed.");
  }

  const detectedFamily = detectFileFamily(buffer);

  if (!detectedFamily) {
    throw new HttpError(400, "The uploaded file content is not recognised.");
  }

  if (detectedFamily !== expectedFamily) {
    throw new HttpError(
      400,
      "The uploaded file content does not match its declared MIME type.",
    );
  }

  return detectedFamily;
}
