import Link from "next/link";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import type { HseAuditSummary } from "@/lib/api/types";
import { formatUtcDate } from "@/lib/dashboard-format";
import {
  auditChecklistProgress,
  auditDetailHref,
} from "@/lib/audits";
import { AuditStatusBadge, AuditTypeBadge } from "./audit-badges";

function auditorNames(audit: HseAuditSummary): string {
  const names = audit.auditors
    .map((auditor) => `${auditor.firstName} ${auditor.lastName}`.trim())
    .filter(Boolean);

  return names.length > 0 ? names.join(", ") : "Unassigned";
}

/**
 * Register rows link to the audit detail. Checklist progress and finding counts
 * are shown so the remaining work is visible at a glance.
 */
export function AuditRegisterTable({
  audits,
}: {
  audits: readonly HseAuditSummary[];
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Audit</TH>
          <TH scope="col">Site</TH>
          <TH scope="col">Auditors</TH>
          <TH scope="col">Scheduled</TH>
          <TH scope="col">Checklist</TH>
          <TH scope="col">Findings</TH>
          <TH scope="col">Status</TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {audits.map((audit) => {
          const progress = auditChecklistProgress(audit.checklist);

          return (
            <TableRow key={audit.id}>
              <TD className="max-w-md">
                <Link
                  href={auditDetailHref(audit.id)}
                  className="font-medium text-navy-900 underline-offset-2 hover:text-navy-700 hover:underline"
                >
                  {audit.title}
                </Link>
                <p className="mt-1 text-xs text-muted">
                  {audit.project.name ?? "Unknown project"}
                </p>
              </TD>
              <TD className="text-muted">{audit.site?.name ?? "No site"}</TD>
              <TD className="max-w-xs text-muted">{auditorNames(audit)}</TD>
              <TD className="whitespace-nowrap text-muted">
                {formatUtcDate(audit.scheduledFor)}
              </TD>
              <TD className="whitespace-nowrap text-muted">
                {progress.total === 0
                  ? "—"
                  : `${progress.assessed}/${progress.total}`}
              </TD>
              <TD className="text-muted">{audit.findings.length}</TD>
              <TD>
                <div className="flex flex-wrap items-center gap-1.5">
                  <AuditStatusBadge status={audit.status} />
                  <AuditTypeBadge type={audit.type} />
                </div>
              </TD>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
