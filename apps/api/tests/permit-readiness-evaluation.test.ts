import request from "supertest";
import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { app } from "../src/app.js";
import { Attachment } from "../src/models/Attachment.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Contractor } from "../src/models/Contractor.js";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { CorrectiveAction } from "../src/models/CorrectiveAction.js";
import { Inspection } from "../src/models/Inspection.js";
import { Permit } from "../src/models/Permit.js";
import { PpeIssuance } from "../src/models/PpeIssuance.js";
import { Project } from "../src/models/Project.js";
import { RiskAssessment } from "../src/models/RiskAssessment.js";
import { Site } from "../src/models/Site.js";
import { ToolboxTalk } from "../src/models/ToolboxTalk.js";
import {
  activePermitPolicyVersion,
  A03_REQUIREMENT_MAPPINGS,
} from "../src/lib/permit-readiness.js";
import { buildPermitReadinessEvaluation } from "../src/lib/permit-readiness-evaluation.js";
import { signInAsIkoshUser } from "./helpers.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let sequence = 0;

function nextCode(prefix: string): string {
  sequence += 1;
  return `${prefix}${sequence}`;
}

async function createSite() {
  const project = await Project.create({
    name: `Readiness Evaluation Project ${sequence + 1}`,
    code: nextCode("REP"),
  });
  const site = await Site.create({
    project: project._id,
    name: `Readiness Evaluation Site ${sequence}`,
    code: nextCode("RES"),
    status: "ACTIVE",
  });

  return { project, site };
}

function permitBody(
  projectId: unknown,
  siteId: unknown,
  responsiblePersonId: unknown,
) {
  const now = Date.now();

  return {
    workDescription: "Hot work on the north storage tank",
    workType: "HOT_WORK",
    projectId: String(projectId),
    siteId: String(siteId),
    location: "Tank farm, bay 3",
    validFrom: new Date(now - HOUR).toISOString(),
    validTo: new Date(now + DAY).toISOString(),
    responsiblePersonId: String(responsiblePersonId),
    workersInvolved: ["Ade Worker — welder"],
    requiredPrecautions: ["PPE", "FIRE_WATCH"],
    hazards: [
      {
        hazard: "Sparks igniting flammable vapour",
        controlMeasures: "Gas testing and a dedicated fire watch",
      },
    ],
  };
}

async function createWorkspace() {
  const { project, site } = await createSite();

  const creator = await signInAsIkoshUser({
    ikoshRole: "HSE_OFFICER",
    assignedSites: [site._id],
  });
  const responsible = await signInAsIkoshUser({
    ikoshRole: "SUPERVISOR",
    assignedSites: [site._id],
  });
  const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

  const created = await request(app)
    .post("/api/permits")
    .set("Authorization", creator.authorization)
    .send(permitBody(project._id, site._id, responsible.user._id));

  expect(created.status).toBe(201);

  return {
    project,
    site,
    creator,
    responsible,
    manager,
    permitId: created.body.permit.id as string,
    created: created.body.permit as Record<string, unknown>,
  };
}

function capture(
  authorization: string,
  permitId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .patch(`/api/permits/${permitId}/readiness`)
    .set("Authorization", authorization)
    .send(body);
}

async function createPermitAttachment(
  permitId: string,
  uploadedBy: Types.ObjectId,
) {
  return Attachment.create({
    storageKey: `readiness-evaluation/${nextCode("file")}`,
    originalFilename: "evidence.pdf",
    mimeType: "application/pdf",
    size: 128,
    checksum: "a".repeat(64),
    entityType: "permit",
    entityId: new Types.ObjectId(permitId),
    uploadedBy,
  });
}

async function createInspection(input: {
  projectId: Types.ObjectId;
  siteId: Types.ObjectId;
  inspectorId: Types.ObjectId;
}) {
  return Inspection.create({
    title: `Readiness inspection ${nextCode("INS")}`,
    type: "ROUTINE",
    status: "COMPLETED",
    project: input.projectId,
    site: input.siteId,
    inspector: input.inspectorId,
    scheduledFor: new Date(),
    createdBy: input.inspectorId,
  });
}

async function createPpeIssuance(input: {
  projectId: Types.ObjectId;
  siteId: Types.ObjectId;
  issuedBy: Types.ObjectId;
}) {
  return PpeIssuance.create({
    project: input.projectId,
    site: input.siteId,
    item: new Types.ObjectId(),
    kind: "EMPLOYEE",
    employee: input.issuedBy,
    contractorPersonnel: null,
    name: "Ade Worker",
    quantity: 1,
    conditionAtIssue: "GOOD",
    status: "ISSUED",
    issuedOn: new Date(),
    issuedBy: input.issuedBy,
  });
}

async function createCorrectiveAction(input: {
  projectId: Types.ObjectId;
  siteId: Types.ObjectId;
  assignedTo: Types.ObjectId;
}) {
  return CorrectiveAction.create({
    description: "Close out the readiness finding",
    source: "OTHER",
    project: input.projectId,
    site: input.siteId,
    assignedTo: input.assignedTo,
    dueDate: new Date(Date.now() + DAY),
    status: "VERIFIED",
    createdBy: input.assignedTo,
  });
}

async function createContractor(projectId: Types.ObjectId) {
  return Contractor.create({
    name: `Readiness Contractor ${nextCode("CON")}`,
    isActive: true,
    projects: [projectId],
  });
}

async function createContractorPersonnel(input: {
  contractorId: Types.ObjectId;
  siteId: Types.ObjectId;
}) {
  return ContractorPersonnel.create({
    contractor: input.contractorId,
    firstName: "Contractor",
    lastName: nextCode("Worker"),
    site: input.siteId,
    isActive: true,
  });
}

async function createToolboxTalk(input: {
  projectId: Types.ObjectId;
  siteId: Types.ObjectId;
  createdBy: Types.ObjectId;
  participants: Array<{
    kind: "EMPLOYEE" | "CONTRACTOR";
    employee?: Types.ObjectId | null;
    contractorPersonnel?: Types.ObjectId | null;
    name: string;
    attendance: "ATTENDED" | "INVITED" | "ABSENT";
  }>;
}) {
  return ToolboxTalk.create({
    project: input.projectId,
    site: input.siteId,
    topic: `Readiness briefing ${nextCode("TBT")}`,
    facilitatorName: "HSE Officer",
    scheduledDate: new Date(),
    durationMinutes: 15,
    status: "COMPLETED",
    createdBy: input.createdBy,
    participants: input.participants.map((participant) => ({
      kind: participant.kind,
      employee: participant.employee ?? null,
      contractorPersonnel: participant.contractorPersonnel ?? null,
      name: participant.name,
      attendance: participant.attendance,
    })),
  });
}

async function createRiskAssessment(input: {
  projectId: Types.ObjectId;
  siteId: Types.ObjectId;
  ownerId: Types.ObjectId;
}) {
  return RiskAssessment.create({
    title: `Readiness assessment ${nextCode("RA")}`,
    status: "APPROVED",
    project: input.projectId,
    site: input.siteId,
    owner: input.ownerId,
    createdBy: input.ownerId,
    revision: 1,
    hazards: [
      {
        hazard: "Work at height",
        consequences: "Fall from height",
        existingControls: "Guardrails",
        likelihood: 3,
        severity: 4,
        inherentLevel: "HIGH",
        residualLikelihood: 2,
        residualSeverity: 3,
        residualLevel: "MEDIUM",
        additionalControls: "Harness",
      },
    ],
  });
}

function requirementState(
  evaluation: {
    requirements: Array<{ id: string; state: string; satisfied: boolean }>;
  },
  id: string,
): { id: string; state: string; satisfied: boolean } | undefined {
  return evaluation.requirements.find((requirement) => requirement.id === id);
}

describe("buildPermitReadinessEvaluation", () => {
  it("maps fact categories to states and never treats a declaration as satisfied", () => {
    const evaluation = buildPermitReadinessEvaluation(
      {
        facts: {},
        automatic: ["scope_and_permit_type"],
        recorded: ["equipment_defined"],
        blocked: ["authorized_issuer"],
        notApplicable: ["interfaces_defined"],
      },
      null,
    );

    expect(requirementState(evaluation, "scope_and_permit_type")).toMatchObject({
      state: "AUTOMATIC",
      satisfied: true,
    });
    expect(requirementState(evaluation, "equipment_defined")).toMatchObject({
      state: "RECORDED",
      satisfied: true,
    });
    expect(requirementState(evaluation, "authorized_issuer")).toMatchObject({
      state: "BLOCKED",
      satisfied: false,
    });
    expect(requirementState(evaluation, "interfaces_defined")).toMatchObject({
      state: "NOT_APPLICABLE",
      satisfied: false,
    });
    expect(requirementState(evaluation, "method_statement")).toMatchObject({
      state: "OUTSTANDING",
      satisfied: false,
    });

    expect(evaluation.mode).toBe("DRAFT_PREVIEW");
    expect(evaluation.policy).toEqual({
      version: 2,
      revision: "A03",
      status: "DRAFT",
    });
    expect(evaluation.permitPolicyVersion).toBeNull();
    expect(evaluation.counts).toEqual({
      total: A03_REQUIREMENT_MAPPINGS.length,
      satisfied: 2,
      outstanding: A03_REQUIREMENT_MAPPINGS.length - 4,
      blocked: 1,
      notApplicable: 1,
    });
  });

  it("exposes only the whitelisted evaluation fields", () => {
    const evaluation = buildPermitReadinessEvaluation(
      {
        facts: {},
        automatic: [],
        recorded: [],
        blocked: [],
        notApplicable: [],
      },
      null,
    );

    expect(Object.keys(evaluation).sort()).toEqual([
      "counts",
      "mode",
      "permitPolicyVersion",
      "policy",
      "requirements",
    ]);

    for (const requirement of evaluation.requirements) {
      expect(Object.keys(requirement).sort()).toEqual([
        "id",
        "label",
        "satisfied",
        "state",
        "type",
      ]);
    }
  });
});

describe("permit readiness evaluation visibility", () => {
  it("exposes a sanitized draft preview from linked records only", async () => {
    const {
      project,
      site,
      creator,
      responsible,
      permitId,
      created,
    } = await createWorkspace();

    // Write responses are unchanged: evaluation is a detail-read concern.
    expect(created).not.toHaveProperty("readinessEvaluation");

    const attachment = await createPermitAttachment(
      permitId,
      creator.user._id,
    );
    const assessment = await createRiskAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
    });
    const linkedAssessment = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization)
      .send({ riskAssessmentIds: [String(assessment._id)] });
    expect(linkedAssessment.status).toBe(200);
    const inspection = await createInspection({
      projectId: project._id,
      siteId: site._id,
      inspectorId: creator.user._id,
    });
    const ppe = await createPpeIssuance({
      projectId: project._id,
      siteId: site._id,
      issuedBy: creator.user._id,
    });
    const action = await createCorrectiveAction({
      projectId: project._id,
      siteId: site._id,
      assignedTo: creator.user._id,
    });
    const contractor = await createContractor(project._id);
    const contractorPersonnel = await createContractorPersonnel({
      contractorId: contractor._id,
      siteId: site._id,
    });
    const talk = await createToolboxTalk({
      projectId: project._id,
      siteId: site._id,
      createdBy: creator.user._id,
      participants: [
        {
          kind: "EMPLOYEE",
          employee: creator.user._id,
          name: "Ade Worker",
          attendance: "ATTENDED",
        },
        {
          kind: "CONTRACTOR",
          contractorPersonnel: contractorPersonnel._id,
          name: "Contractor Worker",
          attendance: "ATTENDED",
        },
      ],
    });

    const captured = await capture(creator.authorization, permitId, {
      personnel: [
        {
          kind: "EMPLOYEE",
          employee: String(creator.user._id),
          name: "Ade Worker",
        },
        {
          kind: "CONTRACTOR",
          contractorPersonnel: String(contractorPersonnel._id),
          contractor: String(contractor._id),
          name: "Contractor Worker",
        },
      ],
      equipment: [
        {
          name: "Welding set",
          inspection: String(inspection._id),
        },
      ],
      isolations: [
        {
          point: "Pump P-101 suction",
          method: "Lock and tag",
          tagNumber: "LOTO-1",
          attachmentIds: [String(attachment._id)],
        },
      ],
      gasTests: [
        {
          area: "Tank farm",
          instrument: "Multi-gas meter",
          oxygenPct: 20.9,
          result: "Safe to work",
          attachmentIds: [String(attachment._id)],
        },
      ],
      links: {
        inspectionIds: [String(inspection._id)],
        ppeIssuanceIds: [String(ppe._id)],
        correctiveActionIds: [String(action._id)],
        contractorIds: [String(contractor._id)],
        toolboxTalkId: String(talk._id),
      },
      worksiteVerification: {
        notes: "Controls verified at the worksite",
      },
      attestations: [
        {
          requirementId: "interfaces_defined",
          state: "NOT_APPLICABLE",
          note: "No interfaces on this job",
        },
      ],
    });

    expect(captured.status).toBe(200);
    expect(captured.body.permit).not.toHaveProperty("readinessEvaluation");

    const auditsBefore = await AuditLog.countDocuments({
      entityType: "Permit",
      entityId: permitId,
    });

    const detail = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization);

    expect(detail.status).toBe(200);

    const evaluation = detail.body.permit.readinessEvaluation as {
      mode: string;
      policy: Record<string, unknown>;
      permitPolicyVersion: number | null;
      counts: Record<string, number>;
      requirements: Array<{ id: string; state: string; satisfied: boolean }>;
    };

    expect(evaluation.mode).toBe("DRAFT_PREVIEW");
    expect(evaluation.policy).toEqual({
      version: 2,
      revision: "A03",
      status: "DRAFT",
    });
    expect(evaluation.permitPolicyVersion).toBeNull();
    expect(detail.body.permit.policyVersion).toBeNull();
    expect(activePermitPolicyVersion()).toBeNull();

    expect(requirementState(evaluation, "scope_and_permit_type")).toMatchObject({
      state: "AUTOMATIC",
      satisfied: true,
    });
    expect(requirementState(evaluation, "people_defined")).toMatchObject({
      state: "AUTOMATIC",
      satisfied: true,
    });
    expect(requirementState(evaluation, "hazards_and_controls")).toMatchObject({
      state: "AUTOMATIC",
      satisfied: true,
    });
    expect(requirementState(evaluation, "validity_window")).toMatchObject({
      state: "AUTOMATIC",
      satisfied: true,
    });
    expect(requirementState(evaluation, "records_attributable")).toMatchObject({
      state: "AUTOMATIC",
      satisfied: true,
    });
    expect(
      requirementState(evaluation, "current_risk_assessment"),
    ).toMatchObject({
      state: "AUTOMATIC",
      satisfied: true,
    });
    expect(requirementState(evaluation, "worker_briefing")).toMatchObject({
      state: "AUTOMATIC",
      satisfied: true,
    });

    expect(requirementState(evaluation, "equipment_defined")).toMatchObject({
      state: "RECORDED",
      satisfied: true,
    });
    expect(requirementState(evaluation, "isolation_records")).toMatchObject({
      state: "RECORDED",
      satisfied: true,
    });
    expect(requirementState(evaluation, "gas_test_records")).toMatchObject({
      state: "RECORDED",
      satisfied: true,
    });
    expect(requirementState(evaluation, "worksite_verification")).toMatchObject({
      state: "RECORDED",
      satisfied: true,
    });
    expect(
      requirementState(evaluation, "contractor_simops_coordination"),
    ).toMatchObject({
      state: "RECORDED",
      satisfied: true,
    });

    expect(requirementState(evaluation, "interfaces_defined")).toMatchObject({
      state: "NOT_APPLICABLE",
      satisfied: false,
    });
    expect(
      requirementState(evaluation, "critical_actions_and_residual_risk"),
    ).toMatchObject({
      state: "OUTSTANDING",
      satisfied: false,
    });
    // A completed generic inspection and an issued PPE record do not prove the
    // specific equipment/PPE was inspected and found fit for use.
    expect(
      requirementState(evaluation, "equipment_ppe_inspection"),
    ).toMatchObject({
      state: "OUTSTANDING",
      satisfied: false,
    });
    expect(requirementState(evaluation, "independent_approval")).toMatchObject({
      state: "OUTSTANDING",
      satisfied: false,
    });

    for (const requirementId of [
      "authorized_issuer",
      "personnel_competence",
      "client_requirements",
      "stop_work_authority",
      "no_retrospective_permit",
    ]) {
      expect(requirementState(evaluation, requirementId)).toMatchObject({
        state: "BLOCKED",
        satisfied: false,
      });
    }

    const satisfiedCount = evaluation.requirements.filter(
      (requirement) => requirement.satisfied,
    ).length;
    const outstandingCount = evaluation.requirements.filter(
      (requirement) => requirement.state === "OUTSTANDING",
    ).length;

    expect(evaluation.counts).toEqual({
      total: A03_REQUIREMENT_MAPPINGS.length,
      satisfied: satisfiedCount,
      outstanding: outstandingCount,
      blocked: 5,
      notApplicable: 1,
    });
    expect(
      evaluation.counts.satisfied +
        evaluation.counts.outstanding +
        evaluation.counts.blocked +
        evaluation.counts.notApplicable,
    ).toBe(evaluation.counts.total);

    // The raw captured readiness is preserved alongside the evaluation.
    expect(detail.body.permit.readiness.personnel).toHaveLength(2);
    expect(detail.body.permit.readiness.gasTests).toHaveLength(1);

    // The evaluation payload contains no names, notes or gas readings.
    const serialized = JSON.stringify(evaluation);
    for (const forbidden of [
      "Ade Worker",
      "Contractor Worker",
      "Controls verified at the worksite",
      "No interfaces on this job",
      "20.9",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    // A detail read is read-only.
    const auditsAfter = await AuditLog.countDocuments({
      entityType: "Permit",
      entityId: permitId,
    });
    expect(auditsAfter).toBe(auditsBefore);

    const stored = await Permit.findById(permitId).lean();
    expect(stored?.readiness?.personnel).toHaveLength(2);
    expect(stored?.readiness?.attestations).toHaveLength(1);

    const list = await request(app)
      .get("/api/permits")
      .set("Authorization", creator.authorization);
    expect(list.status).toBe(200);

    const listed = list.body.permits.find(
      (permit: { id: string }) => permit.id === permitId,
    );
    expect(listed).not.toHaveProperty("readiness");
    expect(listed).not.toHaveProperty("readinessEvaluation");
  });

  it("does not use unlinked records from the same project and site", async () => {
    const { project, site, creator, responsible, permitId } =
      await createWorkspace();

    await createRiskAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
    });
    await createInspection({
      projectId: project._id,
      siteId: site._id,
      inspectorId: creator.user._id,
    });
    await createPpeIssuance({
      projectId: project._id,
      siteId: site._id,
      issuedBy: creator.user._id,
    });
    const contractor = await createContractor(project._id);
    await createToolboxTalk({
      projectId: project._id,
      siteId: site._id,
      createdBy: creator.user._id,
      participants: [
        {
          kind: "EMPLOYEE",
          employee: creator.user._id,
          name: "Ade Worker",
          attendance: "ATTENDED",
        },
      ],
    });

    // None of the records above are linked to this permit.
    const captured = await capture(creator.authorization, permitId, {
      personnel: [
        {
          kind: "EMPLOYEE",
          employee: String(creator.user._id),
          name: "Ade Worker",
        },
      ],
      equipment: [{ name: "Welding set" }],
      links: {
        inspectionIds: [],
        ppeIssuanceIds: [],
        correctiveActionIds: [],
        contractorIds: [],
        toolboxTalkId: null,
      },
    });

    expect(captured.status).toBe(200);

    const detail = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization);
    expect(detail.status).toBe(200);

    const evaluation = detail.body.permit.readinessEvaluation as {
      requirements: Array<{ id: string; state: string; satisfied: boolean }>;
    };

    for (const requirementId of [
      "current_risk_assessment",
      "equipment_ppe_inspection",
      "worker_briefing",
      "contractor_simops_coordination",
    ]) {
      expect(requirementState(evaluation, requirementId)).toMatchObject({
        state: "OUTSTANDING",
        satisfied: false,
      });
    }

    // A captured equipment record is still recorded even without evidence.
    expect(requirementState(evaluation, "equipment_defined")).toMatchObject({
      state: "RECORDED",
      satisfied: true,
    });

    // Keep the unused record in the fixture to prove it was not swept in.
    expect(contractor.isActive).toBe(true);
  });
});
