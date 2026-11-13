"use client";

import { Suspense, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
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
import { useMe } from "@/lib/api/employees";
import {
  usePersonnelDirectory,
  type PersonnelDirectoryFilters,
} from "@/lib/api/personnel";
import { useSites } from "@/lib/api/worksites";
import { IKOSH_ROLES, type HsePersonnel } from "@/lib/api/types";
import { formatEnum } from "@/components/employees/profile-section";
import { canManagePersonnelAccess } from "@/lib/permissions";
import {
  buildPersonnelFilterSearchParams,
  parsePersonnelFilters,
  PERSONNEL_BASE_PATH,
} from "@/lib/personnel";

function formatName(person: { firstName: string; lastName: string }): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || "Unnamed person";
}

function PersonnelDirectory() {
  const me = useMe();
  const viewerRole = me.data?.employee.ikoshRole;
  const canManage = canManagePersonnelAccess(viewerRole);

  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => parsePersonnelFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const navigate = useCallback(
    (next: PersonnelDirectoryFilters) => {
      const params = buildPersonnelFilterSearchParams(next);
      const query = params.toString();
      router.replace(query ? `${PERSONNEL_BASE_PATH}?${query}` : PERSONNEL_BASE_PATH);
    },
    [router],
  );

  const updateFilters = useCallback(
    (partial: Partial<PersonnelDirectoryFilters>) => {
      navigate({
        ...filters,
        ...partial,
        // Any filter change returns to the first page.
        page: partial.page ?? 1,
      });
    },
    [filters, navigate],
  );

  const sites = useSites({ includeInactive: true });
  const directory = usePersonnelDirectory({ filters, enabled: canManage });

  const siteNames = useMemo(
    () =>
      new Map(
        (sites.data?.sites ?? []).map((site) => [
          site.id,
          `${site.name} · ${site.code}`,
        ]),
      ),
    [sites.data],
  );

  const siteOptions = useMemo(() => {
    const options = (sites.data?.sites ?? []).map((site) => ({
      value: site.id,
      label: `${site.name} · ${site.code}`,
    }));

    // Keep a site selected from the URL visible even when it falls outside the
    // bounded site lookup.
    if (
      filters.siteId &&
      !options.some((option) => option.value === filters.siteId)
    ) {
      options.unshift({ value: filters.siteId, label: "Selected site" });
    }

    return [{ value: "", label: "All sites" }, ...options];
  }, [sites.data, filters.siteId]);

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
        message="HSE personnel and site-access management is available to HSE managers and administrators only."
      />
    );
  }

  if (directory.isError) {
    return (
      <ErrorState
        title="Unable to load HSE personnel"
        message={
          directory.error instanceof Error
            ? directory.error.message
            : undefined
        }
      />
    );
  }

  const people = (directory.data?.employees ?? []) as HsePersonnel[];
  const pagination = directory.data?.pagination;
  const isUpdating = directory.isLoading || directory.isFetching;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People & partners"
        title="HSE personnel & access"
        description="Manage HSE roles, active status and the sites each person may access. Site assignments control incident reporting and every site-scoped HSE record."
      />

      <div className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label="Search"
          id="personnel-search"
          type="search"
          placeholder="Name or email"
          value={filters.q}
          onChange={(event) => updateFilters({ q: event.target.value })}
        />

        <SelectField
          label="Role"
          id="personnel-filter-role"
          value={filters.ikoshRole}
          onChange={(event) =>
            updateFilters({ ikoshRole: event.target.value })
          }
          options={[
            { value: "", label: "All roles" },
            ...IKOSH_ROLES.map((role) => ({
              value: role,
              label: formatEnum(role),
            })),
          ]}
        />

        <SelectField
          label="Site"
          id="personnel-filter-site"
          value={filters.siteId}
          onChange={(event) => updateFilters({ siteId: event.target.value })}
          options={siteOptions}
        />

        <SelectField
          label="Status"
          id="personnel-filter-status"
          value={filters.isActive}
          onChange={(event) =>
            updateFilters({ isActive: event.target.value })
          }
          options={[
            { value: "", label: "Active personnel" },
            { value: "false", label: "Inactive personnel" },
          ]}
        />
      </div>

      {isUpdating && people.length === 0 ? (
        <Spinner label="Loading HSE personnel..." />
      ) : people.length === 0 ? (
        <EmptyState
          title="No personnel match your filters"
          description="Try a different role, site or status, or clear the search."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TH scope="col">Name</TH>
              <TH scope="col">Role</TH>
              <TH scope="col">Status</TH>
              <TH scope="col">Assigned sites</TH>
              <TH scope="col">Email</TH>
              <TH scope="col">Access</TH>
            </TableRow>
          </TableHead>
          <TableBody>
            {people.map((person) => (
              <TableRow key={person.id}>
                <TD>
                  <Link
                    href={`/personnel/${person.id}`}
                    className="font-medium text-navy-800 underline-offset-2 hover:underline"
                  >
                    {formatName(person)}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {person.jobTitle ?? "No job title recorded"}
                  </p>
                </TD>
                <TD>
                  <Badge tone="navy">{formatEnum(person.ikoshRole)}</Badge>
                </TD>
                <TD>
                  <Badge tone={person.isActive ? "green" : "red"} dot>
                    {person.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TD>
                <TD>
                  {person.assignedSites.length === 0 ? (
                    <span className="text-sm text-muted">
                      No site assigned
                    </span>
                  ) : (
                    <div className="flex max-w-xs flex-wrap gap-1.5">
                      {person.assignedSites.map((siteId) => (
                        <Badge key={siteId} tone="blue">
                          {siteNames.get(siteId) ?? "Unknown site"}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TD>
                <TD className="text-sm text-muted">{person.email}</TD>
                <TD>
                  <Link
                    href={`/personnel/${person.id}`}
                    className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
                  >
                    Manage access
                  </Link>
                </TD>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={(page) => updateFilters({ page })}
        />
      )}
    </div>
  );
}

/**
 * HSE personnel and site-access administration. Only HSE managers and
 * administrators may open this screen; the API enforces the same restriction
 * and returns the access fields only to those roles.
 */
export default function PersonnelPage() {
  return (
    <Suspense fallback={<Spinner label="Loading HSE personnel..." />}>
      <PersonnelDirectory />
    </Suspense>
  );
}
