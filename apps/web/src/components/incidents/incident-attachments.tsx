"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, Spinner } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/fields";
import { Pagination } from "@/components/ui/pagination";
import { AttachmentIcon, DownloadIcon, EyeIcon } from "@/components/icons";
import { useApi } from "@/lib/api/client";
import {
  useAttachmentBlob,
  useAttachmentText,
  useIncidentAttachments,
  useUploadIncidentAttachment,
} from "@/lib/api/attachments";
import type { AttachmentSummary } from "@/lib/api/types";
import {
  ATTACHMENT_ACCEPT,
  downloadBlob,
  formatAttachmentSize,
  isImageAttachment,
  isPreviewableAttachment,
  MAX_ATTACHMENT_BYTES,
  validateAttachmentFile,
} from "@/lib/attachments";
import { formatUtcDateTime } from "@/lib/dashboard-format";

/**
 * Evidence panel for one incident. Uploads are one file per request and only
 * images, PDFs and plain text are previewed inline. Every download uses the
 * authenticated API endpoint and never a public URL.
 */
export function IncidentAttachments({ incidentId }: { incidentId: string }) {
  const [page, setPage] = useState(1);
  const attachments = useIncidentAttachments(incidentId, page);
  const upload = useUploadIncidentAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const items = attachments.data?.attachments ?? [];
  const pagination = attachments.data?.pagination;
  const total = pagination?.total ?? items.length;

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    const validationError = validateAttachmentFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await upload.mutateAsync({ incidentId, file, description });
      setPage(1);
      setFile(null);
      setDescription("");
      setMessage("Evidence uploaded.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The file could not be uploaded.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Evidence attachments"
        description="Photographs and documents linked to this report. Access is scoped by the API."
        action={
          <Badge tone="neutral">
            {total} file{total === 1 ? "" : "s"}
          </Badge>
        }
      />
      <CardBody className="space-y-5">
        {attachments.isLoading ? (
          <Spinner label="Loading attachments..." />
        ) : attachments.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
          >
            <p className="text-sm font-medium text-red-700">
              Unable to load attachments.
            </p>
            <p className="mt-1 text-sm text-red-700/90">
              {attachments.error instanceof Error
                ? attachments.error.message
                : "Please try again."}
            </p>
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-navy-200 px-4 py-6 text-center text-sm text-muted">
            No evidence has been attached to this report yet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((attachment) => (
              <AttachmentRow key={attachment.id} attachment={attachment} />
            ))}
          </ul>
        )}

        {pagination && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={setPage}
          />
        )}

        <form
          onSubmit={(event) => void handleUpload(event)}
          className="rounded-lg border border-line bg-navy-50/30 p-4"
        >
          <div className="flex items-center gap-2">
            <AttachmentIcon size={16} className="text-navy-700" />
            <p className="text-sm font-semibold text-ink">Upload evidence</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            One file per upload. Images, PDFs, text and Office documents up to{" "}
            {formatAttachmentSize(MAX_ATTACHMENT_BYTES)} are accepted.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                File
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError("");
                  setMessage("");
                }}
                className="block w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm transition file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:border-navy-200 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-600/15"
              />
            </label>

            <TextField
              label="Description (optional)"
              id={`attachment-description-${incidentId}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              placeholder="What does this evidence show?"
            />
          </div>

          <div className="mt-3">
            <Button type="submit" size="sm" isLoading={upload.isPending}>
              Upload file
            </Button>
          </div>

          {message && (
            <p role="status" className="mt-3 text-sm text-emerald-700">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

function AttachmentRow({ attachment }: { attachment: AttachmentSummary }) {
  const api = useApi();
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function handleDownload(): Promise<void> {
    setError("");
    setDownloading(true);

    try {
      const blob = await api.getBlob(
        `/api/attachments/${attachment.id}/download`,
      );
      downloadBlob(blob, attachment.originalFilename);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "The file could not be downloaded.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-ink">
            {attachment.originalFilename}
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatAttachmentSize(attachment.size)}
            <span aria-hidden="true"> · </span>
            {formatUtcDateTime(attachment.createdAt)}
          </p>
          {attachment.description && (
            <p className="mt-1 text-sm leading-6 text-muted">
              {attachment.description}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {isPreviewableAttachment(attachment.mimeType) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPreviewing((current) => !current)}
            >
              <EyeIcon size={14} />
              {previewing ? "Hide preview" : "Preview"}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            isLoading={downloading}
            onClick={() => void handleDownload()}
          >
            <DownloadIcon size={14} />
            Download
          </Button>
        </div>
      </div>

      {previewing && (
        <div className="mt-3">
          <AttachmentPreview attachment={attachment} />
        </div>
      )}
    </li>
  );
}

/**
 * Renders authenticated bytes from an object URL. A direct `<img src>` or
 * `<iframe src>` pointing at the API would omit the Bearer token and fail.
 * Text previews use a dedicated decoded query so no blob state is needed.
 */
function AttachmentPreview({ attachment }: { attachment: AttachmentSummary }) {
  if (attachment.mimeType === "text/plain") {
    return <TextAttachmentPreview attachment={attachment} />;
  }

  return <BinaryAttachmentPreview attachment={attachment} />;
}

function PreviewError({ error }: { error: unknown }) {
  return (
    <p role="alert" className="text-sm text-red-700">
      {error instanceof Error
        ? error.message
        : "The preview could not be loaded."}
    </p>
  );
}

function TextAttachmentPreview({
  attachment,
}: {
  attachment: AttachmentSummary;
}) {
  const textQuery = useAttachmentText(attachment.id, true);

  if (textQuery.isLoading) {
    return <p className="text-sm text-muted">Loading preview…</p>;
  }

  if (textQuery.isError) {
    return <PreviewError error={textQuery.error} />;
  }

  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-navy-50/40 p-4 text-xs leading-6 text-ink">
      {textQuery.data ?? ""}
    </pre>
  );
}

function BinaryAttachmentPreview({
  attachment,
}: {
  attachment: AttachmentSummary;
}) {
  const blobQuery = useAttachmentBlob(attachment.id, true);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  /**
   * Create and revoke the URL in the same effect so React Strict Mode's
   * setup → cleanup → setup cycle always ends with a fresh valid URL.
   */
  useEffect(() => {
    if (!blobQuery.data) {
      return;
    }

    const url = URL.createObjectURL(blobQuery.data);

    // This publishes an external browser resource URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setObjectUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [blobQuery.data]);

  if (blobQuery.isLoading) {
    return <p className="text-sm text-muted">Loading preview…</p>;
  }

  if (blobQuery.isError) {
    return <PreviewError error={blobQuery.error} />;
  }

  if (!objectUrl) {
    return <p className="text-sm text-muted">Preparing preview…</p>;
  }

  if (isImageAttachment(attachment.mimeType)) {
    return (
      // Authenticated blob URLs cannot use the Next.js image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={objectUrl}
        alt={`Preview of ${attachment.originalFilename}`}
        className="max-h-[28rem] w-auto rounded-lg border border-line bg-surface"
      />
    );
  }

  if (attachment.mimeType === "application/pdf") {
    return (
      <iframe
        src={objectUrl}
        title={`Preview of ${attachment.originalFilename}`}
        className="h-[28rem] w-full rounded-lg border border-line bg-white"
      />
    );
  }

  return null;
}
