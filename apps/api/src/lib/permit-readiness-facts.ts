import {
  A03_REQUIREMENT_MAPPINGS,
  type A03RequirementMapping,
} from "./permit-readiness-a03.js";

/**
 * Minimal readiness shapes consumed by the fact builder. They intentionally
 * accept both lean/Mongo documents and the plain objects used by tests: only
 * identifiers, states and presence are inspected.
 */
export interface PermitReadinessFactPerson {
  kind?: string | null;
  employee?: unknown;
  contractorPersonnel?: unknown;
  contractor?: unknown;
  name?: string | null;
  role?: string | null;
  attendance?: string | null;
}

export interface PermitReadinessFactEquipment {
  name?: string | null;
  inspection?: unknown;
}

export interface PermitReadinessFactIsolation {
  point?: string | null;
  attachmentIds?: readonly unknown[];
}

export interface PermitReadinessFactGasTest {
  area?: string | null;
  attachmentIds?: readonly unknown[];
}

export interface PermitReadinessFactLinks {
  inspectionIds?: readonly unknown[];
  ppeIssuanceIds?: readonly unknown[];
  correctiveActionIds?: readonly unknown[];
  contractorIds?: readonly unknown[];
  toolboxTalkId?: unknown;
}

export interface PermitReadinessFactWorksiteVerification {
  verifiedBy?: unknown;
  verifiedAt?: unknown;
  attachmentIds?: readonly unknown[];
}

export interface PermitReadinessFactAttestation {
  requirementId?: string | null;
  state?: string | null;
}

export interface PermitReadinessFactReadiness {
  personnel?: readonly PermitReadinessFactPerson[];
  equipment?: readonly PermitReadinessFactEquipment[];
  isolations?: readonly PermitReadinessFactIsolation[];
  gasTests?: readonly PermitReadinessFactGasTest[];
  links?: PermitReadinessFactLinks | null;
  worksiteVerification?: PermitReadinessFactWorksiteVerification | null;
  attestations?: readonly PermitReadinessFactAttestation[];
}

export interface PermitReadinessFactHazard {
  hazard?: string | null;
  controlMeasures?: string | null;
}

export interface PermitReadinessFactPermit {
  workDescription?: string | null;
  workType?: string | null;
  status?: string | null;
  project?: unknown;
  site?: unknown;
  location?: string | null;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
  responsiblePerson?: unknown;
  workersInvolved?: readonly string[];
  requiredPrecautions?: readonly string[];
  hazards?: readonly PermitReadinessFactHazard[];
  submittedBy?: unknown;
  submittedAt?: Date | string | null;
  approvedBy?: unknown;
  approvedAt?: Date | string | null;
  activatedAt?: Date | string | null;
  resumedAt?: Date | string | null;
  closedBy?: unknown;
  closedAt?: Date | string | null;
  closureChecks?: {
    workAreaSecured?: boolean;
    personnelAccountedFor?: boolean;
    equipmentIsolated?: boolean;
    siteHandoverCompleted?: boolean;
  } | null;
  readiness?: PermitReadinessFactReadiness | null;
  createdBy?: unknown;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface PermitReadinessFactRiskAssessment {
  _id?: unknown;
  status?: string | null;
  supersededBy?: unknown;
  project?: unknown;
  site?: unknown;
}

export interface PermitReadinessFactInspection {
  _id?: unknown;
  status?: string | null;
  project?: unknown;
  site?: unknown;
}

export interface PermitReadinessFactPpeIssuance {
  _id?: unknown;
  status?: string | null;
  project?: unknown;
  site?: unknown;
}

export interface PermitReadinessFactCorrectiveAction {
  _id?: unknown;
  status?: string | null;
  project?: unknown;
  site?: unknown;
}

export interface PermitReadinessFactContractor {
  _id?: unknown;
  isActive?: boolean;
  projects?: readonly unknown[];
}

export interface PermitReadinessFactToolboxTalk {
  _id?: unknown;
  status?: string | null;
  project?: unknown;
  site?: unknown;
  participants?: readonly PermitReadinessFactPerson[];
}

export interface PermitReadinessFactsInput {
  permit: PermitReadinessFactPermit;
  riskAssessments?: readonly PermitReadinessFactRiskAssessment[] | null;
  inspections?: readonly PermitReadinessFactInspection[] | null;
  ppeIssuances?: readonly PermitReadinessFactPpeIssuance[] | null;
  correctiveActions?: readonly PermitReadinessFactCorrectiveAction[] | null;
  contractors?: readonly PermitReadinessFactContractor[] | null;
  toolboxTalk?: PermitReadinessFactToolboxTalk | null;
}

export type PermitReadinessFactsBuilderResult = {
  facts: Record<string, boolean>;
  automatic: readonly string[];
  recorded: readonly string[];
  blocked: readonly string[];
  notApplicable: readonly string[];
};

function idOf(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    if ("_id" in value) {
      const id = (value as { _id: unknown })._id;
      return id === null || id === undefined ? null : String(id);
    }

    return null;
  }

  return String(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timeOf(value: unknown): number | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }

  if (typeof value === "string") {
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }

  return null;
}

function hasItems(values: readonly unknown[] | null | undefined): boolean {
  return (values ?? []).length > 0;
}

function matchesProjectAndSite(
  record: { project?: unknown; site?: unknown },
  projectId: string | null,
  siteId: string | null,
): boolean {
  if (projectId === null || siteId === null) {
    return false;
  }

  return (
    idOf(record.project) === projectId && idOf(record.site) === siteId
  );
}

function isCurrentApprovedRiskAssessment(
  assessment: PermitReadinessFactRiskAssessment,
  projectId: string | null,
  siteId: string | null,
): boolean {
  return (
    assessment.status === "APPROVED" &&
    (assessment.supersededBy === null ||
      assessment.supersededBy === undefined) &&
    matchesProjectAndSite(assessment, projectId, siteId)
  );
}

function isIdentifier(value: unknown): boolean {
  return idOf(value) !== null;
}

/**
 * Requirements whose satisfaction must come from a recorded, attributed
 * source. A declaration cannot substitute for the record, so a SATISFIED
 * attestation for one of these IDs never establishes the fact.
 */
export const PERMIT_READINESS_EVIDENCE_REQUIRED_IDS: readonly string[] =
  Object.freeze([
    "contractor_simops_coordination",
    "worker_briefing",
    "critical_actions_and_residual_risk",
  ]);

export function permitReadinessRequiresEvidence(id: string): boolean {
  return PERMIT_READINESS_EVIDENCE_REQUIRED_IDS.includes(id);
}

/**
 * Stable key for a captured worker reference. Employee and contractor
 * populations are kept separate so identical ObjectIds can never be confused.
 */
function personReferenceKey(person: {
  employee?: unknown;
  contractorPersonnel?: unknown;
}): string | null {
  const employee = idOf(person.employee);
  if (employee !== null) {
    return `employee:${employee}`;
  }

  const contractorPersonnel = idOf(person.contractorPersonnel);
  if (contractorPersonnel !== null) {
    return `contractorPersonnel:${contractorPersonnel}`;
  }

  return null;
}

/**
 * A completed toolbox talk only confirms a briefing when every captured
 * permit worker reference appears as an attendee. Talk completion alone, or a
 * participant who is merely invited or absent, is not confirmation.
 */
function toolboxTalkBriefsCapturedWorkers(
  talk: PermitReadinessFactToolboxTalk,
  readiness: PermitReadinessFactReadiness | null,
  projectId: string | null,
  siteId: string | null,
): boolean {
  if (
    talk.status !== "COMPLETED" ||
    !matchesProjectAndSite(talk, projectId, siteId)
  ) {
    return false;
  }

  const workers = readiness?.personnel ?? [];
  if (workers.length === 0) {
    return false;
  }

  const attended = new Set(
    (talk.participants ?? [])
      .filter((participant) => participant.attendance === "ATTENDED")
      .map(personReferenceKey)
      .filter((key): key is string => key !== null),
  );

  return workers.every((worker) => {
    const key = personReferenceKey(worker);
    return key !== null && attended.has(key);
  });
}

function requirementIdsInMappingOrder(ids: ReadonlySet<string>): string[] {
  return A03_REQUIREMENT_MAPPINGS.map((mapping) => mapping.id).filter((id) =>
    ids.has(id),
  );
}

function blockedRequirement(mapping: A03RequirementMapping): boolean {
  return mapping.blockedBy.length > 0 || mapping.enforcement === "BLOCKED";
}

/**
 * Builds readiness facts from the permit's actual fields and the readiness
 * data captured for it. The builder never upgrades a declaration into proof:
 * authoritative fields are reported as automatic, manually captured records
 * as recorded, open organizational decisions remain blocked, and a
 * NOT_APPLICABLE declaration is reported separately without becoming true.
 */
export function buildPermitReadinessFacts(
  input: PermitReadinessFactsInput,
): PermitReadinessFactsBuilderResult {
  const permit = input.permit;
  const readiness = permit.readiness ?? null;

  const projectId = idOf(permit.project);
  const siteId = idOf(permit.site);
  const validFrom = timeOf(permit.validFrom);
  const validTo = timeOf(permit.validTo);

  const automatic = new Set<string>();
  const recorded = new Set<string>();
  const notApplicable = new Set<string>();
  const facts: Record<string, boolean> = {};

  const mappingsById = new Map(
    A03_REQUIREMENT_MAPPINGS.map((mapping) => [mapping.id, mapping]),
  );
  const blocked = new Set(
    A03_REQUIREMENT_MAPPINGS.filter(blockedRequirement).map(
      (mapping) => mapping.id,
    ),
  );

  function satisfyAutomatically(requirementId: string): void {
    if (blocked.has(requirementId) || !mappingsById.has(requirementId)) {
      return;
    }

    automatic.add(requirementId);
    recorded.delete(requirementId);
    notApplicable.delete(requirementId);
    facts[requirementId] = true;
  }

  function satisfyFromRecordedData(requirementId: string): void {
    if (
      blocked.has(requirementId) ||
      automatic.has(requirementId) ||
      !mappingsById.has(requirementId)
    ) {
      return;
    }

    recorded.add(requirementId);
    notApplicable.delete(requirementId);
    facts[requirementId] = true;
  }

  // --- Existing Permit fields -------------------------------------------------

  if (
    hasText(permit.workDescription) &&
    hasText(permit.workType) &&
    projectId !== null &&
    siteId !== null &&
    hasText(permit.location) &&
    validFrom !== null &&
    validTo !== null &&
    validTo > validFrom
  ) {
    satisfyAutomatically("scope_and_permit_type");
  }

  if (
    isIdentifier(permit.responsiblePerson) &&
    hasItems(permit.workersInvolved)
  ) {
    satisfyAutomatically("people_defined");
  }

  const hazards = permit.hazards ?? [];
  if (
    hazards.length > 0 &&
    hazards.every(
      (hazard) => hasText(hazard.hazard) && hasText(hazard.controlMeasures),
    )
  ) {
    satisfyAutomatically("hazards_and_controls");
  }

  if (
    isIdentifier(permit.approvedBy) &&
    timeOf(permit.approvedAt) !== null &&
    idOf(permit.approvedBy) !== idOf(permit.createdBy) &&
    idOf(permit.approvedBy) !== idOf(permit.responsiblePerson) &&
    idOf(permit.approvedBy) !== idOf(permit.submittedBy)
  ) {
    satisfyAutomatically("independent_approval");
  }

  if (
    validFrom !== null &&
    validTo !== null &&
    validTo > validFrom
  ) {
    satisfyAutomatically("validity_window");
  }

  if (
    isIdentifier(permit.createdBy) &&
    timeOf(permit.createdAt) !== null &&
    timeOf(permit.updatedAt) !== null
  ) {
    satisfyAutomatically("records_attributable");
  }

  const currentRiskAssessment = (input.riskAssessments ?? []).some(
    (assessment) =>
      isCurrentApprovedRiskAssessment(assessment, projectId, siteId),
  );

  if (currentRiskAssessment) {
    satisfyAutomatically("current_risk_assessment");
  }

  const toolboxTalk = input.toolboxTalk ?? null;
  if (
    toolboxTalk !== null &&
    toolboxTalkBriefsCapturedWorkers(
      toolboxTalk,
      readiness,
      projectId,
      siteId,
    )
  ) {
    satisfyAutomatically("worker_briefing");
  }

  const closureChecks = permit.closureChecks ?? null;
  if (
    closureChecks?.workAreaSecured === true &&
    closureChecks.personnelAccountedFor === true &&
    closureChecks.equipmentIsolated === true &&
    closureChecks.siteHandoverCompleted === true &&
    (isIdentifier(permit.closedBy) || permit.status === "CLOSED")
  ) {
    satisfyAutomatically("closeout_and_handback");
  }

  const links = readiness?.links ?? null;

  // Equipment/PPE readiness needs both an inspection for the recorded
  // equipment/tooling and current PPE evidence; one alone does not confirm the
  // A03 requirement.
  const linkedInspectionIds = new Set(
    [
      ...(links?.inspectionIds ?? []),
      ...(readiness?.equipment ?? []).map(
        (equipment) => equipment.inspection,
      ),
    ]
      .map(idOf)
      .filter((id): id is string => id !== null),
  );
  const completedInspections = (input.inspections ?? []).filter(
    (inspection) => {
      const inspectionId = idOf(inspection._id);
      return (
        inspectionId !== null &&
        linkedInspectionIds.has(inspectionId) &&
        inspection.status === "COMPLETED" &&
        matchesProjectAndSite(inspection, projectId, siteId)
      );
    },
  );
  const linkedPpeIds = new Set(
    (links?.ppeIssuanceIds ?? [])
      .map(idOf)
      .filter((id): id is string => id !== null),
  );
  const issuedPpe = (input.ppeIssuances ?? []).filter((issuance) => {
    const issuanceId = idOf(issuance._id);
    return (
      issuanceId !== null &&
      linkedPpeIds.has(issuanceId) &&
      issuance.status === "ISSUED" &&
      matchesProjectAndSite(issuance, projectId, siteId)
    );
  });

  if (completedInspections.length > 0 && issuedPpe.length > 0) {
    satisfyAutomatically("equipment_ppe_inspection");
  }

  // Verified corrective actions are linked for traceability, but they do not
  // establish residual-risk acceptance. The acceptance record and its
  // authorization remain a later phase; until then the fact is never true.

  // --- Captured readiness records --------------------------------------------

  if (hasItems(readiness?.personnel)) {
    satisfyFromRecordedData("people_defined");
  }

  if (hasItems(readiness?.equipment)) {
    satisfyFromRecordedData("equipment_defined");
  }

  if (hasItems(readiness?.isolations)) {
    satisfyFromRecordedData("isolation_records");
  }

  if (hasItems(readiness?.gasTests)) {
    satisfyFromRecordedData("gas_test_records");
  }

  const linkedContractorIds = new Set(
    (links?.contractorIds ?? [])
      .map(idOf)
      .filter((id): id is string => id !== null),
  );
  const contractorsById = new Map<string, PermitReadinessFactContractor>();
  for (const contractor of input.contractors ?? []) {
    const contractorId = idOf(contractor._id);
    if (contractorId !== null) {
      contractorsById.set(contractorId, contractor);
    }
  }

  const linkedContractorsValid =
    linkedContractorIds.size > 0 &&
    projectId !== null &&
    [...linkedContractorIds].every((contractorId) => {
      const contractor = contractorsById.get(contractorId);

      return (
        contractor !== undefined &&
        contractor.isActive === true &&
        (contractor.projects ?? []).some(
          (project) => idOf(project) === projectId,
        )
      );
    });

  if (linkedContractorsValid) {
    satisfyFromRecordedData("contractor_simops_coordination");
  }

  const worksiteVerification = readiness?.worksiteVerification ?? null;
  if (
    worksiteVerification !== null &&
    (isIdentifier(worksiteVerification.verifiedBy) ||
      timeOf(worksiteVerification.verifiedAt) !== null)
  ) {
    satisfyFromRecordedData("worksite_verification");
  }

  // --- Declarations ----------------------------------------------------------

  const latestAttestations = new Map<string, "SATISFIED" | "NOT_APPLICABLE">();

  for (const attestation of readiness?.attestations ?? []) {
    if (
      typeof attestation.requirementId !== "string" ||
      (attestation.state !== "SATISFIED" &&
        attestation.state !== "NOT_APPLICABLE")
    ) {
      continue;
    }

    const mapping = mappingsById.get(attestation.requirementId);

    if (!mapping) {
      // Unknown requirement ids are ignored rather than invented as facts.
      continue;
    }

    latestAttestations.set(attestation.requirementId, attestation.state);
  }

  for (const mapping of A03_REQUIREMENT_MAPPINGS) {
    const state = latestAttestations.get(mapping.id);

    if (!state) {
      continue;
    }

    if (blockedRequirement(mapping)) {
      // A declaration cannot resolve an open organizational decision.
      facts[mapping.id] = false;
      continue;
    }

    if (automatic.has(mapping.id) || recorded.has(mapping.id)) {
      // Captured or authoritative evidence wins over a later declaration.
      continue;
    }

    if (state === "SATISFIED" && permitReadinessRequiresEvidence(mapping.id)) {
      // A declaration cannot substitute for the required recorded evidence.
      facts[mapping.id] = false;
      continue;
    }

    if (state === "NOT_APPLICABLE") {
      if (mapping.type !== "CONDITIONAL") {
        // Only conditional requirements may be declared not applicable.
        continue;
      }

      notApplicable.add(mapping.id);
      facts[mapping.id] = false;
      continue;
    }

    recorded.add(mapping.id);
    facts[mapping.id] = true;
  }

  return {
    facts,
    automatic: requirementIdsInMappingOrder(automatic),
    recorded: requirementIdsInMappingOrder(recorded),
    blocked: requirementIdsInMappingOrder(blocked),
    notApplicable: requirementIdsInMappingOrder(notApplicable),
  };
}
