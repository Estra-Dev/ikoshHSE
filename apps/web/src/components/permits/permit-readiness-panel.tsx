"use client";

import { useState, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/feedback";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import { useEntityAttachments } from "@/lib/api/attachments";
import { useRecordPermitReadiness } from "@/lib/api/permits";
import type {
  IkoshRole,
  PermitDetail,
  PermitReadiness,
  PermitReadinessAttestationInput,
  PermitReadinessEvaluation,
  PermitReadinessEvaluationState,
  PermitReadinessGasTestInput,
  PermitReadinessIsolationInput,
  PermitReadinessParticipantKind,
  PermitReadinessPersonnelInput,
  UpdatePermitReadinessInput,
} from "@/lib/api/types";
import { PARTICIPANT_ATTENDANCE_STATES } from "@/lib/api/types";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import { formatHseLabel } from "@/lib/hse-dashboard";
import {
  canRecordPermitReadiness,
  canViewPermitReadiness,
  isPermitReadinessRequirementSatisfied,
  PERMIT_READINESS_DRAFT_PREVIEW_NOTICE,
  permitReadinessStateLabel,
} from "@/lib/permit-readiness";

interface PermitReadinessPanelProps {
  permit: PermitDetail;
  role: IkoshRole | undefined;
  viewerId: string | undefined;
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseNumber(value: string): number | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitIds(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function readinessStateTone(
  state: PermitReadinessEvaluationState,
): BadgeTone {
  switch (state) {
    case "AUTOMATIC":
    case "RECORDED":
      return "green";
    case "BLOCKED":
      return "red";
    case "OUTSTANDING":
      return "amber";
    case "NOT_APPLICABLE":
    default:
      return "neutral";
  }
}

/* -------------------------------------------------------------------------- */
/* Shared capture controls                                                    */
/* -------------------------------------------------------------------------- */

function AttachmentPicker({
  permitId,
  selected,
  onChange,
  required = false,
}: {
  permitId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  required?: boolean;
}) {
  const query = useEntityAttachments("permit", permitId);
  const attachments = query.data?.attachments ?? [];

  function toggle(id: string): void {
    onChange(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Attachments {required ? "(at least one required)" : "(optional)"}
      </legend>

      {query.isLoading && (
        <p className="text-xs text-muted">Loading permit evidence...</p>
      )}

      {!query.isLoading && attachments.length === 0 && (
        <p className="text-xs text-muted">
          No permit evidence is available. Upload files in the Permit evidence
          panel first.
        </p>
      )}

      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
        {attachments.map((attachment) => (
          <label
            key={attachment.id}
            className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <input
              type="checkbox"
              checked={selected.includes(attachment.id)}
              onChange={() => toggle(attachment.id)}
              className="mt-0.5 h-4 w-4 rounded border-line text-navy-700 focus:ring-navy-600"
            />
            <span className="truncate">{attachment.originalFilename}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CaptureSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted">
          {description}
        </span>
      </summary>
      <div className="space-y-3 border-t border-line px-4 py-4">
        {children}
      </div>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                    */
/* -------------------------------------------------------------------------- */

function ReadinessPreview({
  readiness,
  evaluation,
}: {
  readiness: PermitReadiness | null;
  evaluation: PermitReadinessEvaluation | undefined;
}) {
  const requirementLabel = new Map(
    (evaluation?.requirements ?? []).map((requirement) => [
      requirement.id,
      requirement.label,
    ]),
  );

  const personnel = readiness?.personnel ?? [];
  const equipment = readiness?.equipment ?? [];
  const isolations = readiness?.isolations ?? [];
  const gasTests = readiness?.gasTests ?? [];
  const links = readiness?.links ?? null;
  const worksite = readiness?.worksiteVerification ?? null;
  const worksiteHistory = readiness?.worksiteVerificationHistory ?? [];
  const attestations = readiness?.attestations ?? [];
  const hasRecordedEvidence =
    personnel.length > 0 ||
    equipment.length > 0 ||
    isolations.length > 0 ||
    gasTests.length > 0 ||
    worksite !== null ||
    (links !== null &&
      (links.inspectionIds.length > 0 ||
        links.ppeIssuanceIds.length > 0 ||
        links.correctiveActionIds.length > 0 ||
        links.contractorIds.length > 0 ||
        links.toolboxTalkId !== null));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-800">
          Informational notice
        </p>
        <p className="mt-1 text-sm leading-6 text-amber-900">
          {PERMIT_READINESS_DRAFT_PREVIEW_NOTICE}
        </p>
      </div>

      {!evaluation ? (
        <p className="text-sm text-muted">
          The A03 preview is unavailable for this response. Captured evidence
          remains readable below.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <Badge tone="amber">DRAFT_PREVIEW</Badge>
            <span className="rounded-full bg-navy-50 px-2.5 py-0.5 ring-1 ring-inset ring-navy-100">
              A03 · revision {evaluation.policy.revision} · status{" "}
              {evaluation.policy.status}
            </span>
            <span className="rounded-full bg-navy-50 px-2.5 py-0.5 ring-1 ring-inset ring-navy-100">
              Candidate v{evaluation.policy.version}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Total", evaluation.counts.total],
              ["Satisfied", evaluation.counts.satisfied],
              ["Outstanding", evaluation.counts.outstanding],
              ["Blocked", evaluation.counts.blocked],
              ["Not applicable", evaluation.counts.notApplicable],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-line bg-navy-50/30 px-3 py-2"
              >
                <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  {label}
                </dt>
                <dd className="tabular mt-1 text-lg font-semibold text-ink">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <ul className="divide-y divide-line">
            {evaluation.requirements.map((requirement) => (
              <li
                key={requirement.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">{requirement.label}</p>
                  <p className="text-xs text-muted">
                    {formatHseLabel(requirement.type)} ·{" "}
                    {isPermitReadinessRequirementSatisfied(requirement.state)
                      ? "Satisfied"
                      : "Not satisfied"}
                  </p>
                </div>
                <Badge tone={readinessStateTone(requirement.state)} dot>
                  {permitReadinessStateLabel(requirement.state)}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="rounded-lg border border-line bg-navy-50/40 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Full A03 decision register
        </p>
        <p className="mt-1 text-sm leading-6 text-muted">
          BLOCKED — the canonical 14-item register has not been supplied, so no
          decision list is shown.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink">Recorded evidence</h3>

        {!hasRecordedEvidence ? (
          <p className="mt-2 text-sm text-muted">
            No recorded readiness evidence has been captured for this permit
            yet.
          </p>
        ) : (
          <div className="mt-2 space-y-3 text-sm text-ink">
            {personnel.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  Personnel ({personnel.length})
                </p>
                <ul className="mt-1 space-y-1">
                  {personnel.map((person, index) => (
                    <li key={`${person.name ?? "person"}-${index}`}>
                      {person.name ?? "Unnamed person"}
                      {person.role ? ` · ${person.role}` : ""}
                      {person.kind ? ` · ${formatHseLabel(person.kind)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {equipment.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  Equipment ({equipment.length})
                </p>
                <ul className="mt-1 space-y-1">
                  {equipment.map((item, index) => (
                    <li key={`${item.name ?? "equipment"}-${index}`}>
                      {item.name ?? "Unnamed equipment"}
                      {item.reference ? ` · ${item.reference}` : ""}
                      {item.condition ? ` · ${item.condition}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isolations.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  Isolations ({isolations.length})
                </p>
                <ul className="mt-1 space-y-1">
                  {isolations.map((isolation, index) => (
                    <li key={`${isolation.point}-${index}`}>
                      {isolation.point} · {isolation.method}
                      {isolation.tagNumber
                        ? ` · tag ${isolation.tagNumber}`
                        : ""}{" "}
                      · {formatUtcDateTime(isolation.recordedAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {gasTests.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  Gas tests ({gasTests.length})
                </p>
                <ul className="mt-1 space-y-1">
                  {gasTests.map((gasTest, index) => (
                    <li key={`${gasTest.area ?? "gas"}-${index}`}>
                      {gasTest.area ?? "Area not specified"}
                      {gasTest.instrument ? ` · ${gasTest.instrument}` : ""}
                      {gasTest.result ? ` · ${gasTest.result}` : ""} ·{" "}
                      {formatUtcDateTime(gasTest.recordedAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {links && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  Linked records
                </p>
                <p className="mt-1">
                  Inspections {links.inspectionIds.length} · PPE{" "}
                  {links.ppeIssuanceIds.length} · Corrective actions{" "}
                  {links.correctiveActionIds.length} · Contractors{" "}
                  {links.contractorIds.length} · Toolbox talk{" "}
                  {links.toolboxTalkId ? "linked" : "not linked"}
                </p>
              </div>
            )}

            {worksite && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  Worksite verification
                </p>
                <p className="mt-1">
                  {worksite.notes ?? "No notes recorded."}
                  {worksite.verifiedAt
                    ? ` · ${formatUtcDateTime(worksite.verifiedAt)}`
                    : ""}
                  {worksiteHistory.length > 0
                    ? ` · ${worksiteHistory.length} earlier verification${
                        worksiteHistory.length === 1 ? "" : "s"
                      } retained`
                    : ""}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {attestations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Declarations (attestations)
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            These are named declarations, not authoritative facts. They are
            shown separately from recorded evidence.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {attestations.map((attestation, index) => (
              <li key={`${attestation.requirementId}-${index}`}>
                {requirementLabel.get(attestation.requirementId) ??
                  attestation.requirementId}{" "}
                · {formatHseLabel(attestation.state)}
                {attestation.note ? ` · ${attestation.note}` : ""} ·{" "}
                {formatUtcDateTime(attestation.recordedAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Capture forms                                                              */
/* -------------------------------------------------------------------------- */

interface PersonnelRow {
  kind: PermitReadinessParticipantKind;
  employee: string;
  contractorPersonnel: string;
  contractor: string;
  name: string;
  role: string;
  notes: string;
  attendance: string;
}

function personnelRows(readiness: PermitReadiness | null): PersonnelRow[] {
  return (readiness?.personnel ?? []).map((person) => ({
    kind: person.kind ?? "EMPLOYEE",
    employee: person.employee ?? "",
    contractorPersonnel: person.contractorPersonnel ?? "",
    contractor: person.contractor ?? "",
    name: person.name ?? "",
    role: person.role ?? "",
    notes: person.notes ?? "",
    attendance: person.attendance ?? "",
  }));
}

function toPersonnelInput(row: PersonnelRow): PermitReadinessPersonnelInput {
  return {
    kind: row.kind,
    name: row.name.trim(),
    ...(row.kind === "EMPLOYEE"
      ? {
          ...(optional(row.employee) ? { employee: optional(row.employee) } : {}),
        }
      : {
          ...(optional(row.contractorPersonnel)
            ? { contractorPersonnel: optional(row.contractorPersonnel) }
            : {}),
          ...(optional(row.contractor)
            ? { contractor: optional(row.contractor) }
            : {}),
        }),
    ...(optional(row.role) ? { role: optional(row.role) } : {}),
    ...(optional(row.notes) ? { notes: optional(row.notes) } : {}),
    ...(optional(row.attendance) ? { attendance: optional(row.attendance) } : {}),
  };
}

function PersonnelForm({
  readiness,
  onSubmit,
  isPending,
}: {
  readiness: PermitReadiness | null;
  onSubmit: (input: UpdatePermitReadinessInput) => Promise<boolean>;
  isPending: boolean;
}) {
  const [rows, setRows] = useState<PersonnelRow[]>(() =>
    personnelRows(readiness),
  );

  function update(index: number, patch: Partial<PersonnelRow>): void {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  return (
    <CaptureSection
      title="Personnel"
      description="Replaces the draft personnel list. Names and employee or contractor references are validated by the API."
    >
      {rows.length === 0 && (
        <p className="text-sm text-muted">No personnel rows recorded.</p>
      )}

      {rows.map((row, index) => (
        <div
          key={index}
          className="space-y-2 rounded-lg border border-line bg-navy-50/20 p-3"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <SelectField
              label="Kind"
              id={`readiness-personnel-kind-${index}`}
              value={row.kind}
              onChange={(event) =>
                update(index, {
                  kind: event.target.value as PermitReadinessParticipantKind,
                })
              }
              options={[
                { value: "EMPLOYEE", label: "Employee" },
                { value: "CONTRACTOR", label: "Contractor" },
              ]}
            />
            <TextField
              label="Name"
              id={`readiness-personnel-name-${index}`}
              value={row.name}
              onChange={(event) => update(index, { name: event.target.value })}
              maxLength={200}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {row.kind === "EMPLOYEE" ? (
              <TextField
                label="Employee ID"
                id={`readiness-personnel-employee-${index}`}
                value={row.employee}
                onChange={(event) =>
                  update(index, { employee: event.target.value })
                }
                hint="Required by the API for employee personnel."
              />
            ) : (
              <>
                <TextField
                  label="Contractor personnel ID"
                  id={`readiness-personnel-contractor-person-${index}`}
                  value={row.contractorPersonnel}
                  onChange={(event) =>
                    update(index, { contractorPersonnel: event.target.value })
                  }
                  hint="Required by the API for contractor personnel."
                />
                <TextField
                  label="Contractor ID"
                  id={`readiness-personnel-contractor-${index}`}
                  value={row.contractor}
                  onChange={(event) =>
                    update(index, { contractor: event.target.value })
                  }
                />
              </>
            )}
            <TextField
              label="Role"
              id={`readiness-personnel-role-${index}`}
              value={row.role}
              onChange={(event) => update(index, { role: event.target.value })}
              maxLength={100}
            />
          </div>

          <SelectField
            label="Attendance"
            id={`readiness-personnel-attendance-${index}`}
            value={row.attendance}
            onChange={(event) =>
              update(index, { attendance: event.target.value })
            }
            options={[
              { value: "", label: "Not recorded" },
              ...PARTICIPANT_ATTENDANCE_STATES.map((state) => ({
                value: state,
                label: formatHseLabel(state),
              })),
            ]}
          />

          <TextareaField
            label="Notes"
            id={`readiness-personnel-notes-${index}`}
            value={row.notes}
            onChange={(event) => update(index, { notes: event.target.value })}
            rows={2}
            maxLength={500}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setRows((current) =>
                current.filter((_, rowIndex) => rowIndex !== index),
              )
            }
          >
            Remove row
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                kind: "EMPLOYEE",
                employee: "",
                contractorPersonnel: "",
                contractor: "",
                name: "",
                role: "",
                notes: "",
                attendance: "",
              },
            ])
          }
        >
          Add personnel row
        </Button>
        <Button
          size="sm"
          isLoading={isPending}
          onClick={() => void onSubmit({ personnel: rows.map(toPersonnelInput) })}
        >
          Save personnel
        </Button>
      </div>
    </CaptureSection>
  );
}

interface EquipmentRow {
  name: string;
  reference: string;
  inspection: string;
  condition: string;
}

function EquipmentForm({
  readiness,
  onSubmit,
  isPending,
}: {
  readiness: PermitReadiness | null;
  onSubmit: (input: UpdatePermitReadinessInput) => Promise<boolean>;
  isPending: boolean;
}) {
  const [rows, setRows] = useState<EquipmentRow[]>(() =>
    (readiness?.equipment ?? []).map((item) => ({
      name: item.name ?? "",
      reference: item.reference ?? "",
      inspection: item.inspection ?? "",
      condition: item.condition ?? "",
    })),
  );

  function update(index: number, patch: Partial<EquipmentRow>): void {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  return (
    <CaptureSection
      title="Equipment"
      description="Replaces the draft equipment list. Equipment names are required by the API."
    >
      {rows.length === 0 && (
        <p className="text-sm text-muted">No equipment rows recorded.</p>
      )}

      {rows.map((row, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-lg border border-line bg-navy-50/20 p-3 sm:grid-cols-2"
        >
          <TextField
            label="Name"
            id={`readiness-equipment-name-${index}`}
            value={row.name}
            onChange={(event) => update(index, { name: event.target.value })}
            maxLength={200}
          />
          <TextField
            label="Reference"
            id={`readiness-equipment-reference-${index}`}
            value={row.reference}
            onChange={(event) => update(index, { reference: event.target.value })}
            maxLength={100}
          />
          <TextField
            label="Inspection ID"
            id={`readiness-equipment-inspection-${index}`}
            value={row.inspection}
            onChange={(event) => update(index, { inspection: event.target.value })}
          />
          <TextField
            label="Condition"
            id={`readiness-equipment-condition-${index}`}
            value={row.condition}
            onChange={(event) => update(index, { condition: event.target.value })}
            maxLength={200}
          />
          <div className="sm:col-span-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setRows((current) =>
                  current.filter((_, rowIndex) => rowIndex !== index),
                )
              }
            >
              Remove row
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setRows((current) => [
              ...current,
              { name: "", reference: "", inspection: "", condition: "" },
            ])
          }
        >
          Add equipment row
        </Button>
        <Button
          size="sm"
          isLoading={isPending}
          onClick={() =>
            void onSubmit({
              equipment: rows.map((row) => ({
                name: row.name.trim(),
                ...(optional(row.reference)
                  ? { reference: optional(row.reference) }
                  : {}),
                ...(optional(row.inspection)
                  ? { inspection: optional(row.inspection) }
                  : {}),
                ...(optional(row.condition)
                  ? { condition: optional(row.condition) }
                  : {}),
              })),
            })
          }
        >
          Save equipment
        </Button>
      </div>
    </CaptureSection>
  );
}

function IsolationForm({
  permitId,
  onSubmit,
  isPending,
}: {
  permitId: string;
  onSubmit: (input: UpdatePermitReadinessInput) => Promise<boolean>;
  isPending: boolean;
}) {
  const [point, setPoint] = useState("");
  const [method, setMethod] = useState("");
  const [tagNumber, setTagNumber] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  function handleSubmit(): void {
    setError("");

    if (!point.trim() || !method.trim()) {
      setError("Isolation point and method are required.");
      return;
    }

    if (attachmentIds.length === 0) {
      setError("At least one attachment is required for an isolation record.");
      return;
    }

    const input: PermitReadinessIsolationInput = {
      point: point.trim(),
      method: method.trim(),
      ...(optional(tagNumber) ? { tagNumber: optional(tagNumber) } : {}),
      attachmentIds,
    };

    void onSubmit({ isolations: [input] }).then((saved) => {
      if (!saved) return;
      setPoint("");
      setMethod("");
      setTagNumber("");
      setAttachmentIds([]);
    });
  }

  return (
    <CaptureSection
      title="Isolation record"
      description="Appends one isolation event. The actor and timestamp are stamped by the server."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField
          label="Point"
          id="readiness-isolation-point"
          value={point}
          onChange={(event) => setPoint(event.target.value)}
          maxLength={200}
        />
        <TextField
          label="Method"
          id="readiness-isolation-method"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          maxLength={200}
        />
        <TextField
          label="Tag number"
          id="readiness-isolation-tag"
          value={tagNumber}
          onChange={(event) => setTagNumber(event.target.value)}
          maxLength={50}
        />
      </div>
      <AttachmentPicker
        permitId={permitId}
        selected={attachmentIds}
        onChange={setAttachmentIds}
        required
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button size="sm" isLoading={isPending} onClick={handleSubmit}>
        Append isolation record
      </Button>
    </CaptureSection>
  );
}

function GasTestForm({
  permitId,
  onSubmit,
  isPending,
}: {
  permitId: string;
  onSubmit: (input: UpdatePermitReadinessInput) => Promise<boolean>;
  isPending: boolean;
}) {
  const [area, setArea] = useState("");
  const [instrument, setInstrument] = useState("");
  const [oxygenPct, setOxygenPct] = useState("");
  const [lelPct, setLelPct] = useState("");
  const [h2sPpm, setH2sPpm] = useState("");
  const [coPpm, setCoPpm] = useState("");
  const [result, setResult] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  function handleSubmit(): void {
    setError("");

    if (attachmentIds.length === 0) {
      setError("At least one attachment is required for a gas test record.");
      return;
    }

    const input: PermitReadinessGasTestInput = {
      ...(optional(area) ? { area: optional(area) } : {}),
      ...(optional(instrument) ? { instrument: optional(instrument) } : {}),
      ...(parseNumber(oxygenPct) !== undefined
        ? { oxygenPct: parseNumber(oxygenPct) }
        : {}),
      ...(parseNumber(lelPct) !== undefined
        ? { lelPct: parseNumber(lelPct) }
        : {}),
      ...(parseNumber(h2sPpm) !== undefined
        ? { h2sPpm: parseNumber(h2sPpm) }
        : {}),
      ...(parseNumber(coPpm) !== undefined
        ? { coPpm: parseNumber(coPpm) }
        : {}),
      ...(optional(result) ? { result: optional(result) } : {}),
      attachmentIds,
    };

    void onSubmit({ gasTests: [input] }).then((saved) => {
      if (!saved) return;
      setArea("");
      setInstrument("");
      setOxygenPct("");
      setLelPct("");
      setH2sPpm("");
      setCoPpm("");
      setResult("");
      setAttachmentIds([]);
    });
  }

  return (
    <CaptureSection
      title="Gas test record"
      description="Appends one gas test. Readings are retained as recorded evidence and the actor is server-stamped."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField
          label="Area"
          id="readiness-gas-area"
          value={area}
          onChange={(event) => setArea(event.target.value)}
          maxLength={200}
        />
        <TextField
          label="Instrument"
          id="readiness-gas-instrument"
          value={instrument}
          onChange={(event) => setInstrument(event.target.value)}
          maxLength={200}
        />
        <TextField
          label="Oxygen %"
          id="readiness-gas-oxygen"
          type="number"
          min="0"
          max="100"
          step="any"
          value={oxygenPct}
          onChange={(event) => setOxygenPct(event.target.value)}
        />
        <TextField
          label="LEL %"
          id="readiness-gas-lel"
          type="number"
          min="0"
          max="100"
          step="any"
          value={lelPct}
          onChange={(event) => setLelPct(event.target.value)}
        />
        <TextField
          label="H2S ppm"
          id="readiness-gas-h2s"
          type="number"
          min="0"
          step="any"
          value={h2sPpm}
          onChange={(event) => setH2sPpm(event.target.value)}
        />
        <TextField
          label="CO ppm"
          id="readiness-gas-co"
          type="number"
          min="0"
          step="any"
          value={coPpm}
          onChange={(event) => setCoPpm(event.target.value)}
        />
        <TextField
          label="Result"
          id="readiness-gas-result"
          value={result}
          onChange={(event) => setResult(event.target.value)}
          maxLength={200}
        />
      </div>
      <AttachmentPicker
        permitId={permitId}
        selected={attachmentIds}
        onChange={setAttachmentIds}
        required
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button size="sm" isLoading={isPending} onClick={handleSubmit}>
        Append gas test
      </Button>
    </CaptureSection>
  );
}

function LinksForm({
  readiness,
  onSubmit,
  isPending,
}: {
  readiness: PermitReadiness | null;
  onSubmit: (input: UpdatePermitReadinessInput) => Promise<boolean>;
  isPending: boolean;
}) {
  const [inspectionIds, setInspectionIds] = useState(
    () => (readiness?.links?.inspectionIds ?? []).join(", "),
  );
  const [ppeIssuanceIds, setPpeIssuanceIds] = useState(
    () => (readiness?.links?.ppeIssuanceIds ?? []).join(", "),
  );
  const [correctiveActionIds, setCorrectiveActionIds] = useState(
    () => (readiness?.links?.correctiveActionIds ?? []).join(", "),
  );
  const [contractorIds, setContractorIds] = useState(
    () => (readiness?.links?.contractorIds ?? []).join(", "),
  );
  const [toolboxTalkId, setToolboxTalkId] = useState(
    () => readiness?.links?.toolboxTalkId ?? "",
  );

  return (
    <CaptureSection
      title="Linked records"
      description="Replaces draft links. Enter comma- or space-separated record IDs; the API validates every reference."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField
          label="Inspection IDs"
          id="readiness-links-inspections"
          value={inspectionIds}
          onChange={(event) => setInspectionIds(event.target.value)}
        />
        <TextField
          label="PPE issuance IDs"
          id="readiness-links-ppe"
          value={ppeIssuanceIds}
          onChange={(event) => setPpeIssuanceIds(event.target.value)}
        />
        <TextField
          label="Corrective action IDs"
          id="readiness-links-corrective-actions"
          value={correctiveActionIds}
          onChange={(event) => setCorrectiveActionIds(event.target.value)}
        />
        <TextField
          label="Contractor IDs"
          id="readiness-links-contractors"
          value={contractorIds}
          onChange={(event) => setContractorIds(event.target.value)}
        />
        <TextField
          label="Toolbox talk ID"
          id="readiness-links-toolbox-talk"
          value={toolboxTalkId}
          onChange={(event) => setToolboxTalkId(event.target.value)}
        />
      </div>
      <Button
        size="sm"
        isLoading={isPending}
        onClick={() =>
          void onSubmit({
            links: {
              inspectionIds: splitIds(inspectionIds),
              ppeIssuanceIds: splitIds(ppeIssuanceIds),
              correctiveActionIds: splitIds(correctiveActionIds),
              contractorIds: splitIds(contractorIds),
              toolboxTalkId: optional(toolboxTalkId) ?? null,
            },
          })
        }
      >
        Save links
      </Button>
    </CaptureSection>
  );
}

function WorksiteVerificationForm({
  permitId,
  onSubmit,
  isPending,
}: {
  permitId: string;
  onSubmit: (input: UpdatePermitReadinessInput) => Promise<boolean>;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);

  return (
    <CaptureSection
      title="Worksite verification"
      description="Records a new verification. Earlier verifications remain in the server-side history."
    >
      <TextareaField
        label="Notes"
        id="readiness-worksite-notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={3}
        maxLength={500}
      />
      <AttachmentPicker
        permitId={permitId}
        selected={attachmentIds}
        onChange={setAttachmentIds}
      />
      <Button
        size="sm"
        isLoading={isPending}
        onClick={() =>
          void onSubmit({
            worksiteVerification: {
              ...(optional(notes) ? { notes: optional(notes) } : {}),
              attachmentIds,
            },
          }).then((saved) => {
            if (!saved) return;
            setNotes("");
            setAttachmentIds([]);
          })
        }
      >
        Record verification
      </Button>
    </CaptureSection>
  );
}

function AttestationForm({
  permitId,
  evaluation,
  onSubmit,
  isPending,
}: {
  permitId: string;
  evaluation: PermitReadinessEvaluation | undefined;
  onSubmit: (input: UpdatePermitReadinessInput) => Promise<boolean>;
  isPending: boolean;
}) {
  const requirements = evaluation?.requirements ?? [];
  const [requirementId, setRequirementId] = useState(
    () => requirements[0]?.id ?? "",
  );
  const [state, setState] = useState<"SATISFIED" | "NOT_APPLICABLE">(
    "SATISFIED",
  );
  const [note, setNote] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  if (requirements.length === 0) {
    return (
      <CaptureSection
        title="Attestation"
        description="Attestations require the A03 preview requirement list."
      >
        <p className="text-sm text-muted">
          The requirement list is unavailable, so no attestation can be
          recorded from this panel.
        </p>
      </CaptureSection>
    );
  }

  // The evaluation can arrive after the first render, so fall back to the
  // first requirement whenever the stored id is no longer in the list.
  const effectiveRequirementId = requirements.some(
    (requirement) => requirement.id === requirementId,
  )
    ? requirementId
    : (requirements[0]?.id ?? "");

  function handleSubmit(): void {
    setError("");

    if (!effectiveRequirementId) {
      setError("Choose a requirement to attest.");
      return;
    }

    const input: PermitReadinessAttestationInput = {
      requirementId: effectiveRequirementId,
      state,
      ...(optional(note) ? { note: optional(note) } : {}),
      ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
    };

    void onSubmit({ attestations: [input] }).then((saved) => {
      if (!saved) return;
      setNote("");
      setAttachmentIds([]);
    });
  }

  return (
    <CaptureSection
      title="Attestation"
      description="Appends a declaration for one requirement. A declaration never overrides a blocked or automatic fact."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <SelectField
          label="Requirement"
          id="readiness-attestation-requirement"
          value={effectiveRequirementId}
          onChange={(event) => setRequirementId(event.target.value)}
          options={requirements.map((requirement) => ({
            value: requirement.id,
            label: requirement.label,
          }))}
        />
        <SelectField
          label="State"
          id="readiness-attestation-state"
          value={state}
          onChange={(event) =>
            setState(event.target.value as "SATISFIED" | "NOT_APPLICABLE")
          }
          options={[
            { value: "SATISFIED", label: "Satisfied" },
            { value: "NOT_APPLICABLE", label: "Not applicable" },
          ]}
        />
      </div>
      <TextareaField
        label="Note"
        id="readiness-attestation-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        maxLength={500}
      />
      <AttachmentPicker
        permitId={permitId}
        selected={attachmentIds}
        onChange={setAttachmentIds}
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button size="sm" isLoading={isPending} onClick={handleSubmit}>
        Append attestation
      </Button>
    </CaptureSection>
  );
}

function ReadinessCapture({
  permit,
  evaluation,
}: {
  permit: PermitDetail;
  evaluation: PermitReadinessEvaluation | undefined;
}) {
  const recordReadiness = useRecordPermitReadiness(permit.id);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(
    input: UpdatePermitReadinessInput,
    label: string,
  ): Promise<boolean> {
    setError("");
    setMessage("");

    try {
      await recordReadiness.mutateAsync(input);
      setMessage(`${label} saved. The preview has been refreshed.`);
      return true;
    } catch (recordError) {
      setError(
        recordError instanceof Error
          ? recordError.message
          : "The readiness evidence could not be saved.",
      );
      return false;
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
        Readiness capture is available only while the permit is DRAFT. Recorded
        events are append-only; the server keeps their actor and timestamp.
      </div>

      <PersonnelForm
        readiness={permit.readiness}
        onSubmit={(input) => submit(input, "Personnel")}
        isPending={recordReadiness.isPending}
      />
      <EquipmentForm
        readiness={permit.readiness}
        onSubmit={(input) => submit(input, "Equipment")}
        isPending={recordReadiness.isPending}
      />
      <IsolationForm
        permitId={permit.id}
        onSubmit={(input) => submit(input, "Isolation record")}
        isPending={recordReadiness.isPending}
      />
      <GasTestForm
        permitId={permit.id}
        onSubmit={(input) => submit(input, "Gas test record")}
        isPending={recordReadiness.isPending}
      />
      <LinksForm
        readiness={permit.readiness}
        onSubmit={(input) => submit(input, "Linked records")}
        isPending={recordReadiness.isPending}
      />
      <WorksiteVerificationForm
        permitId={permit.id}
        onSubmit={(input) => submit(input, "Worksite verification")}
        isPending={recordReadiness.isPending}
      />
      <AttestationForm
        permitId={permit.id}
        evaluation={evaluation}
        onSubmit={(input) => submit(input, "Attestation")}
        isPending={recordReadiness.isPending}
      />

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
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Read-only A03 preview plus DRAFT-only evidence capture. The preview never
 * gates lifecycle actions; all enforcement and attribution stay server-side.
 */
export function PermitReadinessPanel({
  permit,
  role,
  viewerId,
}: PermitReadinessPanelProps) {
  if (!canViewPermitReadiness(role)) {
    return null;
  }

  const canRecord = canRecordPermitReadiness(role, viewerId, permit);

  return (
    <Card>
      <CardHeader
        title="Readiness — A03 draft preview"
        description="Information only. Captured evidence is visible with the permit, but the API does not gate lifecycle actions on it."
      />
      <CardBody className="space-y-5">
        <ReadinessPreview
          readiness={permit.readiness}
          evaluation={permit.readinessEvaluation}
        />

        {canRecord ? (
          <ReadinessCapture
            permit={permit}
            evaluation={permit.readinessEvaluation}
          />
        ) : (
          <div className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {permit.status === "DRAFT"
              ? "Only the creator, responsible person or HSE management can record readiness evidence on this draft."
              : "Readiness evidence is read-only after the permit leaves DRAFT."}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
