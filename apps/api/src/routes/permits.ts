import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import {
  Types,
  type ClientSession,
  type HydratedDocument,
} from "mongoose";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
  parsePagination,
} from "../lib/validation/common.js";
import {
  createPermitSchema,
  updatePermitSchema,
  updatePermitStatusSchema,
  permitReadinessSchema,
  type PermitReadinessAttestationInput,
  type PermitReadinessEquipmentInput,
  type PermitReadinessPersonnelInput,
  type UpdatePermitReadinessInput,
} from "../lib/validation/permit.js";
import {
  canTransitionPermitStatus,
  isPermitResponsibleRole,
  isPermitStatus,
  isPermitToWorkType,
  PERMIT_RESPONSIBLE_ROLES,
  type PermitStatus,
} from "../lib/hse-constants.js";
import { canCreatePermits } from "../lib/hse-permissions.js";
import { activePermitPolicyVersion } from "../lib/permit-readiness.js";
import { loadPermitReadinessEvaluation } from "../lib/permit-readiness-evaluation.js";
import { assertSiteAccess, isSiteAssigned } from "../lib/site-access.js";
import {
  assertPermitAccess,
  canActivatePermit,
  canApprovePermit,
  canCancelPermit,
  canClosePermit,
  canEditPermit,
  canRecordPermitReadiness,
  canResumePermit,
  canSubmitPermit,
  canSuspendPermit,
  permitScopeFilter,
} from "../lib/permit-access.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import {
  permitAuditSnapshot,
  permitReadinessAuditSnapshot,
} from "../lib/audit-snapshots.js";
import { getA03RequirementMapping } from "../lib/permit-readiness-a03.js";
import { permitReadinessRequiresEvidence } from "../lib/permit-readiness-facts.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { Permit, type PermitDocument } from "../models/Permit.js";
import { Project } from "../models/Project.js";
import { RiskAssessment } from "../models/RiskAssessment.js";
import { Site } from "../models/Site.js";
import { User } from "../models/User.js";
import { ContractorPersonnel } from "../models/ContractorPersonnel.js";
import { Attachment } from "../models/Attachment.js";
import { Inspection } from "../models/Inspection.js";
import { PpeIssuance } from "../models/PpeIssuance.js";
import { CorrectiveAction } from "../models/CorrectiveAction.js";
import { Contractor } from "../models/Contractor.js";
import { ToolboxTalk } from "../models/ToolboxTalk.js";
import { toPermitDetail, toPermitSummary } from "../serializers/permit.js";

const router: Router = Router();

const PERMIT_POPULATE = [
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "responsiblePerson", select: "firstName lastName" },
  { path: "submittedBy", select: "firstName lastName" },
  { path: "approvedBy", select: "firstName lastName" },
  { path: "rejectedBy", select: "firstName lastName" },
  { path: "activatedBy", select: "firstName lastName" },
  { path: "suspendedBy", select: "firstName lastName" },
  { path: "resumedBy", select: "firstName lastName" },
  { path: "cancelledBy", select: "firstName lastName" },
  { path: "closedBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
];

// Linked risk assessments are only expanded on individual permit responses.
// The list endpoint deliberately uses PERMIT_POPULATE instead.
const PERMIT_DETAIL_POPULATE = [
  ...PERMIT_POPULATE,
  {
    path: "riskAssessments",
    select: "title revision status supersededBy project site owner",
    populate: [
      { path: "project", select: "name" },
      { path: "site", select: "name code" },
      { path: "owner", select: "firstName lastName" },
    ],
  },
];

// Every permit route requires an authenticated, active IKOSH employee with at
// least read access to the register.
router.use(requireAuth(digitAuth), attachIkoshUser);
router.use(
  requireIkoshRole("ADMIN", "HSE_MANAGER", "HSE_OFFICER", "SUPERVISOR"),
);

/**
 * Resolves and validates the project/site pair. Permits are always site-bound:
 * the site must exist, be active and belong to the selected project.
 */
async function resolvePermitProjectAndSite(
  session: ClientSession,
  projectId: string,
  siteId: string,
): Promise<{
  project: Types.ObjectId;
  site: Types.ObjectId;
}> {
  const project = await Project.findById(projectId).session(session);

  if (!project) {
    throw new HttpError(404, "Specified project was not found.");
  }

  const site = await Site.findById(siteId).session(session);

  if (!site) {
    throw new HttpError(404, "Specified site was not found.");
  }

  if (String(site.project) !== String(project._id)) {
    throw new HttpError(
      409,
      "The selected site does not belong to the selected project.",
    );
  }

  if (site.status !== "ACTIVE") {
    throw new HttpError(
      409,
      "Permits can only be raised against an active site.",
    );
  }

  return { project: project._id, site: site._id };
}

function uniqueRiskAssessmentIds(
  ids: readonly string[] | undefined,
): Types.ObjectId[] {
  const seen = new Set<string>();
  const unique: Types.ObjectId[] = [];

  for (const id of ids ?? []) {
    const objectId = new Types.ObjectId(id);
    const key = String(objectId);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(objectId);
  }

  return unique;
}

/**
 * Newly linked risk assessments must be current approvals on the exact permit
 * project and site. Existing links are validated by the caller against only
 * the IDs being added, so superseded historical references remain intact.
 */
async function assertRiskAssessmentLinksValid(
  session: ClientSession,
  ids: Types.ObjectId[],
  project: Types.ObjectId,
  site: Types.ObjectId,
  context: "linked" | "newly linked",
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const linkedAssessments = await RiskAssessment.find({
    _id: { $in: ids },
    project,
    site,
    status: "APPROVED",
    $or: [{ supersededBy: null }, { supersededBy: { $exists: false } }],
  }).session(session);

  if (linkedAssessments.length !== ids.length) {
    throw new HttpError(
      409,
      `One or more ${context} risk assessments are not approved, current, or do not belong to this exact project and site.`,
    );
  }
}

/**
 * The responsible person must be an active employee with a permit-eligible
 * IKOSH role and access to the permit's site. HSE management is site-wide;
 * everyone else needs an explicit site assignment.
 */
async function assertPermitResponsiblePerson(
  personId: string,
  siteId: unknown,
  session: ClientSession,
): Promise<void> {
  const person = await User.findById(personId).session(session);

  if (
    !person ||
    !person.isActive ||
    !isPermitResponsibleRole(person.ikoshRole)
  ) {
    throw new HttpError(
      400,
      "Responsible person must be an active supervisor, HSE officer, manager or admin.",
    );
  }

  if (!isSiteAssigned(person, siteId)) {
    throw new HttpError(
      400,
      "Responsible person is not authorised for the selected site.",
    );
  }
}

/**
 * Site and responsible-person checks repeated at approval and activation so a
 * permit cannot start work after the site was closed or the responsible person
 * became inactive or lost site access.
 */
async function assertPermitReadyForWork(
  permit: { site: unknown; responsiblePerson: unknown },
  session: ClientSession,
): Promise<void> {
  const site = await Site.findById(permit.site).session(session);

  if (!site) {
    throw new HttpError(409, "The permit's site no longer exists.");
  }

  if (site.status !== "ACTIVE") {
    throw new HttpError(
      409,
      "The permit's site is no longer active, so work cannot start.",
    );
  }

  await assertPermitResponsiblePerson(
    String(permit.responsiblePerson),
    site._id,
    session,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWithinValidity(
  permit: { validFrom: Date; validTo: Date },
  now: number,
): boolean {
  return now >= permit.validFrom.getTime() && now <= permit.validTo.getTime();
}

type PermitReadinessSubdocument = NonNullable<PermitDocument["readiness"]>;

interface ReadinessPersonnelWrite {
  kind: "EMPLOYEE" | "CONTRACTOR";
  employee: Types.ObjectId | null;
  contractorPersonnel: Types.ObjectId | null;
  contractor: Types.ObjectId | null;
  name: string;
  role: string | null;
  notes: string | null;
  attendance: "INVITED" | "ATTENDED" | "ABSENT";
}

interface ReadinessEquipmentWrite {
  name: string;
  reference: string | null;
  inspection: Types.ObjectId | null;
  condition: string | null;
}

function referenceId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && "_id" in value) {
    const id = (value as { _id: unknown })._id;
    return id === null || id === undefined ? null : String(id);
  }

  return String(value);
}

function uniqueObjectIds(ids: readonly string[] | undefined): Types.ObjectId[] {
  const seen = new Set<string>();
  const unique: Types.ObjectId[] = [];

  for (const id of ids ?? []) {
    const objectId = new Types.ObjectId(id);
    const key = String(objectId);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(objectId);
  }

  return unique;
}

function toReadinessPersonnel(
  personnel: PermitReadinessPersonnelInput,
): ReadinessPersonnelWrite {
  return {
    kind: personnel.kind,
    employee: personnel.employee
      ? new Types.ObjectId(personnel.employee)
      : null,
    contractorPersonnel: personnel.contractorPersonnel
      ? new Types.ObjectId(personnel.contractorPersonnel)
      : null,
    contractor: personnel.contractor
      ? new Types.ObjectId(personnel.contractor)
      : null,
    name: personnel.name,
    role: personnel.role ?? null,
    notes: personnel.notes ?? null,
    attendance: personnel.attendance ?? "INVITED",
  };
}

function toReadinessEquipment(
  equipment: PermitReadinessEquipmentInput,
): ReadinessEquipmentWrite {
  return {
    name: equipment.name,
    reference: equipment.reference ?? null,
    inspection: equipment.inspection
      ? new Types.ObjectId(equipment.inspection)
      : null,
    condition: equipment.condition ?? null,
  };
}

function emptyReadinessLinks(): {
  inspectionIds: Types.ObjectId[];
  ppeIssuanceIds: Types.ObjectId[];
  correctiveActionIds: Types.ObjectId[];
  contractorIds: Types.ObjectId[];
  toolboxTalkId: Types.ObjectId | null;
} {
  return {
    inspectionIds: [],
    ppeIssuanceIds: [],
    correctiveActionIds: [],
    contractorIds: [],
    toolboxTalkId: null,
  };
}

function ensurePermitReadiness(
  permit: HydratedDocument<PermitDocument>,
): PermitReadinessSubdocument {
  if (!permit.readiness) {
    permit.set("readiness", {
      personnel: [],
      equipment: [],
      isolations: [],
      gasTests: [],
      links: emptyReadinessLinks(),
      worksiteVerification: null,
      worksiteVerificationHistory: [],
      attestations: [],
    });
  }

  if (!permit.readiness) {
    throw new Error("Permit readiness could not be initialized.");
  }

  return permit.readiness;
}

async function assertReadinessAttachment(
  session: ClientSession,
  attachmentId: string,
  permitId: Types.ObjectId,
): Promise<void> {
  const attachment = await Attachment.findById(attachmentId).session(session);

  if (!attachment) {
    throw new HttpError(409, `Attachment ${attachmentId} was not found.`);
  }

  if (
    attachment.entityType !== "permit" ||
    !attachment.entityId ||
    String(attachment.entityId) !== String(permitId)
  ) {
    throw new HttpError(
      409,
      `Attachment ${attachmentId} is not linked to this permit.`,
    );
  }
}

async function assertReadinessInspection(
  session: ClientSession,
  inspectionId: string,
  projectId: Types.ObjectId,
  siteId: Types.ObjectId,
  context: string,
): Promise<void> {
  const inspection = await Inspection.findById(inspectionId).session(session);

  if (!inspection) {
    throw new HttpError(409, `${context} ${inspectionId} was not found.`);
  }

  if (
    String(inspection.project) !== String(projectId) ||
    String(inspection.site) !== String(siteId)
  ) {
    throw new HttpError(
      409,
      `${context} ${inspectionId} does not belong to this permit's project and site.`,
    );
  }

  // Inspections are completed, not approved. APPROVED is not an inspection
  // status in this application.
  if (inspection.status !== "COMPLETED") {
    throw new HttpError(
      409,
      `${context} ${inspectionId} is not completed.`,
    );
  }
}

async function assertReadinessContractor(
  session: ClientSession,
  contractorId: string,
  projectId: Types.ObjectId,
): Promise<string> {
  const contractor = await Contractor.findById(contractorId).session(session);

  if (!contractor) {
    throw new HttpError(409, `Contractor ${contractorId} was not found.`);
  }

  if (!contractor.isActive) {
    throw new HttpError(409, `Contractor ${contractorId} is not active.`);
  }

  const engagedProjectIds = (contractor.projects ?? []).map(referenceId);
  if (!engagedProjectIds.includes(String(projectId))) {
    throw new HttpError(
      409,
      `Contractor ${contractorId} is not engaged on this permit's project.`,
    );
  }

  return String(contractor._id);
}

async function assertReadinessPersonnel(
  session: ClientSession,
  personnel: PermitReadinessPersonnelInput,
  projectId: Types.ObjectId,
  siteId: Types.ObjectId,
): Promise<void> {
  if (personnel.kind === "EMPLOYEE") {
    if (!personnel.employee) {
      throw new HttpError(
        400,
        "An employee reference is required for employee personnel.",
      );
    }

    const employee = await User.findById(personnel.employee).session(session);

    if (!employee || !employee.isActive) {
      throw new HttpError(
        409,
        `Employee ${personnel.employee} is not an active user.`,
      );
    }

    return;
  }

  if (!personnel.contractorPersonnel) {
    throw new HttpError(
      400,
      "A contractor personnel reference is required for contractor personnel.",
    );
  }

  const contractorPersonnel = await ContractorPersonnel.findById(
    personnel.contractorPersonnel,
  ).session(session);

  if (!contractorPersonnel) {
    throw new HttpError(
      409,
      `Contractor personnel ${personnel.contractorPersonnel} was not found.`,
    );
  }

  if (!contractorPersonnel.isActive) {
    throw new HttpError(
      409,
      `Contractor personnel ${personnel.contractorPersonnel} is not active.`,
    );
  }

  if (
    contractorPersonnel.site &&
    String(contractorPersonnel.site) !== String(siteId)
  ) {
    throw new HttpError(
      409,
      `Contractor personnel ${personnel.contractorPersonnel} is not deployed to this permit's site.`,
    );
  }

  if (
    personnel.contractor &&
    String(personnel.contractor) !== String(contractorPersonnel.contractor)
  ) {
    throw new HttpError(
      409,
      `Contractor ${personnel.contractor} does not match the contractor personnel record.`,
    );
  }

  await assertReadinessContractor(
    session,
    personnel.contractor ?? String(contractorPersonnel.contractor),
    projectId,
  );
}

function assertReadinessAttestation(
  attestation: PermitReadinessAttestationInput,
): void {
  const mapping = getA03RequirementMapping(attestation.requirementId);

  if (!mapping) {
    throw new HttpError(
      400,
      `Unknown readiness requirement "${attestation.requirementId}".`,
    );
  }

  if (
    mapping.blockedBy.length > 0 ||
    mapping.enforcement === "BLOCKED"
  ) {
    throw new HttpError(
      409,
      `Requirement "${mapping.id}" is blocked by an open organizational decision and cannot be attested.`,
    );
  }

  if (
    attestation.state === "NOT_APPLICABLE" &&
    mapping.type !== "CONDITIONAL"
  ) {
    throw new HttpError(
      400,
      `Only conditional requirements may be declared not applicable.`,
    );
  }

  if (
    attestation.state === "SATISFIED" &&
    permitReadinessRequiresEvidence(mapping.id)
  ) {
    throw new HttpError(
      409,
      `Requirement "${mapping.id}" requires recorded evidence and cannot be attested.`,
    );
  }
}

async function assertIncomingReadinessReferences(
  session: ClientSession,
  permit: HydratedDocument<PermitDocument>,
  input: UpdatePermitReadinessInput,
): Promise<void> {
  const projectId = new Types.ObjectId(String(permit.project));
  const siteId = new Types.ObjectId(String(permit.site));
  const permitId = new Types.ObjectId(String(permit._id));

  for (const equipment of input.equipment ?? []) {
    if (equipment.inspection) {
      await assertReadinessInspection(
        session,
        equipment.inspection,
        projectId,
        siteId,
        "Equipment inspection",
      );
    }
  }

  for (const isolation of input.isolations ?? []) {
    for (const attachmentId of isolation.attachmentIds) {
      await assertReadinessAttachment(session, attachmentId, permitId);
    }
  }

  for (const gasTest of input.gasTests ?? []) {
    for (const attachmentId of gasTest.attachmentIds) {
      await assertReadinessAttachment(session, attachmentId, permitId);
    }
  }

  if (input.links) {
    for (const inspectionId of input.links.inspectionIds ?? []) {
      await assertReadinessInspection(
        session,
        inspectionId,
        projectId,
        siteId,
        "Linked inspection",
      );
    }

    for (const ppeId of input.links.ppeIssuanceIds ?? []) {
      const issuance = await PpeIssuance.findById(ppeId).session(session);

      if (!issuance) {
        throw new HttpError(409, `PPE issuance ${ppeId} was not found.`);
      }

      if (
        String(issuance.project) !== String(projectId) ||
        String(issuance.site) !== String(siteId)
      ) {
        throw new HttpError(
          409,
          `PPE issuance ${ppeId} does not belong to this permit's project and site.`,
        );
      }

      if (issuance.status !== "ISSUED") {
        throw new HttpError(
          409,
          `PPE issuance ${ppeId} is not currently issued.`,
        );
      }
    }

    for (const actionId of input.links.correctiveActionIds ?? []) {
      const action = await CorrectiveAction.findById(actionId).session(
        session,
      );

      if (!action) {
        throw new HttpError(
          409,
          `Corrective action ${actionId} was not found.`,
        );
      }

      if (
        String(action.project) !== String(projectId) ||
        String(action.site) !== String(siteId)
      ) {
        throw new HttpError(
          409,
          `Corrective action ${actionId} does not belong to this permit's project and site.`,
        );
      }

      if (action.status !== "VERIFIED") {
        throw new HttpError(
          409,
          `Corrective action ${actionId} is not verified.`,
        );
      }
    }

    for (const contractorId of input.links.contractorIds ?? []) {
      await assertReadinessContractor(session, contractorId, projectId);
    }

    if (input.links.toolboxTalkId) {
      const toolboxTalk = await ToolboxTalk.findById(
        input.links.toolboxTalkId,
      ).session(session);

      if (!toolboxTalk) {
        throw new HttpError(
          409,
          `Toolbox talk ${input.links.toolboxTalkId} was not found.`,
        );
      }

      if (
        String(toolboxTalk.project) !== String(projectId) ||
        String(toolboxTalk.site) !== String(siteId)
      ) {
        throw new HttpError(
          409,
          `Toolbox talk ${input.links.toolboxTalkId} does not belong to this permit's project and site.`,
        );
      }

      if (toolboxTalk.status !== "COMPLETED") {
        throw new HttpError(
          409,
          `Toolbox talk ${input.links.toolboxTalkId} is not completed.`,
        );
      }
    }
  }

  for (const personnel of input.personnel ?? []) {
    await assertReadinessPersonnel(
      session,
      personnel,
      projectId,
      siteId,
    );
  }

  const worksiteVerification = input.worksiteVerification ?? null;
  if (worksiteVerification) {
    for (const attachmentId of worksiteVerification.attachmentIds ?? []) {
      await assertReadinessAttachment(session, attachmentId, permitId);
    }
  }

  for (const attestation of input.attestations ?? []) {
    assertReadinessAttestation(attestation);

    for (const attachmentId of attestation.attachmentIds ?? []) {
      await assertReadinessAttachment(session, attachmentId, permitId);
    }
  }
}

// Eligible responsible people for the permit form. When a site is supplied,
// only people authorised for that site are returned so the client cannot offer
// an assignment the API will reject.
router.get("/assignees", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;

  if (siteId !== undefined && !Types.ObjectId.isValid(siteId)) {
    throw new HttpError(400, "Invalid site id.");
  }

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const filter: Record<string, unknown> = {
    isActive: true,
    ikoshRole: { $in: [...PERMIT_RESPONSIBLE_ROLES] },
  };

  if (siteId) {
    filter.$or = [
      { ikoshRole: { $in: ["HSE_MANAGER", "ADMIN"] } },
      { assignedSites: new Types.ObjectId(siteId) },
    ];
  }

  const users = await User.find(filter)
    .select("firstName lastName ikoshRole")
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  res.status(200).json({
    success: true,
    assignees: users.map((user) => ({
      id: String(user._id),
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      ikoshRole: user.ikoshRole,
    })),
  });
});

// Permit register. HSE management sees everything; other HSE roles see permits
// at their assigned sites plus permits they created or are responsible for.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const workType =
    typeof req.query.workType === "string" ? req.query.workType : undefined;
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const responsiblePersonId =
    typeof req.query.responsiblePersonId === "string"
      ? req.query.responsiblePersonId
      : undefined;
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;

  if (status !== undefined && !isPermitStatus(status)) {
    throw new HttpError(400, "Invalid permit status.");
  }

  if (workType !== undefined && !isPermitToWorkType(workType)) {
    throw new HttpError(400, "Invalid permit work type.");
  }

  for (const [label, value] of [
    ["project", projectId],
    ["site", siteId],
    ["responsible person", responsiblePersonId],
  ] as const) {
    if (value !== undefined && !Types.ObjectId.isValid(value)) {
      throw new HttpError(400, `Invalid ${label} id.`);
    }
  }

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const search = rawSearch?.trim();

  if (search && search.length > 200) {
    throw new HttpError(400, "Search text is too long.");
  }

  const conditions: Record<string, unknown>[] = [];
  const scope = permitScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (status) conditions.push({ status });
  if (workType) conditions.push({ workType });
  if (projectId) conditions.push({ project: new Types.ObjectId(projectId) });
  if (siteId) conditions.push({ site: new Types.ObjectId(siteId) });
  if (responsiblePersonId) {
    conditions.push({
      responsiblePerson: new Types.ObjectId(responsiblePersonId),
    });
  }

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    conditions.push({
      $or: [{ workDescription: pattern }, { location: pattern }],
    });
  }

  const filter =
    conditions.length > 0
      ? { $and: conditions }
      : ({} as Record<string, unknown>);

  const { page, limit, skip } = parsePagination(req.query);

  const [total, permits] = await Promise.all([
    Permit.countDocuments(filter),
    Permit.find(filter)
      .sort({ validFrom: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(PERMIT_POPULATE)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    permits: permits.map((permit) => toPermitSummary(permit)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Create a draft permit. The site is mandatory, active and project-bound; the
// responsible person must be active and authorised for that site.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canCreatePermits(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to create permits.");
  }

  const parsed = createPermitSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;

  assertSiteAccess(viewer, data.siteId);

  const permit = await runAuditedMutation(viewer._id, async (session) => {
    const resolved = await resolvePermitProjectAndSite(
      session,
      data.projectId,
      data.siteId,
    );

    const riskAssessmentIds = uniqueRiskAssessmentIds(
      data.riskAssessmentIds,
    );

    if (riskAssessmentIds.length > 10) {
      throw new HttpError(
        400,
        "A permit cannot be linked to more than 10 risk assessments.",
      );
    }

    await assertRiskAssessmentLinksValid(
      session,
      riskAssessmentIds,
      resolved.project,
      resolved.site,
      "linked",
    );

    await assertPermitResponsiblePerson(
      data.responsiblePersonId,
      resolved.site,
      session,
    );

    const created = new Permit({
      workDescription: data.workDescription,
      riskAssessments: riskAssessmentIds,
      workType: data.workType,
      status: "DRAFT",
      // Stamped once, at creation. Never recomputed by later edits.
      policyVersion: activePermitPolicyVersion(),
      project: resolved.project,
      site: resolved.site,
      location: data.location ?? "",
      validFrom: data.validFrom,
      validTo: data.validTo,
      responsiblePerson: new Types.ObjectId(data.responsiblePersonId),
      workersInvolved: data.workersInvolved,
      requiredPrecautions: data.requiredPrecautions,
      hazards: data.hazards,
      createdBy: viewer._id,
    });

    await created.save({ session });

    return {
      result: created,
      audit: {
        action: "permit.created",
        entityType: "Permit",
        entityId: created._id,
        after: permitAuditSnapshot(created),
      },
    };
  });

  await permit.populate(PERMIT_DETAIL_POPULATE);

  res.status(201).json({
    success: true,
    permit: toPermitDetail(permit),
  });
});

// Read one permit. Out-of-scope permits return 404 so existence is not leaked
// to non-management users.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const permitId = parseObjectIdParam(req.params.id, "permit");

  const permit = await Permit.findById(permitId).populate(
    PERMIT_DETAIL_POPULATE,
  );

  if (!permit) {
    throw new HttpError(404, "Permit not found.");
  }

  assertPermitAccess(viewer, permit);

  // Read-only A03 visibility. Evaluation happens after authorization and only
  // uses records linked to this permit; it never gates the response.
  const readinessEvaluation = await loadPermitReadinessEvaluation(permit);

  res.status(200).json({
    success: true,
    permit: toPermitDetail(permit, { readinessEvaluation }),
  });
});

// Edit DRAFT permit content. Status and workflow fields are absent from the
// update schema and can only be changed through `/:id/status`.
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const permitId = parseObjectIdParam(req.params.id, "permit");

  if (!canCreatePermits(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to edit permits.");
  }

  const parsed = updatePermitSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;

  const permit = await runAuditedMutation(viewer._id, async (session) => {
    const permit = await Permit.findById(permitId).session(session);

    if (!permit) {
      throw new HttpError(404, "Permit not found.");
    }

    assertPermitAccess(viewer, permit);

    if (!canEditPermit(viewer, permit)) {
      throw new HttpError(
        403,
        "Only the creator, responsible person or HSE management can edit a draft permit.",
      );
    }

    const before = permitAuditSnapshot(permit);

    const projectId = data.projectId ?? String(permit.project);
    const siteId = data.siteId ?? String(permit.site);

    const resolved = await resolvePermitProjectAndSite(
      session,
      projectId,
      siteId,
    );

    let riskAssessmentIds: Types.ObjectId[] | undefined;

    if (data.riskAssessmentIds !== undefined) {
      const uniqueIds = uniqueRiskAssessmentIds(data.riskAssessmentIds);

      if (uniqueIds.length > 10) {
        throw new HttpError(
          400,
          "A permit cannot be linked to more than 10 risk assessments.",
        );
      }

      // Existing links remain valid historical references, even if
      // their assessments have since been superseded.
      const existingIds = new Set(
        (permit.riskAssessments ?? []).map((id) => String(id)),
      );

      // Only newly added links must pass the current approval checks.
      const newlyLinkedIds = uniqueIds.filter(
        (id) => !existingIds.has(String(id)),
      );

      await assertRiskAssessmentLinksValid(
        session,
        newlyLinkedIds,
        resolved.project,
        resolved.site,
        "newly linked",
      );

      riskAssessmentIds = uniqueIds;
    }

    const responsiblePersonId =
      data.responsiblePersonId ?? String(permit.responsiblePerson);

    await assertPermitResponsiblePerson(
      responsiblePersonId,
      resolved.site,
      session,
    );

    const validFrom = data.validFrom ?? permit.validFrom;
    const validTo = data.validTo ?? permit.validTo;

    if (validTo.getTime() <= validFrom.getTime()) {
      throw new HttpError(400, "Validity must end after it starts.");
    }

    if (data.workDescription !== undefined) {
      permit.workDescription = data.workDescription;
    }
    if (data.workType !== undefined) {
      permit.workType = data.workType;
    }
    if (data.location !== undefined) {
      permit.location = data.location;
    }
    if (data.validFrom !== undefined) {
      permit.validFrom = data.validFrom;
    }
    if (data.validTo !== undefined) {
      permit.validTo = data.validTo;
    }
    if (data.workersInvolved !== undefined) {
      permit.workersInvolved = data.workersInvolved;
    }
    if (data.requiredPrecautions !== undefined) {
      permit.requiredPrecautions = data.requiredPrecautions;
    }
    if (data.hazards !== undefined) {
      permit.hazards = data.hazards as typeof permit.hazards;
    }

    // Update risk assessments if provided
    if (riskAssessmentIds !== undefined) {
      permit.riskAssessments = riskAssessmentIds;
    }

    permit.project = resolved.project;
    permit.site = resolved.site;
    permit.responsiblePerson = new Types.ObjectId(responsiblePersonId);

    await permit.save({ session });

    return {
      result: permit,
      audit: {
        action: "permit.updated",
        entityType: "Permit",
        entityId: permit._id,
        before,
        after: permitAuditSnapshot(permit),
      },
    };
  });

  await permit.populate(PERMIT_DETAIL_POPULATE);

  res.status(200).json({
    success: true,
    permit: toPermitDetail(permit),
  });
});

// Progress the permit lifecycle. Every action has its own authorization rule;
// activation and resumption are additionally bounded by the validity window.
router.patch(
  "/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const permitId = parseObjectIdParam(req.params.id, "permit");

    const parsed = updatePermitStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const nextStatus = parsed.data.status;

    const permit = await runAuditedMutation(viewer._id, async (session) => {
      const permit = await Permit.findById(permitId).session(session);

      if (!permit) {
        throw new HttpError(404, "Permit not found.");
      }

      assertPermitAccess(viewer, permit);

      if (
        !canTransitionPermitStatus(permit.status as PermitStatus, nextStatus)
      ) {
        throw new HttpError(
          409,
          `Invalid status transition from ${permit.status} to ${nextStatus}.`,
        );
      }

      const before = permitAuditSnapshot(permit);
      const now = Date.now();

      if (nextStatus === "SUBMITTED") {
        if (!canSubmitPermit(viewer, permit)) {
          throw new HttpError(
            403,
            "Only the creator, responsible person or HSE management can submit this permit.",
          );
        }

        permit.submittedBy = viewer._id;
        permit.submittedAt = new Date();
      } else if (nextStatus === "APPROVED") {
        if (!canApprovePermit(viewer, permit)) {
          throw new HttpError(
            403,
            "Only HSE management who is not the creator, responsible person or submitter can approve this permit.",
          );
        }

        if (permit.validTo.getTime() < now) {
          throw new HttpError(409, "An expired permit cannot be approved.");
        }

        await assertPermitReadyForWork(permit, session);

        permit.approvedBy = viewer._id;
        permit.approvedAt = new Date();
      } else if (nextStatus === "REJECTED") {
        if (!canApprovePermit(viewer, permit)) {
          throw new HttpError(
            403,
            "Only HSE management who is not the creator, responsible person or submitter can reject this permit.",
          );
        }

        permit.rejectedBy = viewer._id;
        permit.rejectedAt = new Date();
        permit.rejectionReason = parsed.data.reason ?? null;
      } else if (nextStatus === "ACTIVE") {
        const isResuming = permit.status === "SUSPENDED";

        if (
          isResuming
            ? !canResumePermit(viewer, permit)
            : !canActivatePermit(viewer, permit)
        ) {
          throw new HttpError(
            403,
            isResuming
              ? "Only the responsible person or HSE management can resume this permit."
              : "Only the responsible person or HSE management can activate this permit.",
          );
        }

        if (now < permit.validFrom.getTime()) {
          throw new HttpError(
            409,
            "This permit cannot be activated before its validity window starts.",
          );
        }

        if (now > permit.validTo.getTime()) {
          throw new HttpError(
            409,
            "This permit has expired and cannot be activated or resumed. Close it instead.",
          );
        }

        if (!isWithinValidity(permit, now)) {
          throw new HttpError(
            409,
            "The permit is outside its validity window.",
          );
        }

        await assertPermitReadyForWork(permit, session);

        if (isResuming) {
          permit.resumedBy = viewer._id;
          permit.resumedAt = new Date();
        } else {
          permit.activatedBy = viewer._id;
          permit.activatedAt = new Date();
        }
      } else if (nextStatus === "SUSPENDED") {
        if (!canSuspendPermit(viewer, permit)) {
          throw new HttpError(
            403,
            "Only the responsible person, an HSE officer for this site or HSE management can suspend this permit.",
          );
        }

        if (now > permit.validTo.getTime()) {
          throw new HttpError(
            409,
            "An expired permit cannot be suspended. Close it instead.",
          );
        }

        permit.suspendedBy = viewer._id;
        permit.suspendedAt = new Date();
        permit.suspensionReason = parsed.data.reason ?? null;
      } else if (nextStatus === "CLOSED") {
        if (!canClosePermit(viewer, permit)) {
          throw new HttpError(
            403,
            "Only the responsible person or HSE management can close this permit.",
          );
        }

        const checks = parsed.data.closureChecks;

        if (
          !checks ||
          !checks.workAreaSecured ||
          !checks.personnelAccountedFor ||
          !checks.equipmentIsolated ||
          !checks.siteHandoverCompleted ||
          !parsed.data.closureNotes?.trim()
        ) {
          throw new HttpError(
            400,
            "All closure checks and closure notes are required before closing a permit.",
          );
        }

        permit.closedBy = viewer._id;
        permit.closedAt = new Date();
        permit.closureNotes = parsed.data.closureNotes;
        permit.closureChecks = {
          workAreaSecured: true,
          personnelAccountedFor: true,
          equipmentIsolated: true,
          siteHandoverCompleted: true,
        };
      } else if (nextStatus === "CANCELLED") {
        if (!canCancelPermit(viewer, permit)) {
          throw new HttpError(
            403,
            "You are not permitted to cancel this permit at its current status.",
          );
        }

        permit.cancelledBy = viewer._id;
        permit.cancelledAt = new Date();
        permit.cancellationReason = parsed.data.reason ?? null;
      }

      permit.status = nextStatus;

      await permit.save({ session });

      return {
        result: permit,
        audit: {
          action: "permit.status_changed",
          entityType: "Permit",
          entityId: permit._id,
          before,
          after: permitAuditSnapshot(permit),
        },
      };
    });

    await permit.populate(PERMIT_DETAIL_POPULATE);

    res.status(200).json({
      success: true,
      permit: toPermitDetail(permit),
    });
  },
);

// Capture readiness facts while the permit is still DRAFT. Personnel,
// equipment and links are editable draft data; recorded events are append-only
// and their actor/timestamp metadata is always stamped by the server.
router.patch(
  "/:id/readiness",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const permitId = parseObjectIdParam(req.params.id, "permit");

    const parsed = permitReadinessSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const incoming = parsed.data;

    const permit = await runAuditedMutation(viewer._id, async (session) => {
      const permitDoc = await Permit.findById(permitId).session(session);
      if (!permitDoc) {
        throw new HttpError(404, "Permit not found.");
      }

      assertPermitAccess(viewer, permitDoc);

      if (!canRecordPermitReadiness(viewer, permitDoc)) {
        throw new HttpError(
          403,
          "Only the creator, responsible person or HSE management can record readiness on a draft permit.",
        );
      }

      // Validate only the references submitted in this request. Existing
      // stored history is not re-validated, so later changes to linked records
      // never invalidate or erase what was recorded earlier.
      await assertIncomingReadinessReferences(
        session,
        permitDoc,
        incoming,
      );

      const before = permitReadinessAuditSnapshot(permitDoc.readiness);
      const readiness = ensurePermitReadiness(permitDoc);
      const now = new Date();

      if (incoming.personnel !== undefined) {
        readiness.personnel.splice(
          0,
          readiness.personnel.length,
          ...incoming.personnel.map(toReadinessPersonnel),
        );
      }

      if (incoming.equipment !== undefined) {
        readiness.equipment.splice(
          0,
          readiness.equipment.length,
          ...incoming.equipment.map(toReadinessEquipment),
        );
      }

      // Recorded events are append-only. Previously captured records remain
      // untouched and new records are added with server-controlled metadata.
      for (const isolation of incoming.isolations ?? []) {
        readiness.isolations.push({
          point: isolation.point,
          method: isolation.method,
          tagNumber: isolation.tagNumber ?? null,
          attachmentIds: uniqueObjectIds(isolation.attachmentIds),
          recordedBy: viewer._id,
          recordedAt: now,
        });
      }

      for (const gasTest of incoming.gasTests ?? []) {
        readiness.gasTests.push({
          area: gasTest.area ?? null,
          instrument: gasTest.instrument ?? null,
          oxygenPct: gasTest.oxygenPct ?? null,
          lelPct: gasTest.lelPct ?? null,
          h2sPpm: gasTest.h2sPpm ?? null,
          coPpm: gasTest.coPpm ?? null,
          result: gasTest.result ?? null,
          attachmentIds: uniqueObjectIds(gasTest.attachmentIds),
          recordedBy: viewer._id,
          recordedAt: now,
        });
      }

      if (incoming.links) {
        if (!readiness.links) {
          permitDoc.set("readiness.links", emptyReadinessLinks());
        }

        const links = permitDoc.readiness?.links;
        if (!links) {
          throw new Error("Permit readiness links could not be initialized.");
        }

        if (incoming.links.inspectionIds !== undefined) {
          permitDoc.set(
            "readiness.links.inspectionIds",
            uniqueObjectIds(incoming.links.inspectionIds),
          );
        }
        if (incoming.links.ppeIssuanceIds !== undefined) {
          permitDoc.set(
            "readiness.links.ppeIssuanceIds",
            uniqueObjectIds(incoming.links.ppeIssuanceIds),
          );
        }
        if (incoming.links.correctiveActionIds !== undefined) {
          permitDoc.set(
            "readiness.links.correctiveActionIds",
            uniqueObjectIds(incoming.links.correctiveActionIds),
          );
        }
        if (incoming.links.contractorIds !== undefined) {
          permitDoc.set(
            "readiness.links.contractorIds",
            uniqueObjectIds(incoming.links.contractorIds),
          );
        }
        if (incoming.links.toolboxTalkId !== undefined) {
          permitDoc.set(
            "readiness.links.toolboxTalkId",
            incoming.links.toolboxTalkId
              ? new Types.ObjectId(incoming.links.toolboxTalkId)
              : null,
          );
        }
      }

      const worksiteVerification = incoming.worksiteVerification ?? null;
      if (worksiteVerification) {
        if (readiness.worksiteVerification) {
          const current = readiness.worksiteVerification;

          // Keep the previous verification as an immutable historical record.
          readiness.worksiteVerificationHistory.push({
            verifiedBy: current.verifiedBy ?? null,
            verifiedAt: current.verifiedAt ?? null,
            notes: current.notes ?? null,
            attachmentIds: (current.attachmentIds ?? []).map(
              (id) => new Types.ObjectId(String(id)),
            ),
          });
        }

        permitDoc.set("readiness.worksiteVerification", {
          // Attribution is server-controlled: the authenticated viewer who
          // recorded the verification is the verifier.
          verifiedBy: viewer._id,
          verifiedAt: now,
          notes: worksiteVerification.notes ?? null,
          attachmentIds: uniqueObjectIds(worksiteVerification.attachmentIds),
        });
      }

      for (const attestation of incoming.attestations ?? []) {
        readiness.attestations.push({
          requirementId: attestation.requirementId,
          state: attestation.state,
          note: attestation.note ?? null,
          attachmentIds: uniqueObjectIds(attestation.attachmentIds),
          recordedBy: viewer._id,
          recordedAt: now,
        });
      }

      const after = permitReadinessAuditSnapshot(permitDoc.readiness);

      await permitDoc.save({ session });

      return {
        result: permitDoc,
        audit: {
          action: "permit.readiness_recorded",
          entityType: "Permit",
          entityId: permitDoc._id,
          before,
          after,
        },
      };
    });

    await permit.populate(PERMIT_DETAIL_POPULATE);

    res.status(200).json({
      success: true,
      permit: toPermitDetail(permit),
    });
  },
);

export default router;
