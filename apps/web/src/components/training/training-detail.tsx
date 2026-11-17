"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { useMe } from "@/lib/api/employees";
import { useTrainingSession } from "@/lib/api/training";
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
  canEditTrainingSession,
  canUploadTrainingEvidence,
} from "@/lib/permissions";
import { AttendanceRecordStatusBadge } from "@/components/attendance-records/attendance-badges";
import { TrainingCourseCategoryBadge } from "./training-badges";
import { TrainingEditPanel } from "./training-edit-panel";
import { TrainingParticipantsPanel } from "./training-participants-panel";
import { TrainingStatusPanel } from "./training-status-panel";

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
 * Training session detail. Site-scoped access is enforced by the API; workflow,
 * participant and evidence controls mirror the server rules.
 */
export function TrainingDetail({ sessionId }: { sessionId: string }) {
  const sessionQuery = useTrainingSession(sessionId);
  const me = useMe();
  const [editing, setEditing] = useState(false);

  const session = sessionQuery.data?.session;
  const role = me.data?.employee.ikoshRole;
  const viewerId = me.data?.employee.id;

  const backLink = (
    <Link
      href="/training"
      className="inline-flex items-center gap-2 text-sm font-medium text-navy-700 transition hover:text-navy-900"
    >
      <ArrowLeftIcon size={16} />
      Back to training register
    </Link>
  );

  if (sessionQuery.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Spinner label="Loading training session..." />
      </div>
    );
  }

  if (sessionQuery.isError || !session) {
    const notFound =
      sessionQuery.error instanceof ApiError &&
      sessionQuery.error.status === 404;

    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState
          title={
            notFound
              ? "Training session not found"
              : "Unable to load training session"
          }
          message={
            notFound
              ? "This session does not exist or is outside your site scope."
              : sessionQuery.error instanceof Error
                ? sessionQuery.error.message
                : "Please try again."
          }
          action={
            notFound ? (
              <Link href="/training" className={buttonStyles("secondary")}>
                Back to register
              </Link>
            ) : (
              <Button
                onClick={() => void sessionQuery.refetch()}
                isLoading={sessionQuery.isFetching}
              >
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const canEdit = canEditTrainingSession(role, viewerId, session);
  const canUpload = canUploadTrainingEvidence(role, viewerId, session);

  return (
    <div className="space-y-6">
      {backLink}

      <header className="space-y-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <AttendanceRecordStatusBadge status={session.status} />
          {session.course.category && (
            <TrainingCourseCategoryBadge category={session.course.category} />
          )}
          <Badge tone="neutral">{session.durationMinutes} minutes</Badge>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              {session.course.title ?? session.topic}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              {session.topic}
              <span aria-hidden="true"> · </span>
              {formatUtcDateTime(session.scheduledDate)}
              <span aria-hidden="true"> · </span>
              {session.site.name ?? session.project.name}
              <span aria-hidden="true"> · </span>
              {session.trainerName}
            </p>
          </div>

          {canEdit && (
            <Button
              variant="secondary"
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? "Cancel editing" : "Edit session"}
            </Button>
          )}
        </div>
      </header>

      {editing && canEdit && (
        <TrainingEditPanel
          session={session}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {session.description && (
            <Card>
              <CardHeader
                title="Description"
                description="What this session covers."
              />
              <CardBody>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {session.description}
                </p>
              </CardBody>
            </Card>
          )}

          {session.status === "COMPLETED" && (
            <Card>
              <CardHeader title="Completion record" />
              <CardBody>
                <p className="text-sm leading-7 text-ink">
                  {session.completedCount} participant
                  {session.completedCount === 1 ? "" : "s"} recorded as
                  completed, with {session.attendedCount} attending.
                </p>
                {session.completedAt && (
                  <p className="mt-2 text-xs text-muted">
                    {session.completedBy
                      ? personName(session.completedBy)
                      : "Unknown employee"}{" "}
                    · {formatUtcDateTime(session.completedAt)}
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {session.status === "CANCELLED" && (
            <Card>
              <CardHeader title="Cancellation record" />
              <CardBody>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {session.cancellationReason ?? "No reason was recorded."}
                </p>
                {session.cancelledAt && (
                  <p className="mt-2 text-xs text-muted">
                    {session.cancelledBy
                      ? personName(session.cancelledBy)
                      : "Unknown employee"}{" "}
                    · {formatUtcDateTime(session.cancelledAt)}
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          <TrainingParticipantsPanel session={session} canEdit={canEdit} />

          <AttachmentsPanel
            key={session.id}
            entityType="training_session"
            entityId={session.id}
            title="Training evidence"
            description="Attendance sheets, certificates and other supporting documents. Access is scoped by the API."
            emptyMessage="No evidence has been attached to this training session yet."
            canUpload={canUpload}
            uploadBlockedMessage={
              session.status === "COMPLETED" || session.status === "CANCELLED"
                ? "This session is terminal and accepts no new evidence."
                : "Only HSE management or the session author can upload evidence."
            }
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Session information" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <DetailField
                  label="Course"
                  value={
                    session.course.title
                      ? `${session.course.title}${
                          session.course.code
                            ? ` · ${session.course.code}`
                            : ""
                        }`
                      : "—"
                  }
                />
                <DetailField label="Trainer" value={session.trainerName} />
                <DetailField
                  label="Scheduled for"
                  value={formatUtcDateTime(session.scheduledDate)}
                />
                <DetailField label="Duration" value={`${session.durationMinutes} minutes`} />
                <DetailField
                  label="Project"
                  value={session.project.name ?? "—"}
                />
                <DetailField
                  label="Site"
                  value={session.site.name ?? "—"}
                />
                <DetailField
                  label="Participants"
                  value={`${session.participantCount} total`}
                />
                <DetailField
                  label="Employees / contractors"
                  value={`${session.employeeParticipantCount} / ${session.contractorParticipantCount}`}
                />
                <DetailField
                  label="Attended / completed"
                  value={`${session.attendedCount} / ${session.completedCount}`}
                />
                <DetailField
                  label="Created by"
                  value={
                    session.createdBy
                      ? personName(session.createdBy)
                      : "Unknown employee"
                  }
                />
                <DetailField
                  label="Created"
                  value={formatUtcDateTime(session.createdAt)}
                />
                <DetailField
                  label="Last updated"
                  value={formatUtcDateTime(session.updatedAt)}
                />
              </dl>
            </CardBody>
          </Card>

          <TrainingStatusPanel
            session={session}
            role={role}
            viewerId={viewerId}
          />
        </div>
      </div>
    </div>
  );
}
