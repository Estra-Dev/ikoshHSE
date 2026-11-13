import Link from "next/link";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import type { IncidentSummary } from "@/lib/api/types";
import { formatUtcDate } from "@/lib/dashboard-format";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { incidentDetailHref } from "@/lib/incident-workflow";
import {
  IncidentStatusBadge,
  IncidentTypeBadge,
} from "./incident-badges";

/**
 * Register rows link to the type-appropriate detail route so near misses keep
 * their dedicated navigation context. Site names come from the bounded site
 * list because incident responses expose identifiers only.
 */
export function IncidentRegisterTable({
  incidents,
  siteNames,
}: {
  incidents: readonly IncidentSummary[];
  siteNames: ReadonlyMap<string, string>;
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Report</TH>
          <TH scope="col">Site</TH>
          <TH scope="col">Occurred</TH>
          <TH scope="col">Status</TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {incidents.map((incident) => (
          <TableRow key={incident.id}>
            <TD className="max-w-md">
              <Link
                href={incidentDetailHref(incident.type, incident.id)}
                className="font-medium text-navy-900 underline-offset-2 hover:text-navy-700 hover:underline"
              >
                {incident.title}
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <IncidentTypeBadge type={incident.type} />
                <span className="text-xs text-muted">
                  {incident.category
                    ? formatHseLabel(incident.category)
                    : "Unclassified"}
                </span>
              </div>
            </TD>
            <TD className="text-muted">
              {siteNames.get(incident.site.id) ?? "Site details unavailable"}
            </TD>
            <TD className="whitespace-nowrap text-muted">
              {formatUtcDate(incident.occurredAt)}
            </TD>
            <TD>
              <IncidentStatusBadge status={incident.status} />
            </TD>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
