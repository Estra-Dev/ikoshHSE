import type {
  IkoshRole,
  PermitReadinessEvaluationState,
  PermitStatus,
} from "./api/types";
import { canEditPermit, canViewPermits } from "./permissions";

/**
 * Pure presentation helpers for the A03 DRAFT_PREVIEW.
 *
 * The preview is informational only. These helpers never decide whether a
 * permit may be approved, activated, resumed or blocked; they only describe
 * the evaluation returned by the API.
 */

export const PERMIT_READINESS_EVALUATION_STATES = [
  "AUTOMATIC",
  "RECORDED",
  "BLOCKED",
  "NOT_APPLICABLE",
  "OUTSTANDING",
] as const;

export const PERMIT_READINESS_DRAFT_PREVIEW_NOTICE =
  "A03 DRAFT PREVIEW — informational only; it does not approve, activate, resume, or block a permit.";

export const PERMIT_READINESS_STATE_LABELS: Record<
  PermitReadinessEvaluationState,
  string
> = {
  AUTOMATIC: "Automatic",
  RECORDED: "Recorded",
  BLOCKED: "Blocked",
  NOT_APPLICABLE: "Not applicable",
  OUTSTANDING: "Outstanding",
};

export function permitReadinessStateLabel(
  state: PermitReadinessEvaluationState,
): string {
  return PERMIT_READINESS_STATE_LABELS[state];
}

/** Only authoritative or recorded evidence counts as satisfied. */
export function isPermitReadinessRequirementSatisfied(
  state: PermitReadinessEvaluationState,
): boolean {
  return state === "AUTOMATIC" || state === "RECORDED";
}

export interface PermitReadinessSummary {
  total: number;
  satisfied: number;
  outstanding: number;
  blocked: number;
  notApplicable: number;
}

export function summarizePermitReadiness(
  requirements: readonly { state: PermitReadinessEvaluationState }[],
): PermitReadinessSummary {
  return {
    total: requirements.length,
    satisfied: requirements.filter((requirement) =>
      isPermitReadinessRequirementSatisfied(requirement.state),
    ).length,
    outstanding: requirements.filter(
      (requirement) => requirement.state === "OUTSTANDING",
    ).length,
    blocked: requirements.filter(
      (requirement) => requirement.state === "BLOCKED",
    ).length,
    notApplicable: requirements.filter(
      (requirement) => requirement.state === "NOT_APPLICABLE",
    ).length,
  };
}

interface ReadinessCapturePermit {
  status: PermitStatus;
  responsiblePerson: { id: string } | null;
  createdBy: { id: string } | null;
}

/**
 * Capture mirrors the server: DRAFT only, and only the creator, responsible
 * person or HSE management. The server remains authoritative.
 */
export function canRecordPermitReadiness(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  permit: ReadinessCapturePermit,
): boolean {
  return canEditPermit(role, viewerId, permit);
}

/** Read visibility mirrors the permit register. */
export function canViewPermitReadiness(role: IkoshRole | undefined): boolean {
  return canViewPermits(role);
}
