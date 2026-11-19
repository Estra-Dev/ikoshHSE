/**
 * A03 Permit to Work readiness candidate.
 *
 * This module records the requirements A03 imposes and maps each one to the
 * Permit facts that exist today or to the fact source still required. It does
 * not enforce anything: the candidate is DRAFT, is not approved for activation,
 * and has empty transition gates. M7.1 deliberately stops here so the M5
 * registry, evaluator, policyVersion stamping and grandfathering stay intact.
 *
 * The requirement IDs are stable keys for later readiness facts. Labels are
 * display text. Nothing here invents authority limits, retrospective cutoffs,
 * client rules, competence sources or retention periods; unresolved decisions
 * are recorded separately and referenced by the requirements they block.
 */

import type {
  PermitReadinessPolicy,
  PermitReadinessRequirement,
} from "./permit-readiness.js";

/** Source document metadata for the A03 draft. */
export const A03_SOURCE = Object.freeze({
  documentId: "IKNL-QHSE-DOPR-002",
  revision: "A03",
  dated: "2026-10-28",
  status: "DRAFT" as const,
});

/** Version reserved for the A03 readiness candidate. */
export const A03_CANDIDATE_VERSION = 2;

export type A03RequirementType = "UNIVERSAL" | "CONDITIONAL";

/**
 * READY           existing Permit facts can satisfy the requirement.
 * PARTIAL         existing facts cover only part of the requirement.
 * FUTURE_SOURCE   a record from a later M7 phase is required.
 * BLOCKED         an unresolved organizational decision is required first.
 */
export type A03EnforcementState =
  | "READY"
  | "PARTIAL"
  | "FUTURE_SOURCE"
  | "BLOCKED";

export const A03_DECISION_IDS = [
  "authority_limits",
  "retrospective_cutoff",
  "client_requirements_source",
  "competence_medical_source",
  "stop_work_authority",
  "existing_permit_transition",
  "evidence_retention",
] as const;

export type A03DecisionId = (typeof A03_DECISION_IDS)[number];

export type A03DecisionScope = "ENFORCEMENT" | "ROLLOUT";

export interface A03OpenDecision {
  readonly id: A03DecisionId;
  readonly scope: A03DecisionScope;
  readonly label: string;
  readonly detail: string;
}

/**
 * Decisions that cannot be inferred from the repository or A03. They stay open
 * until the process owner supplies an approved answer.
 */
export const A03_OPEN_DECISIONS: readonly A03OpenDecision[] = Object.freeze([
  Object.freeze({
    id: "authority_limits",
    scope: "ENFORCEMENT",
    label: "Issuer authority limits and delegation",
    detail:
      "A03 requires approval only within authorization and Appendix B requires authority limits to be confirmed. No approved site, permit-type or value limits or delegation matrix exists; role membership alone must not be treated as an authority limit.",
  }),
  Object.freeze({
    id: "retrospective_cutoff",
    scope: "ENFORCEMENT",
    label: "Retrospective permit cutoff",
    detail:
      "A03 prohibits retrospective permits but does not define whether the cutoff applies at creation, submission or approval, nor any grace period or governing timezone.",
  }),
  Object.freeze({
    id: "client_requirements_source",
    scope: "ENFORCEMENT",
    label: "Client-specific requirements source",
    detail:
      "No client requirements register or applicability source exists. Project.client is free text, so stricter client rules cannot be identified or enforced.",
  }),
  Object.freeze({
    id: "competence_medical_source",
    scope: "ENFORCEMENT",
    label: "Induction, competence and medical-fitness source",
    detail:
      "No authoritative induction, competence or medical-fitness record exists. TrainingSession attendance is explicitly not a competence or authorization claim.",
  }),
  Object.freeze({
    id: "stop_work_authority",
    scope: "ENFORCEMENT",
    label: "Stop-work authority model",
    detail:
      "A03 allows any worker to stop or pause work, while permit suspension is currently limited to the responsible person, an HSE officer for the site or HSE management. Decide whether to broaden suspension or add a separate stop-work record.",
  }),
  Object.freeze({
    id: "existing_permit_transition",
    scope: "ROLLOUT",
    label: "Existing permit transition on activation",
    detail:
      "M5 grandfathers permits with a null policyVersion. If A03 applies to in-flight permits on its effective date, a revalidation or migration rule is required before activation.",
  }),
  Object.freeze({
    id: "evidence_retention",
    scope: "ROLLOUT",
    label: "Evidence metadata and retention",
    detail:
      "Attachment has no category, certificate number or expiry, and A03 Appendix B requires retention periods to be confirmed by Document Control or Legal.",
  }),
]);

export interface A03RequirementMapping {
  readonly id: string;
  readonly label: string;
  readonly a03Reference: string;
  readonly type: A03RequirementType;
  /** Permit fields or authorization facts that exist today. */
  readonly existingFacts: readonly string[];
  /** Records or services a later M7 phase must provide. */
  readonly futureFactSources: readonly string[];
  readonly blockedBy: readonly A03DecisionId[];
  readonly enforcement: A03EnforcementState;
}

/**
 * One mapping per A03 obligation used by the candidate. The IDs are the keys a
 * future readiness fact builder will answer; labels are display text only.
 */
export const A03_REQUIREMENT_MAPPINGS: readonly A03RequirementMapping[] =
  Object.freeze([
    Object.freeze({
      id: "scope_and_permit_type",
      label: "Define location, scope, duration and permit type",
      a03Reference: "SOP 013 step 1",
      type: "UNIVERSAL",
      existingFacts: [
        "workDescription",
        "workType",
        "project",
        "site",
        "location",
        "validFrom",
        "validTo",
      ],
      futureFactSources: [],
      blockedBy: [],
      enforcement: "READY",
    }),
    Object.freeze({
      id: "people_defined",
      label: "Define the people involved",
      a03Reference: "SOP 013 step 1",
      type: "UNIVERSAL",
      existingFacts: ["responsiblePerson", "workersInvolved"],
      futureFactSources: ["Permit worker or personnel references (M7.2)"],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "equipment_defined",
      label: "Define equipment used for the task",
      a03Reference: "SOP 013 step 1",
      type: "UNIVERSAL",
      existingFacts: [],
      futureFactSources: ["Permit equipment records (M7.2)"],
      blockedBy: [],
      enforcement: "FUTURE_SOURCE",
    }),
    Object.freeze({
      id: "hazards_and_controls",
      label: "Identify hazards and control measures",
      a03Reference: "SOP 013 step 1 and step 2",
      type: "UNIVERSAL",
      existingFacts: ["hazards"],
      futureFactSources: [],
      blockedBy: [],
      enforcement: "READY",
    }),
    Object.freeze({
      id: "interfaces_defined",
      label: "Define interfaces with other work",
      a03Reference: "SOP 013 step 1",
      type: "CONDITIONAL",
      existingFacts: [],
      futureFactSources: ["Permit interface and SIMOPS records (M7.2)"],
      blockedBy: [],
      enforcement: "FUTURE_SOURCE",
    }),
    Object.freeze({
      id: "supporting_certificates",
      label: "Record supporting certificates",
      a03Reference: "SOP 013 step 1 and records",
      type: "CONDITIONAL",
      existingFacts: ["permit attachments"],
      futureFactSources: [
        "Typed certificate metadata on Attachment or Permit (M7.5)",
      ],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "current_risk_assessment",
      label: "Review a current risk assessment or JHA",
      a03Reference: "SOP 013 step 2 and key controls",
      type: "UNIVERSAL",
      existingFacts: ["riskAssessments"],
      futureFactSources: [
        "Readiness fact derived from current approved links (M7.3)",
      ],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "method_statement",
      label: "Review the method statement",
      a03Reference: "SOP 013 step 2",
      type: "CONDITIONAL",
      existingFacts: [],
      futureFactSources: [
        "Permit method statement reference or attachment (M7.2)",
      ],
      blockedBy: [],
      enforcement: "FUTURE_SOURCE",
    }),
    Object.freeze({
      id: "isolation_records",
      label: "Record isolations",
      a03Reference: "SOP 013 step 2 and step 6",
      type: "CONDITIONAL",
      existingFacts: [
        "requiredPrecautions (LOCKOUT_TAGOUT)",
        "closureChecks.equipmentIsolated",
      ],
      futureFactSources: ["Permit isolation records (M7.2)"],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "gas_test_records",
      label: "Record gas tests",
      a03Reference: "SOP 013 step 2",
      type: "CONDITIONAL",
      existingFacts: ["requiredPrecautions (GAS_TESTING)"],
      futureFactSources: ["Permit gas-test records (M7.2)"],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "fire_protection",
      label: "Confirm fire protection",
      a03Reference: "SOP 013 step 2",
      type: "CONDITIONAL",
      existingFacts: ["requiredPrecautions (FIRE_WATCH)"],
      futureFactSources: ["Permit fire-protection record (M7.2)"],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "rescue_arrangements",
      label: "Confirm rescue arrangements",
      a03Reference: "SOP 013 step 2",
      type: "CONDITIONAL",
      existingFacts: [
        "requiredPrecautions (RESCUE_PLAN)",
        "requiredPrecautions (EMERGENCY_RESPONSE)",
      ],
      futureFactSources: ["Permit rescue arrangement record (M7.2)"],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "environmental_controls",
      label: "Review environmental controls",
      a03Reference: "SOP 013 step 2",
      type: "CONDITIONAL",
      existingFacts: [],
      futureFactSources: [
        "Permit environmental controls, waste and SDS record (M7.2)",
      ],
      blockedBy: [],
      enforcement: "FUTURE_SOURCE",
    }),
    Object.freeze({
      id: "worksite_verification",
      label: "Verify conditions and controls at the worksite",
      a03Reference: "SOP 013 step 3",
      type: "UNIVERSAL",
      existingFacts: [],
      futureFactSources: ["Permit worksite verification or attestation (M7.3)"],
      blockedBy: [],
      enforcement: "FUTURE_SOURCE",
    }),
    Object.freeze({
      id: "authorized_issuer",
      label: "Approve only within the issuer's authorization",
      a03Reference: "SOP 013 step 3 and key controls",
      type: "UNIVERSAL",
      existingFacts: ["approvedBy", "approvedAt", "canApprovePermit"],
      futureFactSources: ["Permit authority matrix (M7.3)"],
      blockedBy: ["authority_limits"] as const,
      enforcement: "BLOCKED",
    }),
    Object.freeze({
      id: "independent_approval",
      label: "Prevent self-approval where independent review is required",
      a03Reference: "Section 4 authority rule",
      type: "UNIVERSAL",
      existingFacts: [
        "canApprovePermit",
        "approvedBy",
        "submittedBy",
        "responsiblePerson",
        "createdBy",
      ],
      futureFactSources: [],
      blockedBy: [],
      enforcement: "READY",
    }),
    Object.freeze({
      id: "validity_window",
      label: "Comply with the permit validity window",
      a03Reference: "SOP 013 step 4",
      type: "UNIVERSAL",
      existingFacts: [
        "validFrom",
        "validTo",
        "activatedAt",
        "resumedAt",
      ],
      futureFactSources: [],
      blockedBy: [],
      enforcement: "READY",
    }),
    Object.freeze({
      id: "worker_briefing",
      label: "Brief all affected workers",
      a03Reference: "SOP 013 step 4",
      type: "UNIVERSAL",
      existingFacts: ["requiredPrecautions (TOOLBOX_TALK)"],
      futureFactSources: [
        "Permit briefing record or ToolboxTalk link (M7.4)",
      ],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "permit_display",
      label: "Display the permit at the worksite",
      a03Reference: "SOP 013 step 4",
      type: "UNIVERSAL",
      existingFacts: [],
      futureFactSources: [
        "Permit display or issue record and printable view (M7.4)",
      ],
      blockedBy: [],
      enforcement: "FUTURE_SOURCE",
    }),
    Object.freeze({
      id: "monitoring_and_suspension",
      label: "Monitor controls and suspend when conditions change",
      a03Reference: "SOP 013 step 5",
      type: "UNIVERSAL",
      existingFacts: [
        "suspendedBy",
        "suspendedAt",
        "suspensionReason",
        "resumedBy",
        "resumedAt",
      ],
      futureFactSources: [
        "Permit monitoring log and suspension triggers (M7.4)",
      ],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "revalidation_before_restart",
      label: "Reassess and revalidate before restart",
      a03Reference: "SOP 013 step 5",
      type: "UNIVERSAL",
      existingFacts: [],
      futureFactSources: ["Permit revalidation record (M7.4)"],
      blockedBy: [],
      enforcement: "FUTURE_SOURCE",
    }),
    Object.freeze({
      id: "closeout_and_handback",
      label: "Close out and hand back the worksite",
      a03Reference: "SOP 013 step 6",
      type: "UNIVERSAL",
      existingFacts: [
        "closureChecks",
        "closureNotes",
        "closedBy",
        "closedAt",
      ],
      futureFactSources: [
        "Housekeeping, tool and equipment removal and handback records (M7.5)",
      ],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "personnel_competence",
      label: "Confirm personnel are inducted, competent, fit and authorized",
      a03Reference: "Appendix A item 4",
      type: "UNIVERSAL",
      existingFacts: ["responsiblePerson", "workersInvolved"],
      futureFactSources: [
        "Induction, competence and medical-fitness records (M7.1 decision)",
      ],
      blockedBy: ["competence_medical_source"] as const,
      enforcement: "BLOCKED",
    }),
    Object.freeze({
      id: "equipment_ppe_inspection",
      label: "Confirm tools, equipment and PPE are inspected and fit for use",
      a03Reference: "Appendix A item 5",
      type: "UNIVERSAL",
      existingFacts: ["permit attachments (PPE or inspection evidence, not linked)"],
      futureFactSources: [
        "Permit PPE and equipment inspection links (M7.5)",
      ],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "emergency_arrangements",
      label: "Confirm emergency, communication, first-aid and rescue arrangements",
      a03Reference: "Appendix A item 6",
      type: "UNIVERSAL",
      existingFacts: ["requiredPrecautions (EMERGENCY_RESPONSE)"],
      futureFactSources: [
        "Permit emergency arrangement record (M7.2 and M7.4)",
      ],
      blockedBy: [],
      enforcement: "PARTIAL",
    }),
    Object.freeze({
      id: "client_requirements",
      label: "Confirm applicable client requirements",
      a03Reference: "Appendix A item 1 and section 5",
      type: "CONDITIONAL",
      existingFacts: ["project.client (free text only)"],
      futureFactSources: [
        "Client requirements register and applicability source (M7.1 decision)",
      ],
      blockedBy: ["client_requirements_source"] as const,
      enforcement: "BLOCKED",
    }),
    Object.freeze({
      id: "contractor_simops_coordination",
      label: "Coordinate contractor interfaces and simultaneous operations",
      a03Reference: "Appendix A item 8",
      type: "CONDITIONAL",
      existingFacts: [],
      futureFactSources: [
        "Permit contractor interface and SIMOPS record (M7.2)",
      ],
      blockedBy: [],
      enforcement: "FUTURE_SOURCE",
    }),
    Object.freeze({
      id: "critical_actions_and_residual_risk",
      label: "Close critical actions and accept residual risk",
      a03Reference: "Appendix A item 9",
      type: "UNIVERSAL",
      existingFacts: [],
      futureFactSources: [
        "CorrectiveAction links and residual-risk acceptance (M7.5)",
      ],
      blockedBy: [],
      enforcement: "FUTURE_SOURCE",
    }),
    Object.freeze({
      id: "stop_work_authority",
      label: "Enable stop-work and confirm restart authority",
      a03Reference: "Appendix A item 10 and section 4",
      type: "UNIVERSAL",
      existingFacts: [
        "suspendedBy",
        "suspendedAt",
        "canSuspendPermit",
      ],
      futureFactSources: [
        "Stop-work and restart record and authority model (M7.1 decision, M7.4)",
      ],
      blockedBy: ["stop_work_authority"] as const,
      enforcement: "BLOCKED",
    }),
    Object.freeze({
      id: "no_retrospective_permit",
      label: "Prevent retrospective permits",
      a03Reference: "SOP 013 key controls",
      type: "UNIVERSAL",
      existingFacts: ["validFrom", "createdAt", "submittedAt"],
      futureFactSources: ["Retrospective cutoff rule (M7.1 decision)"],
      blockedBy: ["retrospective_cutoff"] as const,
      enforcement: "BLOCKED",
    }),
    Object.freeze({
      id: "records_attributable",
      label: "Keep records dated, attributable and traceable",
      a03Reference: "Section 5 common requirements",
      type: "UNIVERSAL",
      existingFacts: [
        "createdBy",
        "createdAt",
        "updatedAt",
        "submittedBy",
        "submittedAt",
        "approvedBy",
        "approvedAt",
        "closedBy",
        "closedAt",
        "audit log",
      ],
      futureFactSources: [],
      blockedBy: [],
      enforcement: "READY",
    }),
  ]);

export const A03_REQUIREMENT_IDS: readonly string[] =
  A03_REQUIREMENT_MAPPINGS.map((mapping) => mapping.id);

const A03_REQUIREMENTS: readonly PermitReadinessRequirement[] = Object.freeze(
  A03_REQUIREMENT_MAPPINGS.map(({ id, label }) =>
    Object.freeze({ id, label }),
  ),
);

/**
 * Candidate policy for the A03 draft.
 *
 * `approvedForActivation` stays false and every gate is empty. The requirements
 * are documented for mapping and tests only; no lifecycle transition is gated.
 */
export const A03_CANDIDATE_POLICY: PermitReadinessPolicy = Object.freeze({
  version: A03_CANDIDATE_VERSION,
  source: A03_SOURCE,
  approvedForActivation: false,
  requirements: A03_REQUIREMENTS,
  gates: Object.freeze({
    approve: Object.freeze([] as string[]),
    activate: Object.freeze([] as string[]),
    resume: Object.freeze([] as string[]),
  }),
});

export function getA03RequirementMapping(
  id: string,
): A03RequirementMapping | undefined {
  return A03_REQUIREMENT_MAPPINGS.find((mapping) => mapping.id === id);
}

/** Requirement IDs whose enforcement waits on one open decision. */
export function a03RequirementsBlockedBy(
  decisionId: A03DecisionId,
): readonly string[] {
  return A03_REQUIREMENT_MAPPINGS.filter((mapping) =>
    mapping.blockedBy.includes(decisionId),
  ).map((mapping) => mapping.id);
}
