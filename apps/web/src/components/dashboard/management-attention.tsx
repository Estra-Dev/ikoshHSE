"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, Spinner } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RefreshIcon } from "@/components/icons";
import { useAudits } from "@/lib/api/audits";
import { useCorrectiveActions } from "@/lib/api/corrective-actions";
import { useInspections } from "@/lib/api/inspections";
import { usePermits } from "@/lib/api/permits";
import { useTrainingSessions } from "@/lib/api/training";
import {
  CERTIFICATE_STATE_LABELS,
  CERTIFICATE_STATE_TONES,
} from "@/lib/attendance-records";
import { auditDetailHref, EMPTY_AUDIT_FILTERS } from "@/lib/audits";
import {
  correctiveActionDetailHref,
  EMPTY_CORRECTIVE_ACTION_FILTERS,
} from "@/lib/corrective-actions";
import { formatUtcDate } from "@/lib/dashboard-format";
import { EMPTY_INSPECTION_FILTERS, inspectionDetailHref } from "@/lib/inspections";
import {
  appendSiteFilter,
  formatHseLabel,
  type DashboardScopeFilters,
} from "@/lib/hse-dashboard";
import {
  EMPTY_PERMIT_FILTERS,
  permitDetailHref,
} from "@/lib/permits";
import {
  EMPTY_TRAINING_FILTERS,
  MAX_TRAINING_PAGE_SIZE,
  trainingDetailHref,
} from "@/lib/training";
import type {
  AuditStatus,
  CertificateState,
  CorrectiveActionStatus,
  InspectionSeverity,
  PermitStatus,
} from "@/lib/api/types";

const CAPA_TONES: Record<CorrectiveActionStatus, BadgeTone> = {
  OPEN: "amber",
  IN_PROGRESS: "blue",
  COMPLETED: "green",
  VERIFIED: "navy",
};

const AUDIT_TONES: Record<AuditStatus, BadgeTone> = {
  PLANNED: "neutral",
  IN_PROGRESS: "blue",
  COMPLETED: "green",
  CANCELLED: "neutral",
};

const SEVERITY_TONES: Record<InspectionSeverity, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "amber",
  HIGH: "red",
  CRITICAL: "red",
};

const PERMIT_TONES: Record<PermitStatus, BadgeTone> = {
  DRAFT: "neutral",
  SUBMITTED: "amber",
  APPROVED: "blue",
  ACTIVE: "green",
  SUSPENDED: "red",
  CLOSED: "navy",
  REJECTED: "red",
  CANCELLED: "neutral",
};

interface AttentionQuery {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

interface AttentionRowData {
  id: string;
  title: string;
  meta: string;
  date?: string;
  badge?: { label: string; tone: BadgeTone };
  href: string;
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Please try again.";
}

function fullName(
  user: { firstName: string; lastName: string } | null,
): string {
  return user ? `${user.firstName} ${user.lastName}`.trim() : "Unassigned";
}

function Row({ row }: { row: AttentionRowData }) {
  return (
    <li>
      <Link
        href={row.href}
        className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition hover:bg-navy-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{row.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{row.meta}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {row.badge && (
              <Badge tone={row.badge.tone} dot>
                {row.badge.label}
              </Badge>
            )}
            {row.date && (
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                {row.date}
              </span>
            )}
          </div>
        </div>
        <span aria-hidden="true" className="mt-1 text-navy-300">
          ›
        </span>
      </Link>
    </li>
  );
}

function AttentionCard({
  title,
  description,
  query,
  count,
  viewAllHref,
  emptyMessage,
  children,
}: {
  title: string;
  description: string;
  query: AttentionQuery;
  count?: number;
  viewAllHref?: string;
  emptyMessage: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          <>
            {count !== undefined && (
              <span className="tabular rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-700">
                {count}
              </span>
            )}
            {viewAllHref && (
              <Link
                href={viewAllHref}
                className="text-xs font-semibold text-navy-700 hover:text-navy-900 hover:underline"
              >
                View all
              </Link>
            )}
          </>
        }
      />
      <CardBody className="py-2">
        {query.isLoading ? (
          <Spinner label="Loading..." />
        ) : query.isError ? (
          <div role="alert" className="py-4">
            <p className="text-sm font-medium text-red-700">
              This list could not be loaded.
            </p>
            <p className="mt-1 text-sm text-muted">{errorText(query.error)}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void query.refetch()}
            >
              <RefreshIcon size={14} />
              Try again
            </Button>
          </div>
        ) : (
          children ?? (
            <p className="px-2 py-6 text-center text-sm text-muted">
              {emptyMessage}
            </p>
          )
        )}
      </CardBody>
    </Card>
  );
}

function RowList({ rows }: { rows: readonly AttentionRowData[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <Row key={row.id} row={row} />
      ))}
    </ul>
  );
}

/** Role-gated, bounded queues drawn from the existing HSE registers. */
export function ManagementAttention({
  filters,
}: {
  filters: DashboardScopeFilters;
}) {
  const siteId = filters.siteId;

  const capas = useCorrectiveActions({
    ...EMPTY_CORRECTIVE_ACTION_FILTERS,
    siteId,
    overdue: true,
    limit: 5,
  });

  const suspendedPermits = usePermits({
    ...EMPTY_PERMIT_FILTERS,
    siteId,
    status: "SUSPENDED",
    limit: 5,
  });
  const submittedPermits = usePermits({
    ...EMPTY_PERMIT_FILTERS,
    siteId,
    status: "SUBMITTED",
    limit: 5,
  });
  const expiringPermits = usePermits({
    ...EMPTY_PERMIT_FILTERS,
    siteId,
    status: "ACTIVE",
    attention: "ACTIVE_EXPIRING_SOON",
    limit: 5,
  });

  const inspections = useInspections({
    ...EMPTY_INSPECTION_FILTERS,
    siteId,
    limit: 20,
  });

  const training = useTrainingSessions({
    ...EMPTY_TRAINING_FILTERS,
    siteId,
    limit: MAX_TRAINING_PAGE_SIZE,
  });

  const audits = useAudits({
    ...EMPTY_AUDIT_FILTERS,
    siteId,
    limit: 5,
  });

  const capaRows: AttentionRowData[] = (
    capas.data?.correctiveActions ?? []
  ).map((action) => ({
    id: action.id,
    title: action.description,
    meta: `${action.site?.name ?? "No site"} · ${fullName(action.assignedTo)}`,
    badge: {
      label: formatHseLabel(action.status),
      tone: CAPA_TONES[action.status],
    },
    date: `Due ${formatUtcDate(action.dueDate)}`,
    href: correctiveActionDetailHref(action.id),
  }));

  const permitRows: AttentionRowData[] = [
    ...(suspendedPermits.data?.permits ?? []).map((permit) => ({
      id: permit.id,
      kind: "Suspended" as const,
      time: permit.validTo,
      row: {
        id: permit.id,
        title: permit.workDescription,
        meta: `${permit.site?.name ?? "No site"} · ${permit.workType.replaceAll("_", " ").toLowerCase()}`,
        badge: {
          label: formatHseLabel(permit.status),
          tone: PERMIT_TONES[permit.status],
        },
        date: `Valid to ${formatUtcDate(permit.validTo)}`,
        href: permitDetailHref(permit.id),
      },
    })),
    ...(submittedPermits.data?.permits ?? []).map((permit) => ({
      id: permit.id,
      kind: "Submitted" as const,
      time: permit.validFrom,
      row: {
        id: permit.id,
        title: permit.workDescription,
        meta: `${permit.site?.name ?? "No site"} · ${permit.workType.replaceAll("_", " ").toLowerCase()}`,
        badge: {
          label: "Awaiting approval",
          tone: PERMIT_TONES[permit.status],
        },
        date: `From ${formatUtcDate(permit.validFrom)}`,
        href: permitDetailHref(permit.id),
      },
    })),
    ...(expiringPermits.data?.permits ?? []).map((permit) => ({
      id: permit.id,
      kind: "Expiring" as const,
      time: permit.validTo,
      row: {
        id: permit.id,
        title: permit.workDescription,
        meta: `${permit.site?.name ?? "No site"} · ${permit.workType.replaceAll("_", " ").toLowerCase()}`,
        badge: { label: "Expiring soon", tone: "amber" as BadgeTone },
        date: `Expires ${formatUtcDate(permit.validTo)}`,
        href: permitDetailHref(permit.id),
      },
    })),
  ]
    .sort((left, right) => Date.parse(left.time) - Date.parse(right.time))
    .slice(0, 6)
    .map((entry) => entry.row);

  const permitQuery: AttentionQuery = {
    isLoading:
      suspendedPermits.isLoading ||
      submittedPermits.isLoading ||
      expiringPermits.isLoading,
    isError:
      suspendedPermits.isError ||
      submittedPermits.isError ||
      expiringPermits.isError,
    error:
      suspendedPermits.error ?? submittedPermits.error ?? expiringPermits.error,
    refetch: () => {
      void suspendedPermits.refetch();
      void submittedPermits.refetch();
      void expiringPermits.refetch();
    },
  };

  const findingRows: AttentionRowData[] = (
    inspections.data?.inspections ?? []
  )
    .flatMap((inspection) =>
      inspection.findings.map((finding) => ({
        createdAt: finding.createdAt,
        row: {
          id: `${inspection.id}:${finding.id}`,
          title: finding.description,
          meta: `${inspection.title} · ${inspection.site?.name ?? "No site"}`,
          badge: {
            label: formatHseLabel(finding.severity),
            tone: SEVERITY_TONES[finding.severity],
          },
          date: formatUtcDate(finding.createdAt),
          href: inspectionDetailHref(inspection.id),
        },
      })),
    )
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt),
    )
    .slice(0, 6)
    .map((entry) => entry.row);

  const trainingRows: AttentionRowData[] = (
    training.data?.sessions ?? []
  )
    .flatMap((session) =>
      session.participants
        .filter(
          (participant) =>
            participant.certificateState === "EXPIRED" ||
            participant.certificateState === "EXPIRING_SOON",
        )
        .map((participant) => {
          const state = participant.certificateState as CertificateState;

          return {
            expiresOn: participant.certificateExpiresOn ?? "",
            row: {
              id: `${session.id}:${participant.id}`,
              title: participant.name,
              meta: `${session.course.title ?? session.topic} · ${session.site?.name ?? "No site"}`,
              badge: {
                label: CERTIFICATE_STATE_LABELS[state],
                tone: CERTIFICATE_STATE_TONES[state],
              },
              date: `Expires ${formatUtcDate(participant.certificateExpiresOn ?? "")}`,
              href: trainingDetailHref(session.id),
            },
          };
        }),
    )
    .sort(
      (left, right) =>
        Date.parse(left.expiresOn) - Date.parse(right.expiresOn),
    )
    .slice(0, 6)
    .map((entry) => entry.row);

  const activityRows: AttentionRowData[] = (
    audits.data?.audits ?? []
  ).map((audit) => ({
    id: audit.id,
    title: audit.title,
    meta: `${formatHseLabel(audit.type)} · ${audit.site?.name ?? "No site"}`,
    badge: {
      label: formatHseLabel(audit.status),
      tone: AUDIT_TONES[audit.status],
    },
    date: formatUtcDate(audit.updatedAt),
    href: auditDetailHref(audit.id),
  }));

  return (
    <section aria-labelledby="management-attention-title" className="space-y-3">
      <div>
        <h2
          id="management-attention-title"
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600"
        >
          Management attention
        </h2>
        <p className="mt-1 text-sm text-muted">
          Bounded, site-scoped queues from the live HSE registers.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <AttentionCard
          title="Overdue CAPAs"
          description="Earliest past-due corrective actions still open or in progress."
          query={capas}
          count={capas.data?.pagination.total}
          viewAllHref={appendSiteFilter(
            "/corrective-actions?overdue=true",
            siteId,
          )}
          emptyMessage="No overdue corrective actions in this scope."
        >
          {capaRows.length > 0 && <RowList rows={capaRows} />}
        </AttentionCard>

        <AttentionCard
          title="Permits requiring attention"
          description="Suspended, awaiting approval or expiring within seven days."
          query={permitQuery}
          viewAllHref={appendSiteFilter("/permits", siteId)}
          emptyMessage="No permits need attention in this scope."
        >
          {permitRows.length > 0 && <RowList rows={permitRows} />}
        </AttentionCard>

        <AttentionCard
          title="Recent inspection findings"
          description="Latest findings recorded on inspections in scope."
          query={inspections}
          viewAllHref={appendSiteFilter("/inspections", siteId)}
          emptyMessage="No inspection findings in this scope."
        >
          {findingRows.length > 0 && <RowList rows={findingRows} />}
        </AttentionCard>

        <AttentionCard
          title="Certificate attention"
          description="Expiring or expired certificates in recent training records."
          query={training}
          viewAllHref={appendSiteFilter("/training", siteId)}
          emptyMessage="No expiring or expired certificates in recent records."
        >
          {trainingRows.length > 0 && <RowList rows={trainingRows} />}
        </AttentionCard>

        <AttentionCard
          title="Recent HSE activity"
          description="Latest audit and assurance records in scope."
          query={audits}
          count={audits.data?.pagination.total}
          viewAllHref={appendSiteFilter("/audits", siteId)}
          emptyMessage="No audit activity in this scope."
        >
          {activityRows.length > 0 && <RowList rows={activityRows} />}
        </AttentionCard>
      </div>
    </section>
  );
}
