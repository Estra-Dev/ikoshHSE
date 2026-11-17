"use client";

import Link from "next/link";
import {
  Button,
  buttonStyles,
  EmptyState,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { RefreshIcon } from "@/components/icons";
import { useMyTrainingSessions } from "@/lib/api/training";
import { useMe } from "@/lib/api/employees";
import { canViewTraining } from "@/lib/permissions";
import { TrainingHistoryTable } from "./training-history-table";

/**
 * Employee self-service training history. The API only returns the caller's
 * own participation row, so colleagues' attendance, certificates and notes are
 * never rendered here.
 */
export function MyTrainingHistory() {
  const training = useMyTrainingSessions();
  const me = useMe();
  const records = training.data?.sessions ?? [];
  const canViewRegister = canViewTraining(me.data?.employee.ikoshRole);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assurance"
        title="My training"
        description="Your own attendance and certificate records. Only your participation row is returned; other attendees are never shown."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className={buttonStyles("secondary")}>
              Back to dashboard
            </Link>
            {canViewRegister && (
              <Link href="/training" className={buttonStyles("secondary")}>
                Training register
              </Link>
            )}
          </div>
        }
      />

      <div className="rounded-card border border-line bg-surface p-4 text-sm leading-6 text-muted shadow-card">
        Completion records attendance only. It does not assert competence or
        authorisation.
      </div>

      {training.isError && !training.data ? (
        <ErrorState
          title="Unable to load your training history"
          message={
            training.error instanceof Error
              ? training.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void training.refetch()}
              isLoading={training.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : training.isLoading ? (
        <Spinner label="Loading your training history..." />
      ) : records.length === 0 ? (
        <EmptyState
          title="No training records yet"
          description="Training sessions you attend will appear here with your own attendance and certificate details."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Most recent sessions first.
            </p>
            <Badge tone="neutral">
              {training.isFetching
                ? "Updating…"
                : `${records.length} record${records.length === 1 ? "" : "s"}`}
            </Badge>
          </div>

          <TrainingHistoryTable records={records} showLink={false} />
        </div>
      )}
    </div>
  );
}
