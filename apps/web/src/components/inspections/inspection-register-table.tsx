import Link from "next/link";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import type { InspectionSummary } from "@/lib/api/types";
import {
  inspectionDetailHref,
  isInspectionOverdue,
} from "@/lib/inspections";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import {
  InspectionOverdueBadge,
  InspectionStatusBadge,
  InspectionTypeBadge,
} from "./inspection-badges";

function inspectorName(inspection: InspectionSummary): string {
  const name =
    `${inspection.inspector.firstName} ${inspection.inspector.lastName}`.trim();
  return name || "Unassigned";
}

/**
 * Register rows link to the inspection detail. Project/site names and the
 * inspector come from the populated list payload.
 */
export function InspectionRegisterTable({
  inspections,
}: {
  inspections: readonly InspectionSummary[];
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Inspection</TH>
          <TH scope="col">Inspector</TH>
          <TH scope="col">Site</TH>
          <TH scope="col">Scheduled</TH>
          <TH scope="col">Findings</TH>
          <TH scope="col">Status</TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {inspections.map((inspection) => (
          <TableRow key={inspection.id}>
            <TD className="max-w-md">
              <Link
                href={inspectionDetailHref(inspection.id)}
                className="font-medium text-navy-900 underline-offset-2 hover:text-navy-700 hover:underline"
              >
                {inspection.title}
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <InspectionTypeBadge type={inspection.type} />
                <span className="text-xs text-muted">
                  {inspection.project.name}
                </span>
              </div>
            </TD>
            <TD className="whitespace-nowrap text-muted">
              {inspectorName(inspection)}
            </TD>
            <TD className="text-muted">{inspection.site?.name ?? "No site"}</TD>
            <TD className="whitespace-nowrap text-muted">
              <div className="flex flex-wrap items-center gap-2">
                {formatUtcDateTime(inspection.scheduledFor)}
                {isInspectionOverdue(inspection) && <InspectionOverdueBadge />}
              </div>
            </TD>
            <TD className="text-muted">{inspection.findings.length}</TD>
            <TD>
              <InspectionStatusBadge status={inspection.status} />
            </TD>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
