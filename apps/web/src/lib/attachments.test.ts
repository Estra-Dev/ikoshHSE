import { describe, expect, it } from "vitest";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  buildAttachmentSearchParams,
  formatAttachmentSize,
  isAllowedAttachmentMimeType,
  isImageAttachment,
  isPreviewableAttachment,
  MAX_ATTACHMENT_BYTES,
  validateAttachmentFile,
} from "./attachments";

describe("attachment MIME rules", () => {
  it("accepts exactly the server's allowed types", () => {
    for (const mimeType of ALLOWED_ATTACHMENT_MIME_TYPES) {
      expect(isAllowedAttachmentMimeType(mimeType)).toBe(true);
    }

    expect(isAllowedAttachmentMimeType("application/zip")).toBe(false);
    expect(isAllowedAttachmentMimeType("text/html")).toBe(false);
  });

  it("previews only images, PDFs and plain text", () => {
    expect(isPreviewableAttachment("image/png")).toBe(true);
    expect(isPreviewableAttachment("application/pdf")).toBe(true);
    expect(isPreviewableAttachment("text/plain")).toBe(true);
    expect(isPreviewableAttachment("application/msword")).toBe(false);
    expect(isPreviewableAttachment("application/zip")).toBe(false);
  });

  it("detects images separately from other previewable files", () => {
    expect(isImageAttachment("image/webp")).toBe(true);
    expect(isImageAttachment("application/pdf")).toBe(false);
  });
});

describe("attachment size formatting", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatAttachmentSize(512)).toBe("512 B");
    expect(formatAttachmentSize(2048)).toBe("2.0 KB");
    expect(formatAttachmentSize(MAX_ATTACHMENT_BYTES)).toBe("10.0 MB");
    expect(formatAttachmentSize(Number.NaN)).toBe("—");
  });
});

describe("validateAttachmentFile", () => {
  it("rejects empty, oversized and unsupported files", () => {
    expect(validateAttachmentFile({ size: 0, type: "image/png" })).toBe(
      "The selected file is empty.",
    );
    expect(
      validateAttachmentFile({
        size: MAX_ATTACHMENT_BYTES + 1,
        type: "image/png",
      }),
    ).toContain("10.0 MB");
    expect(
      validateAttachmentFile({ size: 100, type: "application/zip" }),
    ).toContain("not supported");
  });

  it("tolerates an empty browser MIME type for server-side validation", () => {
    expect(validateAttachmentFile({ size: 100, type: "" })).toBeNull();
  });

  it("accepts a supported file within the limit", () => {
    expect(
      validateAttachmentFile({ size: 1024, type: "application/pdf" }),
    ).toBeNull();
  });
});

describe("buildAttachmentSearchParams", () => {
  it("scopes the list to one incident with paging", () => {
    const params = buildAttachmentSearchParams({
      incidentId: "507f1f77bcf86cd799439011",
      page: 2,
      limit: 50,
    });

    expect(params.get("entityType")).toBe("incident");
    expect(params.get("entityId")).toBe("507f1f77bcf86cd799439011");
    expect(params.get("page")).toBe("2");
    expect(params.get("limit")).toBe("50");
  });

  it("forwards page 1 and page 3 with the attachment page size", () => {
    const firstPage = buildAttachmentSearchParams({
      incidentId: "507f1f77bcf86cd799439011",
      page: 1,
      limit: 100,
    });
    const thirdPage = buildAttachmentSearchParams({
      incidentId: "507f1f77bcf86cd799439011",
      page: 3,
      limit: 100,
    });

    expect(firstPage.get("page")).toBe("1");
    expect(thirdPage.get("page")).toBe("3");
    expect(thirdPage.get("limit")).toBe("100");
  });
});
