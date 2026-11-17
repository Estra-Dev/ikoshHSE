import Link from "next/link";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import type { PermitSummary } from "@/lib/api/types";
import { permitDetailHref } from "@/lib/permits";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import {
  PermitExpiredBadge,
  PermitStatusBadge,
  PermitWorkTypeBadge,
} from "./permit-badges";

function personName(person: { firstName: string; lastName: string }): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || "Unknown employee";
}

/**
 * Register rows link to the permit detail. Project/site names and the
 * responsible person come from the populated list payload.
 */
export function PermitRegisterTable({
  permits,
}: {
  permits: readonly PermitSummary[];
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Permit</TH>
          <TH scope="col">Site</TH>
          <TH scope="col">Validity</TH>
          <TH scope="col">Responsible</TH>
          <TH scope="col">Status</TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {permits.map((permit) => (
          <TableRow key={permit.id}>
            <TD className="max-w-md">
              <Link
                href={permitDetailHref(permit.id)}
                className="font-medium text-navy-900 underline-offset-2 hover:text-navy-700 hover:underline"
              >
                {permit.workDescription}
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <PermitWorkTypeBadge workType={permit.workType} />
                <span className="text-xs text-muted">
                  {permit.project.name}
                  {permit.location ? ` · ${permit.location}` : ""}
                </span>
              </div>
            </TD>
            <TD className="text-muted">
              {permit.site.name ?? "Unknown site"}
              {permit.site.code ? ` · ${permit.site.code}` : ""}
            </TD>
            <TD className="whitespace-nowrap text-muted">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  {formatUtcDateTime(permit.validFrom)} —{" "}
                  {formatUtcDateTime(permit.validTo)}
                </span>
                {permit.isExpired && <PermitExpiredBadge />}
              </div>
            </TD>
            <TD className="whitespace-nowrap text-muted">
              {permit.responsiblePerson
                ? personName(permit.responsiblePerson)
                : "Unassigned"}
            </TD>
            <TD>
              <PermitStatusBadge status={permit.status} />
            </TD>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
