"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Button, ErrorState, Spinner } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { useMe } from "@/lib/api/employees";
import {
  useManagementOfChange,
  useManagementOfChangeHistory,
  useUpdateManagementOfChangeAssessment,
  type ManagementOfChangeAssessmentInput,
  type ManagementOfChangeDetail,
  type ManagementOfChangeHistoryEntry,
} from "@/lib/api/management-of-change";
import {
  canAssessManagementOfChange,
  canEditManagementOfChangeAssessment,
  canViewManagementOfChange,
} from "@/lib/permissions";
import {
  MANAGEMENT_OF_CHANGE_STATUS_LABELS,
  MANAGEMENT_OF_CHANGE_WORKFLOW,
  ManagementOfChangeApprovalNotice,
  ManagementOfChangeStatusBadge,
} from "./management-of-change-badges";
import { ManagementOfChangeWorkflowActions } from "./management-of-change-workflow-actions";

const assessmentFields: {
  name: keyof ManagementOfChangeAssessmentInput;
  label: string;
  description: string;
}[] = [
  {
    name: "qhseRisks",
    label: "QHSE risks",
    description:
      "Identify health, safety and quality risks arising from the proposed change.",
  },
  {
    name: "environmentalAspects",
    label: "Environmental aspects",
    description:
      "Describe environmental impacts, waste, emissions, spills and resource considerations.",
  },
  {
    name: "legalAndClientObligations",
    label: "Legal and client obligations",
    description:
      "Identify applicable legal, regulatory, contractual and client requirements for verification.",
  },
  {
    name: "competenceRequirements",
    label: "Competence requirements",
    description:
      "Identify required competence, training, induction, authorization and supervision.",
  },
  {
    name: "procedureChanges",
    label: "Procedure and document changes",
    description:
      "Identify affected procedures, risk assessments, work instructions, permits and controlled documents.",
  },
  {
    name: "emergencyArrangements",
    label: "Emergency arrangements",
    description:
      "Assess emergency response, communications, first aid, rescue and business continuity implications.",
  },
  {
    name: "interfaces",
    label: "Interfaces and simultaneous operations",
    description:
      "Identify contractor interfaces, affected teams, adjacent operations and SIMOPS considerations.",
  },
];

const HISTORY_ACTION_LABELS: Record<string, string> = {
  "management_of_change.created": "Change request created",
  "management_of_change.assessment_updated": "Impact assessment updated",
  "management_of_change.submitted": "Change request submitted",
  "management_of_change.technical_approved":
    "Technical/HSE approval recorded",
  "management_of_change.technical_rejected":
    "Technical/HSE approval rejected",
  "management_of_change.management_approved":
    "Management approval recorded",
  "management_of_change.management_rejected":
    "Management approval rejected",
  "management_of_change.implementation_updated":
    "Implementation plan updated",
  "management_of_change.verification_updated": "Verification recorded",
  "management_of_change.closed": "Change request closed",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not specified";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not specified" : date.toLocaleString();
}

function personName(
  person:
    | {
        firstName?: string;
        lastName?: string;
        email?: string;
      }
    | null
    | undefined,
): string {
  if (!person) return "—";

  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.email ||
    "—"
  );
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">
        {children || "—"}
      </dd>
    </div>
  );
}

function AssessmentEditor({
  id,
  initialAssessment,
  linkedRiskAssessment,
}: {
  id: string;
  initialAssessment: ManagementOfChangeAssessmentInput;
  linkedRiskAssessment: ManagementOfChangeDetail["impactAssessment"]["riskAssessment"];
}) {
  const updateMutation = useUpdateManagementOfChangeAssessment();
  const [assessment, setAssessment] =
    useState<ManagementOfChangeAssessmentInput>(initialAssessment);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const submitGuard = useRef(false);

  function updateField(
    name: keyof ManagementOfChangeAssessmentInput,
    value: string,
  ) {
    setAssessment((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (submitGuard.current || updateMutation.isPending) {
      return;
    }

    const missing = assessmentFields.find(
      (field) => !String(assessment[field.name] ?? "").trim(),
    );

    if (missing) {
      setError(`Complete the "${missing.label}" section before saving.`);
      return;
    }

    submitGuard.current = true;

    try {
      await updateMutation.mutateAsync({
        id,
        input: {
          qhseRisks: assessment.qhseRisks ?? "",
          environmentalAspects: assessment.environmentalAspects ?? "",
          legalAndClientObligations: assessment.legalAndClientObligations ?? "",
          competenceRequirements: assessment.competenceRequirements ?? "",
          procedureChanges: assessment.procedureChanges ?? "",
          emergencyArrangements: assessment.emergencyArrangements ?? "",
          interfaces: assessment.interfaces ?? "",
          riskAssessment: assessment.riskAssessment ?? null,
        },
      });

      setSuccess("Impact assessment saved successfully.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to save the impact assessment.",
      );
    } finally {
      submitGuard.current = false;
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-line bg-surface p-5 shadow-card"
    >
      <div>
        <h2 className="font-semibold text-foreground">Impact assessment</h2>
        <p className="mt-1 text-sm text-muted">
          Assess the consequences of the proposed change before it can proceed
          through the approval process.
        </p>
      </div>

      {linkedRiskAssessment && (
        <p className="rounded-lg border border-line bg-muted/20 px-3 py-2 text-sm text-muted">
          Linked risk assessment:{" "}
          <span className="font-medium text-foreground">
            {linkedRiskAssessment.title}
          </span>{" "}
          ({linkedRiskAssessment.status.toLowerCase()})
        </p>
      )}

      {assessmentFields.map((field) => (
        <label key={field.name} className="grid gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {field.label}
          </span>
          <span className="text-xs text-muted">{field.description}</span>
          <textarea
            className="min-h-28 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
            value={String(assessment[field.name] ?? "")}
            onChange={(event) => updateField(field.name, event.target.value)}
            maxLength={5000}
            required
          />
        </label>
      ))}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          {success}
        </p>
      )}

      <div className="flex justify-end border-t border-line pt-4">
        <Button
          type="submit"
          disabled={updateMutation.isPending}
          isLoading={updateMutation.isPending}
        >
          {updateMutation.isPending ? "Saving..." : "Save impact assessment"}
        </Button>
      </div>
    </form>
  );
}

function HistoryPanel({
  id,
  viewerId,
}: {
  id: string;
  viewerId: string | undefined;
}) {
  const historyQuery = useManagementOfChangeHistory(id);
  const entries = historyQuery.data?.data.history ?? [];

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 className="font-semibold text-foreground">Record history</h2>
      <p className="mt-1 text-sm text-muted">
        Workflow actions recorded in the append-only audit trail.
      </p>

      {historyQuery.isLoading ? (
        <Spinner label="Loading record history..." />
      ) : historyQuery.isError ? (
        <div className="mt-4">
          <ErrorState
            title="Unable to load record history"
            message={
              historyQuery.error instanceof Error
                ? historyQuery.error.message
                : undefined
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void historyQuery.refetch()}
              >
                Try again
              </Button>
            }
          />
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No history recorded yet.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {entries.map((entry: ManagementOfChangeHistoryEntry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-line px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">
                  {HISTORY_ACTION_LABELS[entry.action] ?? entry.action}
                </p>
                <time className="text-xs text-muted" dateTime={entry.createdAt}>
                  {formatDate(entry.createdAt)}
                </time>
              </div>
              <p className="mt-1 text-xs text-muted">
                Actor:{" "}
                {viewerId && entry.actor.id === viewerId
                  ? "You"
                  : entry.actor.id}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function ManagementOfChangeDetail({ id }: { id: string }) {
  const me = useMe();
  const changeQuery = useManagementOfChange(id);

  const role = me.data?.employee.ikoshRole;
  const viewerId = me.data?.employee.id;
  const canView = canViewManagementOfChange(role);

  if (me.isLoading || changeQuery.isLoading) {
    return <Spinner label="Loading change record..." />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (!canView) {
    return (
      <ErrorState
        title="Access restricted"
        message="Your IKOSH role does not have access to this record."
      />
    );
  }

  if (changeQuery.isError || !changeQuery.data?.item) {
    return (
      <ErrorState
        title="Unable to load change record"
        message={
          changeQuery.error instanceof Error
            ? changeQuery.error.message
            : undefined
        }
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void changeQuery.refetch()}
          >
            Try again
          </Button>
        }
      />
    );
  }

  const item = changeQuery.data.item;
  const approvalPolicy = changeQuery.data.approvalPolicy;
  const assessment = item.impactAssessment;
  const canAssess = canAssessManagementOfChange(role);
  const assessmentEditable = canEditManagementOfChangeAssessment(
    role,
    item.status,
  );

  const initialAssessment: ManagementOfChangeAssessmentInput = {
    qhseRisks: assessment.qhseRisks,
    environmentalAspects: assessment.environmentalAspects,
    legalAndClientObligations: assessment.legalAndClientObligations,
    competenceRequirements: assessment.competenceRequirements,
    procedureChanges: assessment.procedureChanges,
    emergencyArrangements: assessment.emergencyArrangements,
    interfaces: assessment.interfaces,
    riskAssessment: assessment.riskAssessment?.id ?? null,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management of Change"
        title={item.title}
        description={`${item.reference} · ${
          MANAGEMENT_OF_CHANGE_STATUS_LABELS[item.status]
        }`}
        actions={
          <Link
            href="/management-of-change"
            className="inline-flex items-center rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Back to register
          </Link>
        }
      />

      <ManagementOfChangeApprovalNotice
        active={approvalPolicy?.activationConfirmed}
        message={approvalPolicy?.message}
      />

      <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground">Change information</h2>
          <ManagementOfChangeStatusBadge status={item.status} />
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <DetailItem label="Reference">{item.reference}</DetailItem>
          <DetailItem label="Change type">
            {item.changeType === "TEMPORARY" ? "Temporary" : "Permanent"}
          </DetailItem>
          <DetailItem label="Project">{item.project?.name}</DetailItem>
          <DetailItem label="Site">{item.site?.name}</DetailItem>
          <DetailItem label="Planned start">
            {formatDate(item.plannedStartAt)}
          </DetailItem>
          <DetailItem label="Planned end">
            {formatDate(item.plannedEndAt)}
          </DetailItem>
          <DetailItem label="Change owner">
            {personName(item.changeOwner)}
          </DetailItem>
          <DetailItem label="Created by">
            {personName(item.createdBy)}
          </DetailItem>
          <DetailItem label="Submitted by">
            {personName(item.submittedBy)}
          </DetailItem>
          <DetailItem label="Submitted">
            {formatDate(item.submittedAt)}
          </DetailItem>
          <DetailItem label="Created">{formatDate(item.createdAt)}</DetailItem>
          <DetailItem label="Last updated">
            {formatDate(item.updatedAt)}
          </DetailItem>
          <DetailItem label="Reason">{item.reason}</DetailItem>
          <DetailItem label="Scope">{item.scope}</DetailItem>
          <DetailItem label="Affected assets">
            {item.affectedAssets?.join(", ")}
          </DetailItem>
          <DetailItem label="Affected people / teams">
            {item.affectedPeople?.join(", ")}
          </DetailItem>
        </dl>
      </section>

      {assessmentEditable ? (
        <AssessmentEditor
          key={`${item.id}-${item.updatedAt}`}
          id={item.id}
          initialAssessment={initialAssessment}
          linkedRiskAssessment={assessment.riskAssessment}
        />
      ) : (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-card">
          <h2 className="font-semibold text-foreground">Impact assessment</h2>
          {assessmentFields.map((field) => (
            <div key={field.name}>
              <h3 className="text-sm font-medium text-foreground">
                {field.label}
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                {String(assessment[field.name] ?? "") || "Not recorded"}
              </p>
            </div>
          ))}
          <DetailItem label="Linked risk assessment">
            {assessment.riskAssessment
              ? `${assessment.riskAssessment.title} (${assessment.riskAssessment.status.toLowerCase()})`
              : "None linked"}
          </DetailItem>
          {!canAssess && (
            <p className="text-xs text-muted">
              Your role has read-only access to this assessment.
            </p>
          )}
          {canAssess && !assessmentEditable && (
            <p className="text-xs text-muted">
              The assessment is locked because this change has moved beyond the
              assessment stage.
            </p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">Workflow status</h2>
            <p className="mt-1 text-sm text-muted">
              Current stage:{" "}
              <span className="font-medium text-foreground">
                {MANAGEMENT_OF_CHANGE_STATUS_LABELS[item.status]}
              </span>
            </p>
          </div>
          <ManagementOfChangeStatusBadge status={item.status} />
        </div>

        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {MANAGEMENT_OF_CHANGE_WORKFLOW.map((step) => {
            const active = step.status === item.status;

            return (
              <li
                key={step.status}
                className={`rounded-lg border p-3 ${
                  active
                    ? "border-navy-300 bg-navy-50"
                    : "border-line bg-surface"
                }`}
              >
                <p className="font-medium text-foreground">
                  {step.label}
                  {active && (
                    <span className="ml-2 text-xs font-normal text-navy-700">
                      Current
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted">{step.description}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-xs text-muted">
          Technical/HSE approval and management approval are both required
          before a change can be implemented. A03 activation requires formal
          management confirmation.
        </p>
      </section>

      <ManagementOfChangeWorkflowActions
        item={item}
        role={role}
        viewerId={viewerId}
        approvalPolicy={approvalPolicy}
      />

      <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <h2 className="font-semibold text-foreground">Approval trail</h2>
        <p className="mt-1 text-sm text-muted">
          {approvalPolicy?.activationConfirmed
            ? "Technical/HSE approval by an HSE manager and management approval by an administrator are required before implementation."
            : "Approval is blocked until A03 is formally activated by management. Approval cannot be inferred from a user's application role."}
        </p>

        {item.approvals.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-3 text-sm text-muted">
            No approvals recorded.
          </p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {item.approvals.map((approval, index) => (
              <li
                key={`${approval.approvalType}-${index}`}
                className="rounded-lg border border-line px-3 py-3"
              >
                <p className="font-medium text-foreground">
                  {approval.approvalType === "TECHNICAL"
                    ? "Technical approval"
                    : "Management approval"}
                </p>
                <p className="mt-1 text-muted">
                  {approval.decision} · {personName(approval.approver)} ·{" "}
                  {formatDate(approval.decidedAt)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Authority basis: {approval.authorityBasis || "Not recorded"}
                </p>
                {approval.comments && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {approval.comments}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <HistoryPanel id={item.id} viewerId={viewerId} />
    </div>
  );
}
