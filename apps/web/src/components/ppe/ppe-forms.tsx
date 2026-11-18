"use client";

import { useState, type FormEvent } from "react";
import {
  Button,
  buttonStyles,
  ErrorState,
} from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import { useParticipantContractorPersonnel, useParticipantEmployees } from "@/lib/api/workforce";
import {
  useCreatePpeItem,
  useCreatePpeStock,
  useIssuePpe,
  useMarkPpeLost,
  useReplacePpe,
  useReturnPpe,
  useUpdatePpeItem,
  useUpdatePpeStock,
} from "@/lib/api/ppe";
import { useMe } from "@/lib/api/employees";
import type {
  PpeCondition,
  PpeIssuanceSummary,
  PpeItemSummary,
  PpeStockSummary,
  PpeUnit,
  SiteSummary,
  WorkforceParticipantKind,
} from "@/lib/api/types";
import {
  formatPpeItemName,
  isRestockableCondition,
  PPE_CATEGORY_LABELS,
  PPE_CONDITION_LABELS,
  PPE_UNIT_LABELS,
} from "@/lib/ppe";
import { canManagePpeCatalogue, canManagePpeStock } from "@/lib/permissions";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateToIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function mutationMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The action could not be completed.";
}

const conditionOptions = (
  Object.keys(PPE_CONDITION_LABELS) as PpeCondition[]
).map((value) => ({ value, label: PPE_CONDITION_LABELS[value] }));

const unitOptions = (Object.keys(PPE_UNIT_LABELS) as PpeUnit[]).map(
  (value) => ({ value, label: PPE_UNIT_LABELS[value] }),
);

const categoryOptions = (
  Object.keys(PPE_CATEGORY_LABELS) as (keyof typeof PPE_CATEGORY_LABELS)[]
).map((value) => ({ value, label: PPE_CATEGORY_LABELS[value] }));

function siteOptions(sites: readonly SiteSummary[]) {
  return sites
    .filter((site) => site.status === "ACTIVE")
    .map((site) => ({ value: site.id, label: `${site.name} · ${site.code}` }));
}

function itemOptions(items: readonly PpeItemSummary[]) {
  return items
    .filter((item) => item.isActive)
    .map((item) => ({
      value: item.id,
      label: formatPpeItemName(item),
    }));
}

export function PpeIssueForm({
  sites,
  items,
  onDone,
  onCancel,
}: {
  sites: readonly SiteSummary[];
  items: readonly PpeItemSummary[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const issue = useIssuePpe();
  const [siteId, setSiteId] = useState("");
  const [itemId, setItemId] = useState("");
  const [kind, setKind] = useState<WorkforceParticipantKind>("EMPLOYEE");
  const [personId, setPersonId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<PpeCondition>("NEW");
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const employees = useParticipantEmployees(siteId);
  const contractorPersonnel = useParticipantContractorPersonnel(
    kind === "CONTRACTOR" ? siteId : "",
  );

  const people =
    kind === "EMPLOYEE"
      ? (employees.data?.employees ?? []).map((person) => ({
          value: person.id,
          label: `${person.firstName} ${person.lastName}`.trim(),
        }))
      : (contractorPersonnel.data?.personnel ?? []).map((person) => ({
          value: person.id,
          label: person.personnelId
            ? `${person.firstName} ${person.lastName} · ${person.personnelId}`
            : `${person.firstName} ${person.lastName}`,
        }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!siteId || !itemId || !personId) {
      setError("Choose a site, an item and a recipient.");
      return;
    }

    const parsedQuantity = Number.parseInt(quantity, 10);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
      setError("Quantity must be at least 1.");
      return;
    }

    try {
      await issue.mutateAsync({
        itemId,
        siteId,
        recipient: {
          kind,
          ...(kind === "EMPLOYEE"
            ? { employeeId: personId }
            : { contractorPersonnelId: personId }),
        },
        quantity: parsedQuantity,
        conditionAtIssue: condition,
        issuedOn: dateToIso(issuedOn),
        notes: notes.trim() || undefined,
      });
      onDone();
    } catch (caught) {
      setError(mutationMessage(caught));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Issue PPE"
        description="Issue one catalogue item to an IKOSH employee or contractor person at an active site. Stock is deducted atomically."
      />
      <CardBody>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Site"
            id="ppe-issue-site"
            value={siteId}
            onChange={(event) => {
              setSiteId(event.target.value);
              setPersonId("");
            }}
            options={[{ value: "", label: "Select a site" }, ...siteOptions(sites)]}
          />
          <SelectField
            label="PPE item"
            id="ppe-issue-item"
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
            options={[{ value: "", label: "Select an item" }, ...itemOptions(items)]}
          />
          <SelectField
            label="Recipient type"
            id="ppe-issue-kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as WorkforceParticipantKind);
              setPersonId("");
            }}
            options={[
              { value: "EMPLOYEE", label: "IKOSH employee" },
              { value: "CONTRACTOR", label: "Contractor personnel" },
            ]}
          />
          <SelectField
            label={kind === "EMPLOYEE" ? "Employee" : "Contractor person"}
            id="ppe-issue-person"
            value={personId}
            onChange={(event) => setPersonId(event.target.value)}
            options={[
              { value: "", label: "Select a recipient" },
              ...people,
            ]}
            hint={
              siteId
                ? "Only people currently assigned to this site are listed."
                : "Choose a site first."
            }
            disabled={!siteId}
          />
          <TextField
            label="Quantity"
            id="ppe-issue-quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <SelectField
            label="Condition at issue"
            id="ppe-issue-condition"
            value={condition}
            onChange={(event) => setCondition(event.target.value as PpeCondition)}
            options={conditionOptions}
          />
          <TextField
            label="Issued on"
            id="ppe-issue-date"
            type="date"
            max={todayIso()}
            value={issuedOn}
            onChange={(event) => setIssuedOn(event.target.value)}
          />
          <div className="sm:col-span-2">
            <TextareaField
              label="Notes"
              id="ppe-issue-notes"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {error && (
            <p className="sm:col-span-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button type="submit" disabled={issue.isPending}>
              {issue.isPending ? "Issuing..." : "Issue PPE"}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function PpeStockForm({
  sites,
  items,
  stock,
  onDone,
  onCancel,
}: {
  sites: readonly SiteSummary[];
  items: readonly PpeItemSummary[];
  stock?: PpeStockSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createStock = useCreatePpeStock();
  const updateStock = useUpdatePpeStock();
  const enabled = canManagePpeStock(useMe().data?.employee.ikoshRole);
  const [siteId, setSiteId] = useState(stock?.site.id ?? "");
  const [itemId, setItemId] = useState(stock?.item.id ?? "");
  const [quantity, setQuantity] = useState(String(stock?.quantityOnHand ?? 0));
  const [minimum, setMinimum] = useState(String(stock?.minimumQuantity ?? 0));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (!enabled) {
    return (
      <Card>
        <CardBody>
          <ErrorState
            title="Stock management is restricted"
            message="Only HSE officers, HSE managers and administrators may change stock levels."
          />
        </CardBody>
      </Card>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const parsedQuantity = Number.parseInt(quantity, 10);
    const parsedMinimum = Number.parseInt(minimum, 10);

    if (
      !Number.isFinite(parsedQuantity) ||
      parsedQuantity < 0 ||
      !Number.isFinite(parsedMinimum) ||
      parsedMinimum < 0
    ) {
      setError("Quantities must be zero or greater.");
      return;
    }

    if (!reason.trim()) {
      setError("Record a reason for this stock change.");
      return;
    }

    try {
      if (stock) {
        await updateStock.mutateAsync({
          id: stock.id,
          input: {
            quantityOnHand: parsedQuantity,
            minimumQuantity: parsedMinimum,
            reason: reason.trim(),
          },
        });
      } else {
        if (!siteId || !itemId) {
          setError("Choose a site and an item.");
          return;
        }

        await createStock.mutateAsync({
          siteId,
          itemId,
          quantityOnHand: parsedQuantity,
          minimumQuantity: parsedMinimum,
          reason: reason.trim(),
        });
      }

      onDone();
    } catch (caught) {
      setError(mutationMessage(caught));
    }
  }

  return (
    <Card>
      <CardHeader
        title={stock ? "Adjust stock" : "Add stock"}
        description="Stock is tracked per item and site. A reason is required and stored in the audit trail."
      />
      <CardBody>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          {!stock && (
            <>
              <SelectField
                label="Site"
                id="ppe-stock-site"
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                options={[
                  { value: "", label: "Select a site" },
                  ...siteOptions(sites),
                ]}
              />
              <SelectField
                label="PPE item"
                id="ppe-stock-item"
                value={itemId}
                onChange={(event) => setItemId(event.target.value)}
                options={[
                  { value: "", label: "Select an item" },
                  ...itemOptions(items),
                ]}
              />
            </>
          )}
          {stock && (
            <p className="sm:col-span-2 text-sm text-muted">
              {formatPpeItemName(stock.item)} at{" "}
              {stock.site.name ?? stock.site.code ?? "site"}
            </p>
          )}
          <TextField
            label="Quantity on hand"
            id="ppe-stock-quantity"
            type="number"
            min={0}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <TextField
            label="Minimum quantity"
            id="ppe-stock-minimum"
            type="number"
            min={0}
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
            hint="Low-stock warnings appear when the minimum is greater than zero."
          />
          <div className="sm:col-span-2">
            <TextField
              label="Reason"
              id="ppe-stock-reason"
              value={reason}
              required
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              hint="Required for every stock adjustment and recorded in the audit log."
            />
          </div>

          {error && (
            <p className="sm:col-span-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={createStock.isPending || updateStock.isPending}
            >
              {createStock.isPending || updateStock.isPending
                ? "Saving..."
                : stock
                  ? "Save adjustment"
                  : "Add stock"}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function PpeCatalogueForm({
  item,
  onDone,
  onCancel,
}: {
  item?: PpeItemSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createItem = useCreatePpeItem();
  const updateItem = useUpdatePpeItem();
  const enabled = canManagePpeCatalogue(useMe().data?.employee.ikoshRole);
  const [code, setCode] = useState(item?.code ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "HEAD_PROTECTION");
  const [size, setSize] = useState(item?.size ?? "");
  const [unit, setUnit] = useState<PpeUnit>(item?.unit ?? "EACH");
  const [description, setDescription] = useState(item?.description ?? "");
  const [error, setError] = useState("");

  if (!enabled) {
    return (
      <Card>
        <CardBody>
          <ErrorState
            title="Catalogue management is restricted"
            message="Only HSE managers and administrators may change the PPE catalogue."
          />
        </CardBody>
      </Card>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Give the catalogue item a name.");
      return;
    }

    try {
      if (item) {
        await updateItem.mutateAsync({
          id: item.id,
          input: {
            name: name.trim(),
            category,
            size: size.trim() || null,
            unit,
            description: description.trim(),
          },
        });
      } else {
        if (!code.trim()) {
          setError("Give the catalogue item a code.");
          return;
        }

        await createItem.mutateAsync({
          code: code.trim(),
          name: name.trim(),
          category,
          size: size.trim() || undefined,
          unit,
          description: description.trim() || undefined,
        });
      }

      onDone();
    } catch (caught) {
      setError(mutationMessage(caught));
    }
  }

  return (
    <Card>
      <CardHeader
        title={item ? "Edit PPE item" : "New PPE item"}
        description="Catalogue items are deactivated rather than deleted so stock and history stay intact."
      />
      <CardBody>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          {!item && (
            <TextField
              label="Code"
              id="ppe-item-code"
              value={code}
              required
              maxLength={40}
              onChange={(event) => setCode(event.target.value)}
              hint="Stable identifier, e.g. HELMET-WHITE."
            />
          )}
          <TextField
            label="Name"
            id="ppe-item-name"
            value={name}
            required
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
          <SelectField
            label="Category"
            id="ppe-item-category"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as PpeItemSummary["category"])
            }
            options={categoryOptions}
          />
          <SelectField
            label="Unit"
            id="ppe-item-unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value as PpeUnit)}
            options={unitOptions}
          />
          <TextField
            label="Size"
            id="ppe-item-size"
            value={size}
            maxLength={40}
            onChange={(event) => setSize(event.target.value)}
            hint="Optional free text, e.g. M, L or 42."
          />
          <div className="sm:col-span-2">
            <TextareaField
              label="Description"
              id="ppe-item-description"
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          {error && (
            <p className="sm:col-span-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={createItem.isPending || updateItem.isPending}
            >
              {createItem.isPending || updateItem.isPending
                ? "Saving..."
                : item
                  ? "Save item"
                  : "Create item"}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

type PpeActionMode = "RETURN" | "REPLACE" | "LOST";

export function PpeIssuanceActions({
  issuance,
  onDone,
  onCancel,
}: {
  issuance: PpeIssuanceSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const returnPpe = useReturnPpe();
  const replacePpe = useReplacePpe();
  const markLost = useMarkPpeLost();
  const [mode, setMode] = useState<PpeActionMode>("RETURN");
  const [condition, setCondition] = useState<PpeCondition>("GOOD");
  const [restock, setRestock] = useState(false);
  const [actionDate, setActionDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const restockable = isRestockableCondition(condition);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      if (mode === "RETURN") {
        await returnPpe.mutateAsync({
          id: issuance.id,
          input: {
            returnCondition: condition,
            restock: restock && restockable,
            returnedOn: dateToIso(actionDate),
            notes: notes.trim() || undefined,
          },
        });
      } else if (mode === "REPLACE") {
        await replacePpe.mutateAsync({
          id: issuance.id,
          input: {
            conditionAtIssue: condition,
            issuedOn: dateToIso(actionDate),
            notes: notes.trim() || undefined,
          },
        });
      } else {
        await markLost.mutateAsync({
          id: issuance.id,
          input: {
            lostOn: dateToIso(actionDate),
            notes: notes.trim() || undefined,
          },
        });
      }

      onDone();
    } catch (caught) {
      setError(mutationMessage(caught));
    }
  }

  return (
    <Card>
      <CardHeader
        title={`Update ${formatPpeItemName(issuance.item)}`}
        description={`Issued to ${issuance.recipient.name} at ${
          issuance.site.name ?? issuance.site.code ?? "site"
        }.`}
      />
      <CardBody>
        <div className="flex flex-wrap gap-2">
          {(["RETURN", "REPLACE", "LOST"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={buttonStyles(
                mode === value ? "primary" : "secondary",
                "sm",
              )}
            >
              {value === "RETURN"
                ? "Return"
                : value === "REPLACE"
                  ? "Replace"
                  : "Mark lost"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
          {mode !== "LOST" && (
            <SelectField
              label={
                mode === "RETURN" ? "Return condition" : "Replacement condition"
              }
              id="ppe-action-condition"
              value={condition}
              onChange={(event) =>
                setCondition(event.target.value as PpeCondition)
              }
              options={conditionOptions}
            />
          )}
          <TextField
            label={
              mode === "RETURN"
                ? "Returned on"
                : mode === "REPLACE"
                  ? "Replacement issued on"
                  : "Lost on"
            }
            id="ppe-action-date"
            type="date"
            max={todayIso()}
            value={actionDate}
            onChange={(event) => setActionDate(event.target.value)}
          />
          {mode === "RETURN" && (
            <label className="sm:col-span-2 flex items-start gap-2 text-sm text-muted">
              <input
                type="checkbox"
                className="mt-1"
                checked={restock && restockable}
                disabled={!restockable}
                onChange={(event) => setRestock(event.target.checked)}
              />
              <span>
                Return to usable stock. Only NEW, GOOD or FAIR PPE can be
                restocked.
                {!restockable && (
                  <span className="block text-xs text-amber-700">
                    This condition cannot be restocked.
                  </span>
                )}
              </span>
            </label>
          )}
          <div className="sm:col-span-2">
            <TextareaField
              label="Notes"
              id="ppe-action-notes"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {error && (
            <p className="sm:col-span-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={
                returnPpe.isPending ||
                replacePpe.isPending ||
                markLost.isPending
              }
            >
              {returnPpe.isPending || replacePpe.isPending || markLost.isPending
                ? "Saving..."
                : mode === "RETURN"
                  ? "Record return"
                  : mode === "REPLACE"
                    ? "Issue replacement"
                    : "Mark lost"}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
