import { Types } from "mongoose";
import { Contractor } from "../models/Contractor.js";
import { CorrectiveAction } from "../models/CorrectiveAction.js";
import { Inspection } from "../models/Inspection.js";
import type { PermitDocument } from "../models/Permit.js";
import { PpeIssuance } from "../models/PpeIssuance.js";
import { RiskAssessment } from "../models/RiskAssessment.js";
import { ToolboxTalk } from "../models/ToolboxTalk.js";
import {
  A03_CANDIDATE_VERSION,
  A03_REQUIREMENT_MAPPINGS,
  A03_SOURCE,
  type A03RequirementType,
} from "./permit-readiness-a03.js";
import {
  buildPermitReadinessFacts,
  type PermitReadinessFactContractor,
  type PermitReadinessFactCorrectiveAction,
  type PermitReadinessFactInspection,
  type PermitReadinessFactPpeIssuance,
  type PermitReadinessFactRiskAssessment,
  type PermitReadinessFactToolboxTalk,
  type PermitReadinessFactsBuilderResult,
} from "./permit-readiness-facts.js";

/**
 * Read-only readiness visibility for a single permit.
 *
 * The evaluation is a DRAFT_PREVIEW of the A03 candidate. It never enforces a
 * lifecycle transition, never changes the permit's stamped policyVersion, and
 * is computed only from records explicitly linked to the permit being read.
 */
export const PERMIT_READINESS_EVALUATION_STATES = [
  "AUTOMATIC",
  "RECORDED",
  "BLOCKED",
  "NOT_APPLICABLE",
  "OUTSTANDING",
] as const;

export type PermitReadinessEvaluationState =
  (typeof PERMIT_READINESS_EVALUATION_STATES)[number];

export interface PermitReadinessRequirementEvaluation {
  readonly id: string;
  readonly label: string;
  readonly type: A03RequirementType;
  readonly state: PermitReadinessEvaluationState;
  /** True only for AUTOMATIC or RECORDED. Never true for NOT_APPLICABLE. */
  readonly satisfied: boolean;
}

export interface PermitReadinessEvaluationCounts {
  readonly total: number;
  readonly satisfied: number;
  readonly outstanding: number;
  readonly blocked: number;
  readonly notApplicable: number;
}

export interface PermitReadinessEvaluation {
  readonly mode: "DRAFT_PREVIEW";
  readonly policy: {
    readonly version: number;
    readonly revision: string;
    readonly status: "DRAFT";
  };
  readonly permitPolicyVersion: number | null;
  readonly counts: PermitReadinessEvaluationCounts;
  readonly requirements: readonly PermitReadinessRequirementEvaluation[];
}

/**
 * Converts the fact builder's category lists into the display states. A
 * requirement is satisfied only when authoritative or recorded evidence
 * established the fact; a declaration of NOT_APPLICABLE is reported separately
 * and never counts as satisfied.
 */
export function buildPermitReadinessEvaluation(
  result: PermitReadinessFactsBuilderResult,
  permitPolicyVersion: number | null,
): PermitReadinessEvaluation {
  const automatic = new Set(result.automatic);
  const recorded = new Set(result.recorded);
  const blocked = new Set(result.blocked);
  const notApplicable = new Set(result.notApplicable);

  const requirements = A03_REQUIREMENT_MAPPINGS.map((mapping) => {
    let state: PermitReadinessEvaluationState;

    if (blocked.has(mapping.id)) {
      state = "BLOCKED";
    } else if (automatic.has(mapping.id)) {
      state = "AUTOMATIC";
    } else if (recorded.has(mapping.id)) {
      state = "RECORDED";
    } else if (notApplicable.has(mapping.id)) {
      state = "NOT_APPLICABLE";
    } else {
      state = "OUTSTANDING";
    }

    return {
      id: mapping.id,
      label: mapping.label,
      type: mapping.type,
      state,
      satisfied: state === "AUTOMATIC" || state === "RECORDED",
    };
  });

  return {
    mode: "DRAFT_PREVIEW",
    policy: {
      version: A03_CANDIDATE_VERSION,
      revision: A03_SOURCE.revision,
      status: A03_SOURCE.status,
    },
    permitPolicyVersion,
    counts: {
      total: requirements.length,
      satisfied: requirements.filter((requirement) => requirement.satisfied)
        .length,
      outstanding: requirements.filter(
        (requirement) => requirement.state === "OUTSTANDING",
      ).length,
      blocked: requirements.filter(
        (requirement) => requirement.state === "BLOCKED",
      ).length,
      notApplicable: requirements.filter(
        (requirement) => requirement.state === "NOT_APPLICABLE",
      ).length,
    },
    requirements,
  };
}

interface PermitScope {
  readonly project: Types.ObjectId;
  readonly site: Types.ObjectId;
}

function objectIdOf(value: unknown): Types.ObjectId | null {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  if (typeof value === "object" && value !== null && "_id" in value) {
    return objectIdOf((value as { _id: unknown })._id);
  }

  if (typeof value === "string" && Types.ObjectId.isValid(value)) {
    return new Types.ObjectId(value);
  }

  return null;
}

function uniqueObjectIds(values: readonly unknown[]): Types.ObjectId[] {
  const seen = new Set<string>();
  const unique: Types.ObjectId[] = [];

  for (const value of values) {
    const id = objectIdOf(value);

    if (!id) {
      continue;
    }

    const key = String(id);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(id);
  }

  return unique;
}

async function loadRiskAssessments(
  ids: readonly Types.ObjectId[],
  scope: PermitScope | null,
): Promise<PermitReadinessFactRiskAssessment[]> {
  if (ids.length === 0 || scope === null) {
    return [];
  }

  const assessments = await RiskAssessment.find({
    _id: { $in: ids },
    ...scope,
  })
    .select("_id status supersededBy project site")
    .lean();

  return assessments.map((assessment) => ({
    _id: String(assessment._id),
    status: assessment.status,
    supersededBy: assessment.supersededBy
      ? String(assessment.supersededBy)
      : null,
    project: String(assessment.project),
    site: assessment.site ? String(assessment.site) : null,
  }));
}

async function loadInspections(
  ids: readonly Types.ObjectId[],
  scope: PermitScope | null,
): Promise<PermitReadinessFactInspection[]> {
  if (ids.length === 0 || scope === null) {
    return [];
  }

  const inspections = await Inspection.find({
    _id: { $in: ids },
    ...scope,
  })
    .select("_id status project site")
    .lean();

  return inspections.map((inspection) => ({
    _id: String(inspection._id),
    status: inspection.status,
    project: String(inspection.project),
    site: String(inspection.site),
  }));
}

async function loadPpeIssuances(
  ids: readonly Types.ObjectId[],
  scope: PermitScope | null,
): Promise<PermitReadinessFactPpeIssuance[]> {
  if (ids.length === 0 || scope === null) {
    return [];
  }

  const issuances = await PpeIssuance.find({
    _id: { $in: ids },
    ...scope,
  })
    .select("_id status project site")
    .lean();

  return issuances.map((issuance) => ({
    _id: String(issuance._id),
    status: issuance.status,
    project: String(issuance.project),
    site: String(issuance.site),
  }));
}

async function loadCorrectiveActions(
  ids: readonly Types.ObjectId[],
  scope: PermitScope | null,
): Promise<PermitReadinessFactCorrectiveAction[]> {
  if (ids.length === 0 || scope === null) {
    return [];
  }

  const actions = await CorrectiveAction.find({
    _id: { $in: ids },
    ...scope,
  })
    .select("_id status project site")
    .lean();

  return actions.map((action) => ({
    _id: String(action._id),
    status: action.status,
    project: String(action.project),
    site: String(action.site),
  }));
}

async function loadContractors(
  ids: readonly Types.ObjectId[],
): Promise<PermitReadinessFactContractor[]> {
  if (ids.length === 0) {
    return [];
  }

  const contractors = await Contractor.find({ _id: { $in: ids } })
    .select("_id isActive projects")
    .lean();

  return contractors.map((contractor) => ({
    _id: String(contractor._id),
    isActive: contractor.isActive === true,
    projects: (contractor.projects ?? []).map((project) => String(project)),
  }));
}

async function loadToolboxTalk(
  id: Types.ObjectId | null,
  scope: PermitScope | null,
): Promise<PermitReadinessFactToolboxTalk | null> {
  if (id === null || scope === null) {
    return null;
  }

  const talk = await ToolboxTalk.findOne({ _id: id, ...scope })
    .select(
      "_id status project site participants.employee participants.contractorPersonnel participants.attendance",
    )
    .lean();

  if (!talk) {
    return null;
  }

  return {
    _id: String(talk._id),
    status: talk.status,
    project: String(talk.project),
    site: String(talk.site),
    participants: (talk.participants ?? []).map((participant) => ({
      kind: participant.kind,
      employee: participant.employee ? String(participant.employee) : null,
      contractorPersonnel: participant.contractorPersonnel
        ? String(participant.contractorPersonnel)
        : null,
      attendance: participant.attendance,
    })),
  };
}

/**
 * Loads only the records explicitly linked to this permit, builds the readiness
 * facts, and returns the sanitized draft-preview evaluation. Unlinked records
 * on the same project or site are never considered.
 */
export async function loadPermitReadinessEvaluation(
  permit: PermitDocument,
): Promise<PermitReadinessEvaluation> {
  const project = objectIdOf(permit.project);
  const site = objectIdOf(permit.site);
  const scope = project && site ? { project, site } : null;
  const readiness = permit.readiness ?? null;
  const links = readiness?.links ?? null;

  const inspectionIds = uniqueObjectIds([
    ...(links?.inspectionIds ?? []),
    ...(readiness?.equipment ?? []).map((equipment) => equipment.inspection),
  ]);
  const ppeIssuanceIds = uniqueObjectIds(links?.ppeIssuanceIds ?? []);
  const correctiveActionIds = uniqueObjectIds(
    links?.correctiveActionIds ?? [],
  );
  const contractorIds = uniqueObjectIds(links?.contractorIds ?? []);
  const riskAssessmentIds = uniqueObjectIds(permit.riskAssessments ?? []);
  const toolboxTalkId = objectIdOf(links?.toolboxTalkId);

  const [
    riskAssessments,
    inspections,
    ppeIssuances,
    correctiveActions,
    contractors,
    toolboxTalk,
  ] = await Promise.all([
    loadRiskAssessments(riskAssessmentIds, scope),
    loadInspections(inspectionIds, scope),
    loadPpeIssuances(ppeIssuanceIds, scope),
    loadCorrectiveActions(correctiveActionIds, scope),
    loadContractors(contractorIds),
    loadToolboxTalk(toolboxTalkId, scope),
  ]);

  const facts = buildPermitReadinessFacts({
    permit,
    riskAssessments,
    inspections,
    ppeIssuances,
    correctiveActions,
    contractors,
    toolboxTalk,
  });

  return buildPermitReadinessEvaluation(
    facts,
    permit.policyVersion ?? null,
  );
}
