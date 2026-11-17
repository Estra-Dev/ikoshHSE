import Link from "next/link";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import type { RiskAssessmentSummary } from "@/lib/api/types";
import { formatUtcDate } from "@/lib/dashboard-format";
import {
  riskAssessmentDetailHref,
  riskAssessmentLevelSummary,
} from "@/lib/risk-assessments";
import {
  RiskAssessmentStatusBadge,
  RiskLevelBadge,
} from "./risk-assessment-badges";

function ownerName(assessment: RiskAssessmentSummary): string {
  if (!assessment.owner) {
    return "Unassigned";
  }

  const name =
    `${assessment.owner.firstName} ${assessment.owner.lastName}`.trim();
  return name || "Unassigned";
}

/**
 * Register rows link to the assessment detail. The highest residual band is
 * shown so the riskiest assessments stand out at a glance.
 */
export function RiskAssessmentRegisterTable({
  assessments,
}: {
  assessments: readonly RiskAssessmentSummary[];
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Assessment</TH>
          <TH scope="col">Site</TH>
          <TH scope="col">Owner</TH>
          <TH scope="col">Hazards</TH>
          <TH scope="col">Highest residual</TH>
          <TH scope="col">Review</TH>
          <TH scope="col">Status</TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {assessments.map((assessment) => {
          const levels = riskAssessmentLevelSummary(assessment.hazards);

          return (
            <TableRow key={assessment.id}>
              <TD className="max-w-md">
                <Link
                  href={riskAssessmentDetailHref(assessment.id)}
                  className="font-medium text-navy-900 underline-offset-2 hover:text-navy-700 hover:underline"
                >
                  {assessment.title}
                </Link>
                <p className="mt-1 text-xs text-muted">
                  {assessment.project.name ?? "Unknown project"}
                </p>
              </TD>
              <TD className="text-muted">{assessment.site?.name ?? "No site"}</TD>
              <TD className="whitespace-nowrap text-muted">
                {ownerName(assessment)}
              </TD>
              <TD className="text-muted">{assessment.hazards.length}</TD>
              <TD>
                {levels.residual ? (
                  <RiskLevelBadge level={levels.residual} />
                ) : (
                  <span className="text-muted">—</span>
                )}
              </TD>
              <TD className="whitespace-nowrap text-muted">
                {assessment.reviewDate
                  ? formatUtcDate(assessment.reviewDate)
                  : "Not set"}
              </TD>
              <TD>
                <RiskAssessmentStatusBadge status={assessment.status} />
              </TD>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
