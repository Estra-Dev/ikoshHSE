"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/fields";
import {
  useAddAuditChecklistItem,
  useUpdateAuditChecklistItem,
} from "@/lib/api/audits";
import type {
  AuditChecklistItem,
  AuditChecklistResult,
  HseAuditSummary,
} from "@/lib/api/types";
import { auditChecklistProgress } from "@/lib/audits";
import { AuditChecklistResultBadge } from "./audit-badges";

interface AuditChecklistPanelProps {
  audit: HseAuditSummary;
  canConduct: boolean;
}

/**
 * Checklist questions and their recorded outcomes. Results are editable only
 * while an assigned auditor or HSE management is conducting the audit.
 */
export function AuditChecklistPanel({
  audit,
  canConduct,
}: AuditChecklistPanelProps) {
  const progress = auditChecklistProgress(audit.checklist);

  return (
    <Card>
      <CardHeader
        title="Checklist"
        description="Questions prepared for this audit and the compliance outcome recorded for each."
        action={
          <Badge tone="neutral">
            {progress.total === 0
              ? "No questions"
              : `${progress.assessed}/${progress.total} assessed`}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        {audit.checklist.length === 0 ? (
          <p className="rounded-lg border border-dashed border-navy-200 px-4 py-6 text-center text-sm text-muted">
            No checklist questions have been added to this audit.
          </p>
        ) : (
          <ul className="space-y-3">
            {audit.checklist.map((item, index) => (
              <ChecklistItemRow
                key={`${item.id}:${item.result}:${item.notes}`}
                auditId={audit.id}
                item={item}
                index={index}
                canConduct={canConduct}
              />
            ))}
          </ul>
        )}

        {canConduct && <AddChecklistItemForm auditId={audit.id} />}
      </CardBody>
    </Card>
  );
}

function ChecklistItemRow({
  auditId,
  item,
  index,
  canConduct,
}: {
  auditId: string;
  item: AuditChecklistItem;
  index: number;
  canConduct: boolean;
}) {
  const updateItem = useUpdateAuditChecklistItem();
  const [result, setResult] = useState<AuditChecklistResult>(item.result);
  const [notes, setNotes] = useState(item.notes);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSave(): Promise<void> {
    setError("");
    setMessage("");

    try {
      await updateItem.mutateAsync({
        id: auditId,
        itemId: item.id,
        input: { result, notes: notes.trim() },
      });
      setMessage("Checklist result saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The checklist result could not be saved.",
      );
    }
  }

  return (
    <li className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Question {index + 1}
          </p>
          <p className="mt-1 break-words text-sm font-medium text-ink">
            {item.item}
          </p>
        </div>
        <AuditChecklistResultBadge result={item.result} />
      </div>

      {item.notes && (
        <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-navy-50/50 px-3 py-2 text-sm leading-6 text-ink">
          {item.notes}
        </p>
      )}

      {canConduct && (
        <div className="mt-4 space-y-3 rounded-lg border border-line bg-navy-50/20 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Result"
              id={`audit-checklist-result-${item.id}`}
              value={result}
              onChange={(event) => {
                setResult(event.target.value as AuditChecklistResult);
                setError("");
                setMessage("");
              }}
              options={[
                { value: "PENDING", label: "Pending" },
                { value: "COMPLIANT", label: "Compliant" },
                { value: "NON_COMPLIANT", label: "Non-compliant" },
                { value: "NOT_APPLICABLE", label: "Not applicable" },
              ]}
            />

            <TextField
              label="Notes (optional)"
              id={`audit-checklist-notes-${item.id}`}
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setError("");
                setMessage("");
              }}
              maxLength={2000}
              placeholder="Evidence or context for the result"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              isLoading={updateItem.isPending}
              disabled={result === item.result && notes.trim() === item.notes}
            >
              Save result
            </Button>
            {message && (
              <p role="status" className="text-sm text-emerald-700">
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function AddChecklistItemForm({ auditId }: { auditId: string }) {
  const addItem = useAddAuditChecklistItem();
  const [item, setItem] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!item.trim()) {
      setError("Enter a checklist question.");
      return;
    }

    try {
      await addItem.mutateAsync({
        id: auditId,
        input: {
          item: item.trim(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      setItem("");
      setNotes("");
      setMessage("Checklist question added.");
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "The checklist question could not be added.",
      );
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3 rounded-lg border border-line bg-navy-50/30 p-4"
    >
      <div>
        <p className="text-sm font-semibold text-ink">Add checklist question</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Questions added while the audit is open start as pending.
        </p>
      </div>

      <TextField
        label="Question"
        id="audit-new-checklist-item"
        value={item}
        onChange={(event) => {
          setItem(event.target.value);
          setError("");
        }}
        maxLength={1000}
        placeholder="e.g. Are emergency exits unobstructed?"
      />

      <TextField
        label="Guidance notes (optional)"
        id="audit-new-checklist-notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        maxLength={2000}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" isLoading={addItem.isPending}>
          Add question
        </Button>
        {message && (
          <p role="status" className="text-sm text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
