"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  buttonStyles,
  EmptyState,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SelectField, TextField } from "@/components/ui/fields";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import { PlusIcon, RefreshIcon } from "@/components/icons";
import { useMe } from "@/lib/api/employees";
import {
  usePpeIssuances,
  usePpeItems,
  usePpeStock,
  useUpdatePpeItem,
} from "@/lib/api/ppe";
import { useProjects, useSites } from "@/lib/api/worksites";
import type {
  PpeIssuanceStatus,
  PpeItemSummary,
  PpeStockSummary,
  WorkforceParticipantKind,
} from "@/lib/api/types";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import {
  DEFAULT_PPE_FILTERS,
  formatPpeItemName,
  hasActivePpeFilters,
  PPE_CATEGORY_LABELS,
  PPE_CONDITION_LABELS,
  PPE_KIND_LABELS,
  PPE_STATUS_LABELS,
  PPE_UNIT_LABELS,
  ppeStockLabel,
  type PpeFilterState,
} from "@/lib/ppe";
import {
  canIssuePpe,
  canManagePpeCatalogue,
  canManagePpeStock,
  canViewPpe,
} from "@/lib/permissions";
import {
  PpeCatalogueForm,
  PpeIssueForm,
  PpeIssuanceActions,
  PpeStockForm,
} from "./ppe-forms";

type PpeTab = "issuances" | "stock" | "catalogue";

const TABS: readonly { id: PpeTab; label: string }[] = [
  { id: "issuances", label: "Issuances" },
  { id: "stock", label: "Stock" },
  { id: "catalogue", label: "Catalogue" },
];

function statusTone(status: PpeIssuanceStatus) {
  if (status === "ISSUED") return "blue" as const;
  if (status === "RETURNED") return "green" as const;
  if (status === "REPLACED") return "violet" as const;
  return "red" as const;
}

function stockTone(stock: PpeStockSummary) {
  if (stock.isOutOfStock) return "red" as const;
  if (stock.isLowStock) return "amber" as const;
  return "green" as const;
}

export function PpeRegister() {
  const me = useMe();
  const role = me.data?.employee.ikoshRole;
  const projects = useProjects();
  const sites = useSites({ includeInactive: true, limit: 100 });

  const [tab, setTab] = useState<PpeTab>("issuances");
  const [filters, setFilters] = useState<PpeFilterState>(DEFAULT_PPE_FILTERS);
  const [stockQuery, setStockQuery] = useState({ q: "", lowStockOnly: false });
  const [catalogueQuery, setCatalogueQuery] = useState({ q: "" });
  const [editingItem, setEditingItem] = useState<PpeItemSummary | null>(null);
  const [creatingCatalogue, setCreatingCatalogue] = useState(false);
  const [creatingStock, setCreatingStock] = useState(false);
  const [editingStock, setEditingStock] = useState<PpeStockSummary | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [updatingIssuanceId, setUpdatingIssuanceId] = useState<string | null>(
    null,
  );

  const items = usePpeItems({
    q: catalogueQuery.q,
    includeInactive: canManagePpeCatalogue(role),
  });
  const issuances = usePpeIssuances(filters);
  const stock = usePpeStock({
    q: stockQuery.q,
    projectId: filters.projectId,
    siteId: filters.siteId,
    lowStockOnly: stockQuery.lowStockOnly,
    page: filters.page,
    limit: 50,
  });
  const updateItem = useUpdatePpeItem();

  const activeSites = useMemo(
    () => sites.data?.sites ?? [],
    [sites.data?.sites],
  );
  const allItems = items.data?.items ?? [];
  const selectedIssuance =
    issuances.data?.issuances.find(
      (issuance) => issuance.id === updatingIssuanceId,
    ) ?? null;

  function changeFilters(partial: Partial<PpeFilterState>) {
    setFilters((current) => ({ ...current, ...partial, page: partial.page ?? 1 }));
  }

  function resetFilters() {
    setFilters(DEFAULT_PPE_FILTERS);
    setStockQuery({ q: "", lowStockOnly: false });
    setCatalogueQuery({ q: "" });
  }

  const canIssue = canIssuePpe(role);
  const canStock = canManagePpeStock(role);
  const canCatalogue = canManagePpeCatalogue(role);
  const filtersActive = hasActivePpeFilters(filters) || stockQuery.q;

  if (me.isLoading) {
    return <Spinner label="Checking PPE access..." />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (!canViewPpe(role)) {
    return (
      <ErrorState
        title="Access restricted"
        message="PPE management is available to HSE staff only."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assurance"
        title="PPE management"
        description="Catalogue, per-site stock and personnel issuance history. Employees and contractor personnel are tracked separately."
        actions={
          <>
            {tab === "issuances" && canIssue && (
              <Button onClick={() => setIssuing(true)} size="sm">
                <PlusIcon size={16} />
                Issue PPE
              </Button>
            )}
            {tab === "stock" && canStock && (
              <Button onClick={() => setCreatingStock(true)} size="sm">
                <PlusIcon size={16} />
                Add stock
              </Button>
            )}
            {tab === "catalogue" && canCatalogue && (
              <Button onClick={() => setCreatingCatalogue(true)} size="sm">
                <PlusIcon size={16} />
                New item
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="PPE views">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={buttonStyles(
              tab === entry.id ? "primary" : "secondary",
              "sm",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {(tab === "issuances" || tab === "stock") && (
            <>
              <SelectField
                label="Project"
                id="ppe-filter-project"
                value={filters.projectId}
                onChange={(event) =>
                  changeFilters({ projectId: event.target.value, siteId: "" })
                }
                options={[
                  { value: "", label: "All accessible projects" },
                  ...(projects.data?.projects ?? []).map((project) => ({
                    value: project.id,
                    label: project.name,
                  })),
                ]}
              />
              <SelectField
                label="Site"
                id="ppe-filter-site"
                value={filters.siteId}
                onChange={(event) =>
                  changeFilters({ siteId: event.target.value })
                }
                options={[
                  { value: "", label: "All accessible sites" },
                  ...activeSites
                    .filter(
                      (site) =>
                        !filters.projectId ||
                        site.project.id === filters.projectId,
                    )
                    .map((site) => ({
                      value: site.id,
                      label: `${site.name} · ${site.code}`,
                    })),
                ]}
              />
            </>
          )}

          {tab === "issuances" && (
            <>
              <SelectField
                label="Status"
                id="ppe-filter-status"
                value={filters.status}
                onChange={(event) =>
                  changeFilters({
                    status: event.target.value as PpeFilterState["status"],
                  })
                }
                options={[
                  { value: "", label: "All statuses" },
                  ...(
                    Object.keys(PPE_STATUS_LABELS) as PpeIssuanceStatus[]
                  ).map((status) => ({
                    value: status,
                    label: PPE_STATUS_LABELS[status],
                  })),
                ]}
              />
              <SelectField
                label="Recipient type"
                id="ppe-filter-kind"
                value={filters.kind}
                onChange={(event) =>
                  changeFilters({
                    kind: event.target.value as
                      | ""
                      | WorkforceParticipantKind,
                  })
                }
                options={[
                  { value: "", label: "All recipients" },
                  { value: "EMPLOYEE", label: PPE_KIND_LABELS.EMPLOYEE },
                  { value: "CONTRACTOR", label: PPE_KIND_LABELS.CONTRACTOR },
                ]}
              />
              <TextField
                label="From"
                id="ppe-filter-from"
                type="date"
                value={filters.from}
                onChange={(event) =>
                  changeFilters({ from: event.target.value })
                }
              />
              <TextField
                label="To"
                id="ppe-filter-to"
                type="date"
                value={filters.to}
                onChange={(event) => changeFilters({ to: event.target.value })}
              />
            </>
          )}

          {tab === "stock" && (
            <label className="flex items-end gap-2 pb-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={stockQuery.lowStockOnly}
                onChange={(event) => {
                  setStockQuery((current) => ({
                    ...current,
                    lowStockOnly: event.target.checked,
                  }));
                  setFilters((current) => ({ ...current, page: 1 }));
                }}
              />
              Show only low or out of stock
            </label>
          )}

          <TextField
            label="Search"
            id="ppe-filter-q"
            value={
              tab === "stock"
                ? stockQuery.q
                : tab === "catalogue"
                  ? catalogueQuery.q
                  : filters.q
            }
            placeholder="Item, recipient or code"
            onChange={(event) => {
              const value = event.target.value;
              if (tab === "stock") {
                setStockQuery((current) => ({ ...current, q: value }));
              } else if (tab === "catalogue") {
                setCatalogueQuery({ q: value });
              } else {
                changeFilters({ q: value });
              }
            }}
          />

          <div className="flex items-end gap-2">
            <Button
              variant="secondary"
              onClick={resetFilters}
              disabled={!filtersActive}
            >
              Reset
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                void issuances.refetch();
                void stock.refetch();
                void items.refetch();
              }}
              isLoading={
                issuances.isFetching || stock.isFetching || items.isFetching
              }
            >
              <RefreshIcon size={16} />
              Refresh
            </Button>
          </div>
        </CardBody>
      </Card>

      {issuing && (
        <PpeIssueForm
          sites={activeSites}
          items={allItems}
          onDone={() => {
            setIssuing(false);
            void issuances.refetch();
            void stock.refetch();
          }}
          onCancel={() => setIssuing(false)}
        />
      )}

      {selectedIssuance && (
        <PpeIssuanceActions
          issuance={selectedIssuance}
          onDone={() => {
            setUpdatingIssuanceId(null);
            void issuances.refetch();
            void stock.refetch();
          }}
          onCancel={() => setUpdatingIssuanceId(null)}
        />
      )}

      {(creatingStock || editingStock) && (
        <PpeStockForm
          sites={activeSites}
          items={allItems}
          stock={editingStock ?? undefined}
          onDone={() => {
            setCreatingStock(false);
            setEditingStock(null);
            void stock.refetch();
          }}
          onCancel={() => {
            setCreatingStock(false);
            setEditingStock(null);
          }}
        />
      )}

      {(creatingCatalogue || editingItem) && (
        <PpeCatalogueForm
          item={editingItem ?? undefined}
          onDone={() => {
            setCreatingCatalogue(false);
            setEditingItem(null);
            void items.refetch();
          }}
          onCancel={() => {
            setCreatingCatalogue(false);
            setEditingItem(null);
          }}
        />
      )}

      {tab === "issuances" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Issuances"
              value={issuances.data?.pagination.total ?? 0}
              hint="Matching the current filters"
            />
            <StatCard
              label="Stock lines"
              value={stock.data?.summary.total ?? 0}
              hint={`${stock.data?.summary.low ?? 0} low · ${
                stock.data?.summary.outOfStock ?? 0
              } out`}
              tone="amber"
            />
            <StatCard
              label="Open issues"
              value={
                issuances.data?.issuances.filter(
                  (issuance) => issuance.status === "ISSUED",
                ).length ?? 0
              }
              hint="On this page"
              tone="navy"
            />
          </div>

          {issuances.isError && !issuances.data ? (
            <ErrorState
              title="Unable to load PPE issuances"
              message={
                issuances.error instanceof Error
                  ? issuances.error.message
                  : "Please try again."
              }
            />
          ) : issuances.isLoading ? (
            <Spinner label="Loading PPE issuances..." />
          ) : (issuances.data?.issuances.length ?? 0) === 0 ? (
            <EmptyState
              title="No PPE issuances found"
              description="Adjust the filters or issue PPE to an employee or contractor person."
              action={
                canIssue ? (
                  <Button onClick={() => setIssuing(true)}>Issue PPE</Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TH scope="col">Item</TH>
                    <TH scope="col">Recipient</TH>
                    <TH scope="col">Quantity</TH>
                    <TH scope="col">Site</TH>
                    <TH scope="col">Issued</TH>
                    <TH scope="col">Condition</TH>
                    <TH scope="col">Status</TH>
                    <TH scope="col">Actions</TH>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {issuances.data?.issuances.map((issuance) => (
                    <TableRow key={issuance.id}>
                      <TD className="font-medium text-navy-900">
                        {formatPpeItemName(issuance.item)}
                      </TD>
                      <TD>
                        <span className="font-medium text-navy-900">
                          {issuance.recipient.name}
                        </span>
                        <div className="mt-1">
                          <Badge
                            tone={
                              issuance.recipient.kind === "EMPLOYEE"
                                ? "blue"
                                : "violet"
                            }
                          >
                            {PPE_KIND_LABELS[issuance.recipient.kind]}
                          </Badge>
                        </div>
                      </TD>
                      <TD className="tabular text-muted">{issuance.quantity}</TD>
                      <TD className="text-muted">
                        {issuance.site.name ?? issuance.site.code ?? "—"}
                      </TD>
                      <TD className="whitespace-nowrap text-muted">
                        {formatUtcDateTime(issuance.issuedOn)}
                      </TD>
                      <TD className="text-muted">
                        {PPE_CONDITION_LABELS[issuance.conditionAtIssue]}
                      </TD>
                      <TD>
                        <Badge tone={statusTone(issuance.status)}>
                          {PPE_STATUS_LABELS[issuance.status]}
                        </Badge>
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-2">
                          {issuance.recipient.employeeId && (
                            <Link
                              href={`/employees/${issuance.recipient.employeeId}`}
                              className={buttonStyles("ghost", "sm")}
                            >
                              Person
                            </Link>
                          )}
                          {issuance.recipient.contractorPersonnelId && (
                            <Link
                              href={`/contractor-personnel/${issuance.recipient.contractorPersonnelId}`}
                              className={buttonStyles("ghost", "sm")}
                            >
                              Person
                            </Link>
                          )}
                          {canIssue && issuance.status === "ISSUED" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setUpdatingIssuanceId(issuance.id)
                              }
                            >
                              Update
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination
                page={issuances.data?.pagination.page ?? filters.page}
                totalPages={issuances.data?.pagination.totalPages ?? 1}
                total={issuances.data?.pagination.total ?? 0}
                limit={issuances.data?.pagination.limit ?? filters.limit}
                onPageChange={(page) => changeFilters({ page })}
              />
            </>
          )}
        </div>
      )}

      {tab === "stock" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Stock lines"
              value={stock.data?.summary.total ?? 0}
              hint="Item and site combinations"
            />
            <StatCard
              label="Low stock"
              value={stock.data?.summary.low ?? 0}
              hint="At or below the minimum"
              tone="amber"
            />
            <StatCard
              label="Out of stock"
              value={stock.data?.summary.outOfStock ?? 0}
              hint="No units on hand"
              tone="red"
            />
          </div>

          {stock.isError && !stock.data ? (
            <ErrorState
              title="Unable to load PPE stock"
              message={
                stock.error instanceof Error
                  ? stock.error.message
                  : "Please try again."
              }
            />
          ) : stock.isLoading ? (
            <Spinner label="Loading PPE stock..." />
          ) : (stock.data?.stock.length ?? 0) === 0 ? (
            <EmptyState
              title="No PPE stock found"
              description="Add stock for an active site or adjust the filters."
              action={
                canStock ? (
                  <Button onClick={() => setCreatingStock(true)}>
                    Add stock
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TH scope="col">Item</TH>
                    <TH scope="col">Site</TH>
                    <TH scope="col">On hand</TH>
                    <TH scope="col">Minimum</TH>
                    <TH scope="col">State</TH>
                    <TH scope="col">Updated</TH>
                    <TH scope="col">Actions</TH>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stock.data?.stock.map((line) => (
                    <TableRow key={line.id}>
                      <TD className="font-medium text-navy-900">
                        {formatPpeItemName(line.item)}
                      </TD>
                      <TD className="text-muted">
                        {line.site.name ?? line.site.code ?? "—"}
                      </TD>
                      <TD className="tabular font-medium text-navy-900">
                        {line.quantityOnHand}
                      </TD>
                      <TD className="tabular text-muted">
                        {line.minimumQuantity}
                      </TD>
                      <TD>
                        <Badge tone={stockTone(line)}>
                          {ppeStockLabel(line)}
                        </Badge>
                      </TD>
                      <TD className="whitespace-nowrap text-muted">
                        {formatUtcDateTime(line.updatedAt)}
                      </TD>
                      <TD>
                        {canStock && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingStock(line)}
                          >
                            Adjust
                          </Button>
                        )}
                      </TD>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={stock.data?.pagination.page ?? 1}
                totalPages={stock.data?.pagination.totalPages ?? 1}
                total={stock.data?.pagination.total ?? 0}
                limit={stock.data?.pagination.limit ?? 50}
                onPageChange={(page) => changeFilters({ page })}
              />
            </>
          )}
        </div>
      )}

      {tab === "catalogue" && (
        <div className="space-y-4">
          {items.isError ? (
            <ErrorState
              title="Unable to load the PPE catalogue"
              message={
                items.error instanceof Error
                  ? items.error.message
                  : "Please try again."
              }
            />
          ) : items.isLoading ? (
            <Spinner label="Loading PPE catalogue..." />
          ) : allItems.length === 0 ? (
            <EmptyState
              title="No catalogue items found"
              description="Create a catalogue item before recording stock or issuing PPE."
              action={
                canCatalogue ? (
                  <Button onClick={() => setCreatingCatalogue(true)}>
                    New item
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TH scope="col">Code</TH>
                  <TH scope="col">Name</TH>
                  <TH scope="col">Category</TH>
                  <TH scope="col">Unit</TH>
                  <TH scope="col">Size</TH>
                  <TH scope="col">Status</TH>
                  <TH scope="col">Actions</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {allItems.map((item) => (
                  <TableRow key={item.id}>
                    <TD className="font-mono text-xs text-muted">{item.code}</TD>
                    <TD className="font-medium text-navy-900">{item.name}</TD>
                    <TD className="text-muted">
                      {PPE_CATEGORY_LABELS[item.category]}
                    </TD>
                    <TD className="text-muted">{PPE_UNIT_LABELS[item.unit]}</TD>
                    <TD className="text-muted">{item.size ?? "—"}</TD>
                    <TD>
                      <Badge tone={item.isActive ? "green" : "neutral"} dot>
                        {item.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TD>
                    <TD>
                      {canCatalogue && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingItem(item)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant={item.isActive ? "danger" : "secondary"}
                            size="sm"
                            disabled={updateItem.isPending}
                            onClick={() =>
                              void updateItem.mutateAsync({
                                id: item.id,
                                input: { isActive: !item.isActive },
                              })
                            }
                          >
                            {item.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      )}
                    </TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
