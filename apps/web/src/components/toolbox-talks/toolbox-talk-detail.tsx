"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { useMe } from "@/lib/api/employees";
import { useToolboxTalk } from "@/lib/api/toolbox-talks";
import {
  Button,
  buttonStyles,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftIcon } from "@/components/icons";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import {
  canEditToolboxTalk,
  canUploadToolboxTalkEvidence,
} from "@/lib/permissions";
import { AttendanceRecordStatusBadge } from "@/components/attendance-records/attendance-badges";
import { ToolboxTalkEditPanel } from "./toolbox-talk-edit-panel";
import { ToolboxTalkParticipantsPanel } from "./toolbox-talk-participants-panel";
import { ToolboxTalkStatusPanel } from "./toolbox-talk-status-panel";

function personName(person: { firstName: string; lastName: string }): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || "Unknown employee";
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}

/**
 * Toolbox talk detail. Site-scoped access is enforced by the API; workflow,
 * acknowledgement and evidence controls mirror the server rules.
 */
export function ToolboxTalkDetail({ talkId }: { talkId: string }) {
  const talkQuery = useToolboxTalk(talkId);
  const me = useMe();
  const [editing, setEditing] = useState(false);

  const talk = talkQuery.data?.talk;
  const role = me.data?.employee.ikoshRole;
  const viewerId = me.data?.employee.id;

  const backLink = (
    <Link
      href="/toolbox-talks"
      className="inline-flex items-center gap-2 text-sm font-medium text-navy-700 transition hover:text-navy-900"
    >
      <ArrowLeftIcon size={16} />
      Back to toolbox talks
    </Link>
  );

  if (talkQuery.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Spinner label="Loading toolbox talk..." />
      </div>
    );
  }

  if (talkQuery.isError || !talk) {
    const notFound =
      talkQuery.error instanceof ApiError && talkQuery.error.status === 404;

    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState
          title={
            notFound ? "Toolbox talk not found" : "Unable to load toolbox talk"
          }
          message={
            notFound
              ? "This talk does not exist or is outside your site scope."
              : talkQuery.error instanceof Error
                ? talkQuery.error.message
                : "Please try again."
          }
          action={
            notFound ? (
              <Link href="/toolbox-talks" className={buttonStyles("secondary")}>
                Back to register
              </Link>
            ) : (
              <Button
                onClick={() => void talkQuery.refetch()}
                isLoading={talkQuery.isFetching}
              >
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const canEdit = canEditToolboxTalk(role, viewerId, talk);
  const canUpload = canUploadToolboxTalkEvidence(role, viewerId, talk);

  return (
    <div className="space-y-6">
      {backLink}

      <header className="space-y-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <AttendanceRecordStatusBadge status={talk.status} />
          <Badge tone="neutral">{talk.durationMinutes} minutes</Badge>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              {talk.topic}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              {formatUtcDateTime(talk.scheduledDate)}
              <span aria-hidden="true"> · </span>
              {talk.site.name ?? talk.project.name}
              <span aria-hidden="true"> · </span>
              {talk.facilitatorName}
            </p>
          </div>

          {canEdit && (
            <Button
              variant="secondary"
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? "Cancel editing" : "Edit talk"}
            </Button>
          )}
        </div>
      </header>

      {editing && canEdit && (
        <ToolboxTalkEditPanel
          talk={talk}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {talk.discussionPoints && (
            <Card>
              <CardHeader
                title="Discussion points"
                description="Hazards, controls and questions covered in the briefing."
              />
              <CardBody>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {talk.discussionPoints}
                </p>
              </CardBody>
            </Card>
          )}

          {talk.status === "COMPLETED" && (
            <Card>
              <CardHeader title="Completion record" />
              <CardBody>
                <p className="text-sm leading-7 text-ink">
                  {talk.acknowledgedCount} attendee
                  {talk.acknowledgedCount === 1 ? "" : "s"} acknowledged the
                  briefing, with {talk.attendedCount} attending.
                </p>
                {talk.completedAt && (
                  <p className="mt-2 text-xs text-muted">
                    {talk.completedBy
                      ? personName(talk.completedBy)
                      : "Unknown employee"}{" "}
                    · {formatUtcDateTime(talk.completedAt)}
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {talk.status === "CANCELLED" && (
            <Card>
              <CardHeader title="Cancellation record" />
              <CardBody>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {talk.cancellationReason ?? "No reason was recorded."}
                </p>
                {talk.cancelledAt && (
                  <p className="mt-2 text-xs text-muted">
                    {talk.cancelledBy
                      ? personName(talk.cancelledBy)
                      : "Unknown employee"}{" "}
                    · {formatUtcDateTime(talk.cancelledAt)}
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          <ToolboxTalkParticipantsPanel talk={talk} canEdit={canEdit} />

          <AttachmentsPanel
            key={talk.id}
            entityType="toolbox_talk"
            entityId={talk.id}
            title="Talk evidence"
            description="Signed attendance sheets, photographs and other supporting documents. Access is scoped by the API."
            emptyMessage="No evidence has been attached to this toolbox talk yet."
            canUpload={canUpload}
            uploadBlockedMessage={
              talk.status === "COMPLETED" || talk.status === "CANCELLED"
                ? "This talk is terminal and accepts no new evidence."
                : "Only HSE management or the talk author can upload evidence."
            }
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Talk information" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <DetailField label="Facilitator" value={talk.facilitatorName} />
                <DetailField
                  label="Scheduled for"
                  value={formatUtcDateTime(talk.scheduledDate)}
                />
                <DetailField
                  label="Duration"
                  value={`${talk.durationMinutes} minutes`}
                />
                <DetailField label="Project" value={talk.project.name ?? "—"} />
                <DetailField label="Site" value={talk.site.name ?? "—"} />
                <DetailField
                  label="Attendees"
                  value={`${talk.participantCount} total`}
                />
                <DetailField
                  label="Employees / contractors"
                  value={`${talk.employeeParticipantCount} / ${talk.contractorParticipantCount}`}
                />
                <DetailField
                  label="Attended / acknowledged"
                  value={`${talk.attendedCount} / ${talk.acknowledgedCount}`}
                />
                <DetailField
                  label="Created by"
                  value={
                    talk.createdBy
                      ? personName(talk.createdBy)
                      : "Unknown employee"
                  }
                />
                <DetailField
                  label="Created"
                  value={formatUtcDateTime(talk.createdAt)}
                />
                <DetailField
                  label="Last updated"
                  value={formatUtcDateTime(talk.updatedAt)}
                />
              </dl>
            </CardBody>
          </Card>

          <ToolboxTalkStatusPanel talk={talk} role={role} viewerId={viewerId} />
        </div>
      </div>
    </div>
  );
}
