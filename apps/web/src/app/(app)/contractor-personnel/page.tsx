"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Button,
  EmptyState,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  TD,
  TH,
  Table,
  TableBody,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { ContractorPersonnelForm } from "@/components/contractors/contractor-personnel-form";
import { useContractorDirectory } from "@/lib/api/contractors";
import { useContractorPersonnelList } from "@/lib/api/contractor-personnel";
import { useMe } from "@/lib/api/employees";
import { useSites } from "@/lib/api/worksites";
import {
  contractorOptionLabel,
  formatPersonnelName,
} from "@/lib/contractors";
import { canManageContractors } from "@/lib/permissions";

/** Contractor personnel register with contractor, site and status filters. */
export default function ContractorPersonnelPage() {
  const me = useMe();
  const canManage = canManageContractors(me.data?.employee.ikoshRole);

  const [contractorId, setContractorId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const directory = useContractorDirectory({ enabled: canManage });
  const sitesQuery = useSites({ includeInactive: true, limit: 100 });
  const personnelQuery = useContractorPersonnelList(
    { contractorId, siteId, includeInactive, page, limit: 20 },
    { enabled: canManage },
  );

  const contractors = useMemo(
    () => directory.data?.contractors ?? [],
    [directory.data],
  );
  const sites = sitesQuery.data?.sites ?? [];
  const personnel = personnelQuery.data?.personnel ?? [];
  const pagination = personnelQuery.data?.pagination;

  const contractorNames = useMemo(
    () => new Map(contractors.map((contractor) => [contractor.id, contractor])),
    [contractors],
  );

  const hasFilters = Boolean(contractorId || siteId || includeInactive);
  const isUpdating =
    personnelQuery.isLoading || personnelQuery.isFetching;

  function resetPage(): void {
    setPage(1);
  }

  if (me.isLoading) {
    return <Spinner label="Checking access..." />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (!canManage) {
    return (
      <ErrorState
        title="Access restricted"
        message="Contractor personnel management is available to HSE managers and administrators only."
      />
    );
  }

  if (personnelQuery.isError) {
    return (
      <ErrorState
        title="Unable to load contractor personnel"
        message={
          personnelQuery.error instanceof Error
            ? personnelQuery.error.message
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People & partners"
        title="Contractor personnel"
        description="Manage contractor workers, their status and the sites they are deployed to."
        actions={
          !formOpen ? (
            <Button onClick={() => setFormOpen(true)}>New personnel</Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Contractor"
          id="personnel-filter-contractor"
          value={contractorId}
          onChange={(event) => {
            setContractorId(event.target.value);
            resetPage();
          }}
          options={[
            { value: "", label: "All contractors" },
            ...contractors.map((contractor) => ({
              value: contractor.id,
              label: contractorOptionLabel(contractor),
            })),
          ]}
        />
        <SelectField
          label="Site"
          id="personnel-filter-site"
          value={siteId}
          onChange={(event) => {
            setSiteId(event.target.value);
            resetPage();
          }}
          options={[
            { value: "", label: "All sites" },
            ...sites.map((site) => ({
              value: site.id,
              label: `${site.name} · ${site.code}${
                site.status === "ACTIVE" ? "" : " (inactive)"
              }`,
            })),
          ]}
        />
        <SelectField
          label="Status"
          id="personnel-filter-status"
          value={includeInactive ? "all" : "active"}
          onChange={(event) => {
            setIncludeInactive(event.target.value === "all");
            resetPage();
          }}
          options={[
            { value: "active", label: "Active only" },
            { value: "all", label: "All statuses" },
          ]}
        />
      </div>

      {formOpen && (
        <ContractorPersonnelForm
          key="new-personnel"
          personnel={null}
          contractors={contractors}
          onClose={() => setFormOpen(false)}
        />
      )}

      {isUpdating ? (
        <div className="space-y-2">
          {personnelQuery.isFetching && personnelQuery.data && (
            <p className="text-right text-xs text-muted">Updating…</p>
          )}
          <Spinner label="Loading contractor personnel..." />
        </div>
      ) : personnel.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No personnel match your filters"
            description="Try a different contractor, site or status."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setContractorId("");
                  setSiteId("");
                  setIncludeInactive(false);
                  resetPage();
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No contractor personnel yet"
            description="Add contractor workers before assigning them to sites."
            action={
              <Button onClick={() => setFormOpen(true)}>
                New personnel
              </Button>
            }
          />
        )
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TH scope="col">Person</TH>
                <TH scope="col">Contractor</TH>
                <TH scope="col">Job title</TH>
                <TH scope="col">Active sites</TH>
                <TH scope="col">Status</TH>
                <TH scope="col">Actions</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {personnel.map((person) => {
                const contractor = contractorNames.get(person.contractor.id);

                return (
                  <TableRow key={person.id}>
                    <TD>
                      <Link
                        href={`/contractor-personnel/${person.id}`}
                        className="font-medium text-navy-800 underline-offset-2 hover:underline"
                      >
                        {formatPersonnelName(person)}
                      </Link>
                      {person.personnelId && (
                        <p className="mt-0.5 text-xs text-muted">
                          {person.personnelId}
                        </p>
                      )}
                    </TD>
                    <TD className="text-muted">
                      {contractor?.name ?? "Unknown contractor"}
                    </TD>
                    <TD className="text-muted">{person.jobTitle ?? "—"}</TD>
                    <TD className="text-muted">
                      {person.activeSites.length === 0 ? (
                        "Unassigned"
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {person.activeSites.slice(0, 2).map((site) => (
                            <Badge key={site.id} tone="blue">
                              {site.name ?? site.id}
                            </Badge>
                          ))}
                          {person.activeSites.length > 2 && (
                            <Badge tone="neutral">
                              +{person.activeSites.length - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <Badge
                        tone={person.isActive ? "green" : "neutral"}
                        dot
                      >
                        {person.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TD>
                    <TD>
                      <Link
                        href={`/contractor-personnel/${person.id}`}
                        className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                    </TD>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {pagination && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
