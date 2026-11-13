"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/fields";
import {
  Table,
  TableBody,
  TD,
  TH,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import {
  useAddContractorPersonnelAssignment,
  useEndContractorPersonnelAssignment,
} from "@/lib/api/contractor-personnel";
import type {
  ContractorPersonnelSiteAssignmentSummary,
  ContractorPersonnelSummary,
  ContractorSummary,
  SiteSummary,
} from "@/lib/api/types";
import {
  formatAssignmentTimestamp,
  formatAssignmentUser,
  getEligibleAssignmentSites,
} from "@/lib/contractors";

function siteLabel(site: {
  name: string | null;
  code?: string | null;
}): string {
  return site.name ?? site.code ?? "Unnamed site";
}

/**
 * Active deployment and assignment-history manager. All writes use the
 * dedicated assignment endpoints; personnel create/update never carries a site.
 */
export function ContractorAssignmentManager({
  personnel,
  contractor,
  sites,
  activeAssignments,
  assignmentHistory,
}: {
  personnel: ContractorPersonnelSummary;
  contractor: ContractorSummary | null;
  sites: readonly SiteSummary[];
  activeAssignments: readonly ContractorPersonnelSiteAssignmentSummary[];
  assignmentHistory: readonly ContractorPersonnelSiteAssignmentSummary[];
}) {
  const addAssignment = useAddContractorPersonnelAssignment();
  const endAssignment = useEndContractorPersonnelAssignment();

  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const eligibleSites = useMemo(
    () =>
      getEligibleAssignmentSites({
        sites,
        contractorProjectIds:
          contractor?.projects.map((project) => project.id) ?? [],
        activeAssignedSiteIds: activeAssignments.map(
          (assignment) => assignment.site.id,
        ),
      }),
    [sites, contractor, activeAssignments],
  );

  const assignmentsDisabledReason = !personnel.isActive
    ? "Inactive personnel cannot receive new site assignments."
    : contractor === null
      ? "The contractor record could not be loaded."
      : !contractor.isActive
        ? "Inactive contractors cannot receive new site assignments."
        : eligibleSites.length === 0
          ? "No eligible sites remain. A site must be active, belong to one of the contractor's projects, and not already be assigned."
          : "";

  async function handleAdd(): Promise<void> {
    setFeedback("");
    setError("");
    addAssignment.reset();

    if (!selectedSiteId) {
      setError("Select a site to assign.");
      return;
    }

    try {
      await addAssignment.mutateAsync({
        personnelId: personnel.id,
        siteId: selectedSiteId,
      });
      setSelectedSiteId("");
      setFeedback("Site assignment added.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to add the site assignment.",
      );
    }
  }

  async function handleEnd(
    assignment: ContractorPersonnelSiteAssignmentSummary,
  ): Promise<void> {
    setFeedback("");
    setError("");
    endAssignment.reset();

    try {
      await endAssignment.mutateAsync({
        personnelId: personnel.id,
        assignmentId: assignment.id,
      });
      setConfirmEndId(null);
      setFeedback("Site assignment ended. History has been preserved.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to end the site assignment.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              Active site assignments
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              A person may be deployed to multiple sites, but only once per
              site at a time.
            </p>
          </div>
          <Badge tone={activeAssignments.length > 0 ? "green" : "neutral"}>
            {activeAssignments.length} active
          </Badge>
        </div>

        {activeAssignments.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-navy-200 p-4 text-sm text-muted">
            No active site assignments.
          </p>
        ) : (
          <div className="mt-4">
            <Table>
              <TableHead>
                <TableRow>
                  <TH scope="col">Site</TH>
                  <TH scope="col">Assigned</TH>
                  <TH scope="col">Assigned by</TH>
                  <TH scope="col">Actions</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeAssignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TD className="font-medium text-ink">
                      {siteLabel(assignment.site)}
                      {assignment.site.code && (
                        <p className="mt-0.5 text-xs text-muted">
                          {assignment.site.code}
                        </p>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-muted">
                      {formatAssignmentTimestamp(assignment.assignedAt)}
                    </TD>
                    <TD className="text-muted">
                      {formatAssignmentUser(assignment.assignedBy)}
                    </TD>
                    <TD>
                      {confirmEndId === assignment.id ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={endAssignment.isPending}
                            onClick={() => void handleEnd(assignment)}
                          >
                            {endAssignment.isPending
                              ? "Ending..."
                              : "Confirm end"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={endAssignment.isPending}
                            onClick={() => setConfirmEndId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={endAssignment.isPending}
                          onClick={() => {
                            setError("");
                            setFeedback("");
                            setConfirmEndId(assignment.id);
                          }}
                        >
                          End assignment
                        </Button>
                      )}
                    </TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-sm font-semibold text-ink">Add site</h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            Only active sites in the contractor&apos;s projects can be assigned.
          </p>

          {assignmentsDisabledReason ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
              {assignmentsDisabledReason}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="w-full max-w-md">
                <SelectField
                  label="Site"
                  id="assignment-site"
                  value={selectedSiteId}
                  onChange={(event) => {
                    setSelectedSiteId(event.target.value);
                    setError("");
                  }}
                  options={[
                    { value: "", label: "Select a site" },
                    ...eligibleSites.map((site) => ({
                      value: site.id,
                      label: `${site.name} · ${site.code}`,
                    })),
                  ]}
                />
              </div>
              <Button
                isLoading={addAssignment.isPending}
                disabled={!selectedSiteId}
                onClick={() => void handleAdd()}
              >
                Add site
              </Button>
            </div>
          )}

          {feedback && (
            <p role="status" className="mt-3 text-sm text-emerald-700">
              {feedback}
            </p>
          )}

          {(error || addAssignment.isError || endAssignment.isError) && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error ||
                (addAssignment.error instanceof Error
                  ? addAssignment.error.message
                  : endAssignment.error instanceof Error
                    ? endAssignment.error.message
                    : "Unable to update site assignments.")}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Assignment history</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Assignments are never deleted; ending one preserves the deployment
          record.
        </p>

        {assignmentHistory.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-navy-200 p-4 text-sm text-muted">
            No assignment history yet.
          </p>
        ) : (
          <div className="mt-4">
            <Table>
              <TableHead>
                <TableRow>
                  <TH scope="col">Site</TH>
                  <TH scope="col">Assigned</TH>
                  <TH scope="col">Ended</TH>
                  <TH scope="col">Status</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignmentHistory.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TD className="font-medium text-ink">
                      {siteLabel(assignment.site)}
                      {assignment.site.code && (
                        <p className="mt-0.5 text-xs text-muted">
                          {assignment.site.code}
                        </p>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-muted">
                      {formatAssignmentTimestamp(assignment.assignedAt)}
                      <p className="mt-0.5 text-xs text-muted">
                        {formatAssignmentUser(assignment.assignedBy)}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap text-muted">
                      {formatAssignmentTimestamp(assignment.endedAt)}
                      <p className="mt-0.5 text-xs text-muted">
                        {formatAssignmentUser(assignment.endedBy)}
                      </p>
                    </TD>
                    <TD>
                      <Badge tone={assignment.isActive ? "green" : "neutral"}>
                        {assignment.isActive ? "Active" : "Ended"}
                      </Badge>
                    </TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
