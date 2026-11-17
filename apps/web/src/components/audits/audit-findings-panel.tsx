"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import { ArrowRightIcon } from "@/components/icons";
import { useCorrectiveActionAssignees } from "@/lib/api/corrective-actions";
import {
  useAddAuditFinding,
  useLinkAuditCorrectiveAction,
} from "@/lib/api/audits";
import type {
  AuditFinding,
  AuditFindingSeverity,
  HseAuditSummary,
  IkoshRole,
} from "@/lib/api/types";
import { correctiveActionDetailHref } from "@/lib/corrective-actions";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import { formatHseLabel } from "@/lib/hse-dashboard";
import {
  canConductAudit,
  canRaiseAuditCorrectiveAction,
} from "@/lib/permissions";
import { AuditSeverityBadge } from "./audit-badges";

interface AuditFindingsPanelProps {
  audit: HseAuditSummary;
  role: IkoshRole | undefined;
  viewerId: string | undefined;
}

/**
 * Findings recorded during an audit, plus the follow-up action raised from each
 * one. Linking is atomic on the server: the CAPA, the finding backlink and both
 * audit rows are written together.
 */
export function AuditFindingsPanel({
  audit,
  role,
  viewerId,
}: AuditFindingsPanelProps) {
  const canRecord = canConductAudit(role, viewerId, audit);
  const canRaise = canRaiseAuditCorrectiveAction(role, viewerId, audit);

  return (
    <Card>
      <CardHeader
        title="Findings"
        description="Issues observed during the audit, their severity and the corrective actions raised to close them."
        action={
          <Badge tone="neutral">
            {audit.findings.length} finding
            {audit.findings.length === 1 ? "" : "s"}
          </Badge>
        }
      />
      <CardBody className="space-y-5">
        {audit.findings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-navy-200 px-4 py-6 text-center text-sm text-muted">
            No findings have been recorded for this audit.
          </p>
        ) : (
          <ul className="space-y-4">
            {audit.findings.map((finding) => (
              <FindingItem
                key={finding.id}
                auditId={audit.id}
                finding={finding}
                canRaise={canRaise}
              />
            ))}
          </ul>
        )}

        {canRecord && <AddFindingForm auditId={audit.id} />}

        {!canRecord &&
          audit.status !== "COMPLETED" &&
          audit.status !== "CANCELLED" && (
            <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-xs leading-5 text-muted">
              Only an assigned auditor or HSE management can record findings
              while an audit is planned or in progress.
            </p>
          )}
      </CardBody>
    </Card>
  );
}

function AddFindingForm({ auditId }: { auditId: string }) {
  const addFinding = useAddAuditFinding();
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<AuditFindingSeverity>("MEDIUM");
  const [recommendation, setRecommendation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fieldPrefix = "audit-finding";

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!description.trim()) {
      setError("Describe the finding.");
      return;
    }

    try {
      await addFinding.mutateAsync({
        id: auditId,
        input: {
          description: description.trim(),
          severity,
          ...(recommendation.trim()
            ? { recommendation: recommendation.trim() }
            : {}),
        },
      });
      setDescription("");
      setRecommendation("");
      setSeverity("MEDIUM");
      setMessage("Finding recorded.");
    } catch (findingError) {
      setError(
        findingError instanceof Error
          ? findingError.message
          : "The finding could not be recorded.",
      );
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-4 rounded-lg border border-line bg-navy-50/30 p-4"
    >
      <div>
        <p className="text-sm font-semibold text-ink">Record a finding</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Findings capture what was observed. A corrective action can be raised
          from each finding.
        </p>
      </div>

      <TextareaField
        label="Finding"
        id={`${fieldPrefix}-description`}
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
          setError("");
        }}
        rows={3}
        maxLength={5000}
        placeholder="What was observed and where?"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Severity"
          id={`${fieldPrefix}-severity`}
          value={severity}
          onChange={(event) =>
            setSeverity(event.target.value as AuditFindingSeverity)
          }
          options={[
            { value: "LOW", label: "Low" },
            { value: "MEDIUM", label: "Medium" },
            { value: "HIGH", label: "High" },
            { value: "CRITICAL", label: "Critical" },
          ]}
        />

        <TextField
          label="Recommendation (optional)"
          id={`${fieldPrefix}-recommendation`}
          value={recommendation}
          onChange={(event) => setRecommendation(event.target.value)}
          maxLength={2000}
          placeholder="What should be done?"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" isLoading={addFinding.isPending}>
          Add finding
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

function FindingItem({
  auditId,
  finding,
  canRaise,
}: {
  auditId: string;
  finding: AuditFinding;
  canRaise: boolean;
}) {
  const [linking, setLinking] = useState(false);

  return (
    <li className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <AuditSeverityBadge severity={finding.severity} />
        <span className="text-xs text-muted">
          Recorded {formatUtcDateTime(finding.createdAt)}
        </span>
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-ink">
        {finding.description}
      </p>

      {finding.recommendation && (
        <div className="mt-3 rounded-lg bg-navy-50/50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Recommendation
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
            {finding.recommendation}
          </p>
        </div>
      )}

      {finding.correctiveAction ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={correctiveActionDetailHref(finding.correctiveAction.id)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
          >
            {finding.correctiveAction.description ??
              "View linked corrective action"}
            <ArrowRightIcon size={14} />
          </Link>
          {finding.correctiveAction.status && (
            <Badge tone="neutral">
              {formatHseLabel(finding.correctiveAction.status)}
            </Badge>
          )}
        </div>
      ) : canRaise ? (
        linking ? (
          <LinkActionForm
            auditId={auditId}
            finding={finding}
            onDone={() => setLinking(false)}
            onCancel={() => setLinking(false)}
          />
        ) : (
          <div className="mt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLinking(true)}
            >
              Raise corrective action
            </Button>
          </div>
        )
      ) : (
        <p className="mt-3 text-xs text-muted">
          No corrective action has been raised for this finding.
        </p>
      )}
    </li>
  );
}

function LinkActionForm({
  auditId,
  finding,
  onDone,
  onCancel,
}: {
  auditId: string;
  finding: AuditFinding;
  onDone: () => void;
  onCancel: () => void;
}) {
  const assignees = useCorrectiveActionAssignees();
  const linkAction = useLinkAuditCorrectiveAction();
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");

    if (!assignedTo) {
      setError("Assign the corrective action to an HSE user.");
      return;
    }

    if (!dueDate) {
      setError("Choose a due date.");
      return;
    }

    try {
      await linkAction.mutateAsync({
        auditId,
        findingId: finding.id,
        input: {
          assignedTo,
          dueDate: new Date(`${dueDate}T00:00:00.000Z`).toISOString(),
          ...(description.trim()
            ? { description: description.trim() }
            : {}),
        },
      });
      onDone();
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "The corrective action could not be created.",
      );
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="mt-3 space-y-3 rounded-lg border border-line bg-navy-50/30 p-3"
    >
      <p className="text-sm font-semibold text-ink">
        Raise a corrective action
      </p>
      <p className="text-xs leading-5 text-muted">
        The action inherits this audit&apos;s project and site. Its description
        defaults to the finding text.
      </p>

      <TextareaField
        label="Action description (optional)"
        id={`audit-finding-action-description-${finding.id}`}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
        maxLength={5000}
        placeholder={finding.description}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Assignee"
          id={`audit-finding-action-assignee-${finding.id}`}
          value={assignedTo}
          onChange={(event) => {
            setAssignedTo(event.target.value);
            setError("");
          }}
          options={[
            { value: "", label: "Choose an HSE user" },
            ...(assignees.data?.assignees ?? []).map((assignee) => ({
              value: assignee.id,
              label:
                `${assignee.firstName} ${assignee.lastName}`.trim() ||
                assignee.id,
            })),
          ]}
          disabled={assignees.isLoading}
        />

        <TextField
          label="Due date"
          id={`audit-finding-action-due-${finding.id}`}
          type="date"
          value={dueDate}
          onChange={(event) => {
            setDueDate(event.target.value);
            setError("");
          }}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" isLoading={linkAction.isPending}>
          Create action
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={linkAction.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
