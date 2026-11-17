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
import { useMyToolboxTalks } from "@/lib/api/toolbox-talks";
import { useMe } from "@/lib/api/employees";
import { canViewToolboxTalks } from "@/lib/permissions";
import { ToolboxTalkHistoryTable } from "./toolbox-talk-history-table";

/**
 * Employee self-service toolbox talk history. The API only returns the
 * caller's own participation row, so colleagues' attendance and
 * acknowledgements are never rendered here.
 */
export function MyToolboxTalkHistory() {
  const talks = useMyToolboxTalks();
  const me = useMe();
  const records = talks.data?.talks ?? [];
  const canViewRegister = canViewToolboxTalks(me.data?.employee.ikoshRole);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assurance"
        title="My toolbox talks"
        description="Your own attendance and acknowledgement records. Only your participation row is returned; other attendees are never shown."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className={buttonStyles("secondary")}>
              Back to dashboard
            </Link>
            {canViewRegister && (
              <Link href="/toolbox-talks" className={buttonStyles("secondary")}>
                Toolbox talk register
              </Link>
            )}
          </div>
        }
      />

      <div className="rounded-card border border-line bg-surface p-4 text-sm leading-6 text-muted shadow-card">
        Acknowledgement confirms the briefing was received. It is not a
        competency or authorisation claim.
      </div>

      {talks.isError && !talks.data ? (
        <ErrorState
          title="Unable to load your toolbox talk history"
          message={
            talks.error instanceof Error
              ? talks.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void talks.refetch()}
              isLoading={talks.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : talks.isLoading ? (
        <Spinner label="Loading your toolbox talk history..." />
      ) : records.length === 0 ? (
        <EmptyState
          title="No toolbox talk records yet"
          description="Toolbox talks you attend will appear here with your own attendance and acknowledgement details."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">Most recent talks first.</p>
            <Badge tone="neutral">
              {talks.isFetching
                ? "Updating…"
                : `${records.length} record${records.length === 1 ? "" : "s"}`}
            </Badge>
          </div>

          <ToolboxTalkHistoryTable records={records} showLink={false} />
        </div>
      )}
    </div>
  );
}
