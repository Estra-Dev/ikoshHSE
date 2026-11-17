"use client";

import { Fragment, useState, type FormEvent } from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import { SelectField, TextField } from "@/components/ui/fields";
import { RefreshIcon } from "@/components/icons";
import { useMe } from "@/lib/api/employees";
import { useAuditLog } from "@/lib/api/audit-log";
import type { AuditLogEntry } from "@/lib/api/types";
import {
  AUDIT_ENTITY_TYPES,
  AUDIT_LOG_DEFAULT_LIMIT,
  EMPTY_AUDIT_LOG_QUERY,
  hasActiveAuditLogFilters,
  isValidObjectId,
  type AuditLogQueryState,
} from "@/lib/audit-log";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import { canViewAuditLog } from "@/lib/permissions";

function shortId(value: string | null): string {
  return value ?? "—";
}

function Snapshot({ value }: { value: Record<string, unknown> | null }) {
  if (!value) {
    return <span className="text-muted">No snapshot</span>;
  }

  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-navy-50/40 p-3 text-[11px] leading-5 text-ink">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function AuditLogTable({
  entries,
  viewerId,
}: {
  entries: readonly AuditLogEntry[];
  viewerId: string | undefined;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string): void {
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">When</TH>
          <TH scope="col">Action</TH>
          <TH scope="col">Entity</TH>
          <TH scope="col">Actor</TH>
          <TH scope="col">
            <span className="sr-only">Details</span>
          </TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map((entry) => {
          const isOpen = expanded.has(entry.id);

          return (
            <Fragment key={entry.id}>
              <TableRow>
                <TD className="whitespace-nowrap text-muted">
                  {formatUtcDateTime(entry.createdAt)}
                </TD>
                <TD className="font-medium text-ink">{entry.action}</TD>
                <TD className="text-muted">
                  <span className="block">{entry.entityType}</span>
                  <span className="mt-0.5 block break-all text-xs">
                    {shortId(entry.entityId)}
                  </span>
                </TD>
                <TD className="break-all text-muted">
                  {viewerId && entry.actor.id === viewerId
                    ? "You"
                    : entry.actor.id}
                </TD>
                <TD className="text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-expanded={isOpen}
                    onClick={() => toggle(entry.id)}
                  >
                    {isOpen ? "Hide details" : "Details"}
                  </Button>
                </TD>
              </TableRow>

              {isOpen && (
                <tr className="border-b border-line bg-navy-50/20">
                  <td colSpan={5} className="px-4 py-4">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                          Before
                        </p>
                        <Snapshot value={entry.before} />
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                          After
                        </p>
                        <Snapshot value={entry.after} />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Read-only audit log. The API exposes the latest matching entries only, so
 * this screen offers filters and a bounded limit rather than paging.
 */
export function AuditLogView() {
  const me = useMe();
  const role = me.data?.employee.ikoshRole;
  const viewerId = me.data?.employee.id;

  const [draft, setDraft] = useState<AuditLogQueryState>(
    EMPTY_AUDIT_LOG_QUERY,
  );
  const [query, setQuery] = useState<AuditLogQueryState>(
    EMPTY_AUDIT_LOG_QUERY,
  );
  const [idError, setIdError] = useState("");

  const auditLog = useAuditLog(query, {
    enabled: canViewAuditLog(role),
  });
  const entries = auditLog.data?.data.auditLog ?? [];
  const filtersActive = hasActiveAuditLogFilters(query);

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const entityId = draft.entityId.trim();

    if (entityId && !isValidObjectId(entityId)) {
      setIdError("Entity ID must be a 24-character MongoDB identifier.");
      return;
    }

    setIdError("");
    setQuery({ ...draft, entityId });
  }

  function resetFilters(): void {
    setIdError("");
    setDraft(EMPTY_AUDIT_LOG_QUERY);
    setQuery(EMPTY_AUDIT_LOG_QUERY);
  }

  if (me.isLoading) {
    return <Spinner label="Checking permissions..." />;
  }

  if (!canViewAuditLog(role)) {
    return (
      <EmptyState
        title="Audit log is restricted"
        description="Only HSE managers and administrators can view the audit log."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assurance"
        title="Audit log"
        description="Immutable record of HSE record changes. Newest entries first; the API returns the latest matches only."
      />

      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-5"
      >
        <SelectField
          label="Entity type"
          id="audit-filter-entity-type"
          value={draft.entityType}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              entityType: event.target.value,
            }))
          }
          options={[
            { value: "", label: "All entity types" },
            ...AUDIT_ENTITY_TYPES.map((type) => ({
              value: type,
              label: type,
            })),
          ]}
        />

        <TextField
          label="Entity ID"
          id="audit-filter-entity-id"
          value={draft.entityId}
          error={idError}
          onChange={(event) => {
            setDraft((current) => ({
              ...current,
              entityId: event.target.value,
            }));
            setIdError("");
          }}
          placeholder="24-character id"
        />

        <TextField
          label="Action"
          id="audit-filter-action"
          value={draft.action}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              action: event.target.value,
            }))
          }
          placeholder="e.g. corrective_action.updated"
        />

        <SelectField
          label="Limit"
          id="audit-filter-limit"
          value={String(draft.limit)}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              limit: Number.parseInt(event.target.value, 10),
            }))
          }
          options={[
            { value: "25", label: "25 entries" },
            { value: String(AUDIT_LOG_DEFAULT_LIMIT), label: "50 entries" },
            { value: "100", label: "100 entries" },
          ]}
        />

        <div className="flex items-end gap-2">
          <Button type="submit" className="flex-1 justify-center">
            Apply filters
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={resetFilters}
            disabled={!filtersActive && query.limit === AUDIT_LOG_DEFAULT_LIMIT}
          >
            Reset
          </Button>
        </div>
      </form>

      {auditLog.isError ? (
        <ErrorState
          title="Unable to load the audit log"
          message={
            auditLog.error instanceof Error
              ? auditLog.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void auditLog.refetch()}
              isLoading={auditLog.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : auditLog.isLoading ? (
        <Spinner label="Loading audit log..." />
      ) : entries.length === 0 ? (
        <EmptyState
          title={filtersActive ? "No entries match these filters" : "No audit entries yet"}
          description={
            filtersActive
              ? "Adjust the entity type, entity ID or action filter to see more results."
              : "HSE record changes will appear here as they are made."
          }
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={resetFilters}>
                Reset filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Showing the latest {entries.length} matching entr
              {entries.length === 1 ? "y" : "ies"}.
            </p>
            <Badge tone="neutral">
              {auditLog.isFetching ? "Updating…" : `Limit ${query.limit}`}
            </Badge>
          </div>

          <AuditLogTable entries={entries} viewerId={viewerId} />
        </div>
      )}
    </div>
  );
}
