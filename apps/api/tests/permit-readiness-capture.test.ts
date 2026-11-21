import request from "supertest";
import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Attachment } from "../src/models/Attachment.js";
import { Contractor } from "../src/models/Contractor.js";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { CorrectiveAction } from "../src/models/CorrectiveAction.js";
import { Inspection } from "../src/models/Inspection.js";
import { PpeIssuance } from "../src/models/PpeIssuance.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { ToolboxTalk } from "../src/models/ToolboxTalk.js";
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
    name: `Readiness Capture Project ${sequence + 1}`,
    code: nextCode("RCP"),
  });
  const site = await Site.create({
    project: project._id,
    name: `Readiness Capture Site ${sequence}`,
    code: nextCode("RCS"),
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
  const other = await createSite();

  const creator = await signInAsIkoshUser({
    ikoshRole: "HSE_OFFICER",
    assignedSites: [site._id],
  });
  const responsible = await signInAsIkoshUser({
    ikoshRole: "SUPERVISOR",
    assignedSites: [site._id],
  });
  const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
  const outsider = await signInAsIkoshUser({
    ikoshRole: "HSE_OFFICER",
    assignedSites: [site._id],
  });
  const offSiteUser = await signInAsIkoshUser({
    ikoshRole: "HSE_OFFICER",
    assignedSites: [],
  });

  const created = await request(app)
    .post("/api/permits")
    .set("Authorization", creator.authorization)
    .send(permitBody(project._id, site._id, responsible.user._id));

  expect(created.status).toBe(201);

  return {
    project,
    site,
    other,
    creator,
    responsible,
    manager,
    outsider,
    offSiteUser,
    permitId: created.body.permit.id as string,
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
    storageKey: `readiness/${nextCode("file")}`,
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
  status?: string;
}) {
  return Inspection.create({
    title: `Readiness inspection ${nextCode("INS")}`,
    type: "ROUTINE",
    status: input.status ?? "COMPLETED",
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
  status?: string;
  kind?: "EMPLOYEE" | "CONTRACTOR";
  employee?: Types.ObjectId | null;
  contractorPersonnel?: Types.ObjectId | null;
}) {
  return PpeIssuance.create({
    project: input.projectId,
    site: input.siteId,
    item: new Types.ObjectId(),
    kind: input.kind ?? "EMPLOYEE",
    employee: input.employee ?? input.issuedBy,
    contractorPersonnel: input.contractorPersonnel ?? null,
    name: "Ade Worker",
    quantity: 1,
    conditionAtIssue: "GOOD",
    status: input.status ?? "ISSUED",
    issuedOn: new Date(),
    issuedBy: input.issuedBy,
  });
}

async function createCorrectiveAction(input: {
  projectId: Types.ObjectId;
  siteId: Types.ObjectId;
  assignedTo: Types.ObjectId;
  status?: string;
}) {
  return CorrectiveAction.create({
    description: "Close out the readiness finding",
    source: "OTHER",
    project: input.projectId,
    site: input.siteId,
    assignedTo: input.assignedTo,
    dueDate: new Date(Date.now() + DAY),
    status: input.status ?? "VERIFIED",
    createdBy: input.assignedTo,
  });
}

async function createContractor(input: {
  projectId: Types.ObjectId;
  isActive?: boolean;
}) {
  return Contractor.create({
    name: `Readiness Contractor ${nextCode("CON")}`,
    isActive: input.isActive ?? true,
    projects: [input.projectId],
  });
}

async function createContractorPersonnel(input: {
  contractorId: Types.ObjectId;
  siteId: Types.ObjectId | null;
  isActive?: boolean;
}) {
  return ContractorPersonnel.create({
    contractor: input.contractorId,
    firstName: "Contractor",
    lastName: nextCode("Worker"),
    site: input.siteId,
    isActive: input.isActive ?? true,
  });
}

async function createToolboxTalk(input: {
  projectId: Types.ObjectId;
  siteId: Types.ObjectId;
  createdBy: Types.ObjectId;
  status?: string;
}) {
  return ToolboxTalk.create({
    project: input.projectId,
    site: input.siteId,
    topic: `Readiness briefing ${nextCode("TBT")}`,
    facilitatorName: "HSE Officer",
    scheduledDate: new Date(),
    durationMinutes: 15,
    status: input.status ?? "COMPLETED",
    createdBy: input.createdBy,
  });
}

const emptyLinks = {
  inspectionIds: [],
  ppeIssuanceIds: [],
  correctiveActionIds: [],
  contractorIds: [],
  toolboxTalkId: null,
};

describe("permit readiness capture", () => {
  it("records a draft permit's readiness and exposes it only in permit detail", async () => {
    const { creator, permitId } = await createWorkspace();
    const attachment = await createPermitAttachment(
      permitId,
      creator.user._id,
    );
    const before = Date.now();

    const response = await capture(creator.authorization, permitId, {
      personnel: [
        {
          kind: "EMPLOYEE",
          employee: String(creator.user._id),
          name: "Ade Worker",
          role: "Welder",
          notes: "Site induction complete",
        },
      ],
      equipment: [{ name: "Welding set", reference: "WS-17" }],
      isolations: [
        {
          point: "Pump P-101 suction",
          method: "Lock and tag",
          tagNumber: "LOTO-1",
          attachmentIds: [String(attachment._id)],
          // Server-controlled metadata must be ignored.
          recordedBy: String(new Types.ObjectId()),
          recordedAt: "2000-01-01T00:00:00.000Z",
        },
      ],
      gasTests: [
        {
          area: "Tank farm",
          instrument: "Multi-gas meter",
          oxygenPct: 20.9,
          lelPct: 0,
          result: "Safe to work",
          attachmentIds: [String(attachment._id)],
          recordedBy: String(new Types.ObjectId()),
          recordedAt: "2000-01-01T00:00:00.000Z",
        },
      ],
      links: emptyLinks,
      worksiteVerification: {
        verifiedBy: String(creator.user._id),
        verifiedAt: "2000-01-01T00:00:00.000Z",
        notes: "Controls verified at the worksite",
        attachmentIds: [String(attachment._id)],
      },
      attestations: [
        {
          requirementId: "equipment_defined",
          state: "SATISFIED",
          note: "Equipment register checked",
          attachmentIds: [],
          recordedBy: String(new Types.ObjectId()),
          recordedAt: "2000-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(response.status).toBe(200);

    const readiness = response.body.permit.readiness;
    expect(readiness.personnel).toHaveLength(1);
    expect(readiness.equipment).toHaveLength(1);
    expect(readiness.isolations).toHaveLength(1);
    expect(readiness.gasTests).toHaveLength(1);
    expect(readiness.attestations).toHaveLength(1);
    expect(readiness.isolations[0].recordedBy).toBe(String(creator.user._id));
    expect(readiness.gasTests[0].recordedBy).toBe(String(creator.user._id));
    expect(readiness.attestations[0].recordedBy).toBe(
      String(creator.user._id),
    );
    expect(
      new Date(readiness.isolations[0].recordedAt).getTime(),
    ).toBeGreaterThanOrEqual(before);
    expect(
      new Date(readiness.worksiteVerification.verifiedAt).getTime(),
    ).toBeGreaterThanOrEqual(before);

    const detail = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization);
    expect(detail.status).toBe(200);
    expect(detail.body.permit.readiness.isolations).toHaveLength(1);

    const list = await request(app)
      .get("/api/permits")
      .set("Authorization", creator.authorization);
    expect(list.status).toBe(200);
    const listed = list.body.permits.find(
      (permit: { id: string }) => permit.id === permitId,
    );
    expect(listed).not.toHaveProperty("readiness");

    const audit = await AuditLog.findOne({
      entityType: "Permit",
      action: "permit.readiness_recorded",
      entityId: permitId,
    }).lean();

    expect(audit?.before).toMatchObject({
      personnelCount: 0,
      isolationCount: 0,
      gasTestCount: 0,
    });
    expect(audit?.after).toMatchObject({
      personnelCount: 1,
      equipmentCount: 1,
      isolationCount: 1,
      gasTestCount: 1,
      attestationCount: 1,
    });
    expect(JSON.stringify(audit?.after)).not.toContain("Pump P-101");
    expect(JSON.stringify(audit?.after)).not.toContain("Site induction");
    expect(JSON.stringify(audit?.after)).not.toContain("20.9");
    expect(JSON.stringify(audit?.after)).not.toContain("Controls verified");
  });

  it("keeps recorded events append-only and preserves unrelated sections", async () => {
    const { creator, responsible, permitId } = await createWorkspace();
    const firstAttachment = await createPermitAttachment(
      permitId,
      creator.user._id,
    );
    const secondAttachment = await createPermitAttachment(
      permitId,
      creator.user._id,
    );

    const first = await capture(creator.authorization, permitId, {
      personnel: [
        {
          kind: "EMPLOYEE",
          employee: String(creator.user._id),
          name: "First Worker",
        },
      ],
      isolations: [
        {
          point: "First isolation",
          method: "Lock and tag",
          attachmentIds: [String(firstAttachment._id)],
        },
      ],
      gasTests: [
        {
          area: "First gas test",
          attachmentIds: [String(firstAttachment._id)],
        },
      ],
      links: { ...emptyLinks },
      worksiteVerification: {
        notes: "First verification",
      },
      attestations: [
        { requirementId: "equipment_defined", state: "SATISFIED" },
      ],
    });

    expect(first.status).toBe(200);
    const firstRecordedAt = first.body.permit.readiness.isolations[0]
      .recordedAt as string;

    // Editing an unrelated section must not erase captured event history.
    const equipmentUpdate = await capture(creator.authorization, permitId, {
      equipment: [{ name: "Welding set" }],
    });
    expect(equipmentUpdate.status).toBe(200);
    expect(equipmentUpdate.body.permit.readiness.isolations).toHaveLength(1);
    expect(equipmentUpdate.body.permit.readiness.gasTests).toHaveLength(1);
    expect(equipmentUpdate.body.permit.readiness.attestations).toHaveLength(1);
    expect(equipmentUpdate.body.permit.readiness.worksiteVerification).not.toBeNull();

    const second = await capture(responsible.authorization, permitId, {
      isolations: [
        {
          point: "Second isolation",
          method: "Blind and tag",
          attachmentIds: [String(secondAttachment._id)],
        },
      ],
      gasTests: [
        {
          area: "Second gas test",
          attachmentIds: [String(secondAttachment._id)],
        },
      ],
      attestations: [
        { requirementId: "isolation_records", state: "SATISFIED" },
      ],
      worksiteVerification: {
        notes: "Second verification",
      },
    });

    expect(second.status).toBe(200);

    const readiness = second.body.permit.readiness;
    expect(readiness.isolations).toHaveLength(2);
    expect(readiness.gasTests).toHaveLength(2);
    expect(readiness.attestations).toHaveLength(2);
    expect(readiness.isolations[0].point).toBe("First isolation");
    expect(readiness.isolations[0].recordedAt).toBe(firstRecordedAt);
    expect(readiness.isolations[1].point).toBe("Second isolation");
    expect(readiness.worksiteVerification.verifiedBy).toBe(
      String(responsible.user._id),
    );
    expect(readiness.worksiteVerificationHistory).toHaveLength(1);
    expect(readiness.worksiteVerificationHistory[0].verifiedBy).toBe(
      String(creator.user._id),
    );
  });

  it("stamps the authenticated viewer as the worksite verifier", async () => {
    const { creator, manager, responsible, permitId } = await createWorkspace();
    const attachment = await createPermitAttachment(
      permitId,
      creator.user._id,
    );
    const before = Date.now();

    const first = await capture(creator.authorization, permitId, {
      worksiteVerification: {
        // Client-supplied attribution must be ignored.
        verifiedBy: String(manager.user._id),
        verifiedAt: "2000-01-01T00:00:00.000Z",
        notes: "Creator verified the worksite",
        attachmentIds: [String(attachment._id)],
      },
    });

    expect(first.status).toBe(200);
    expect(first.body.permit.readiness.worksiteVerification.verifiedBy).toBe(
      String(creator.user._id),
    );
    expect(
      new Date(
        first.body.permit.readiness.worksiteVerification.verifiedAt,
      ).getTime(),
    ).toBeGreaterThanOrEqual(before);

    const second = await capture(manager.authorization, permitId, {
      worksiteVerification: {
        verifiedBy: String(responsible.user._id),
        notes: "Manager verified the worksite",
      },
    });

    expect(second.status).toBe(200);
    expect(second.body.permit.readiness.worksiteVerification.verifiedBy).toBe(
      String(manager.user._id),
    );
    expect(
      second.body.permit.readiness.worksiteVerificationHistory,
    ).toHaveLength(1);
    expect(
      second.body.permit.readiness.worksiteVerificationHistory[0].verifiedBy,
    ).toBe(String(creator.user._id));

    const audits = await AuditLog.find({
      entityType: "Permit",
      action: "permit.readiness_recorded",
      entityId: permitId,
    }).lean();
    const verifierIds = audits.map((audit) => {
      const after = audit.after as {
        worksiteVerification?: { verifiedBy?: string | null } | null;
      } | null;

      return after?.worksiteVerification?.verifiedBy ?? null;
    });

    expect(verifierIds).toContain(String(creator.user._id));
    expect(verifierIds).toContain(String(manager.user._id));
  });

  it("enforces DRAFT-only capture and existing permit authorization", async () => {
    const {
      creator,
      manager,
      outsider,
      offSiteUser,
      permitId,
    } = await createWorkspace();

    const unauthorized = await capture(outsider.authorization, permitId, {
      equipment: [{ name: "Welding set" }],
    });
    expect(unauthorized.status).toBe(403);

    const outOfScope = await capture(
      offSiteUser.authorization,
      permitId,
      { equipment: [{ name: "Welding set" }] },
    );
    expect(outOfScope.status).toBe(404);

    const management = await capture(manager.authorization, permitId, {
      equipment: [{ name: "Welding set" }],
    });
    expect(management.status).toBe(200);

    const submitted = await request(app)
      .patch(`/api/permits/${permitId}/status`)
      .set("Authorization", creator.authorization)
      .send({ status: "SUBMITTED" });
    expect(submitted.status).toBe(200);

    const afterSubmit = await capture(creator.authorization, permitId, {
      equipment: [{ name: "Another set" }],
    });
    expect(afterSubmit.status).toBe(403);
  });

  it("rejects invalid references without weakening stored history", async () => {
    const {
      project,
      site,
      other,
      creator,
      responsible,
      permitId,
    } = await createWorkspace();

    const goodAttachment = await createPermitAttachment(
      permitId,
      creator.user._id,
    );
    const otherPermitAttachment = await createPermitAttachment(
      new Types.ObjectId().toString(),
      creator.user._id,
    );

    const validInspection = await createInspection({
      projectId: project._id,
      siteId: site._id,
      inspectorId: creator.user._id,
    });
    const wrongSiteInspection = await createInspection({
      projectId: other.project._id,
      siteId: other.site._id,
      inspectorId: creator.user._id,
    });
    const scheduledInspection = await createInspection({
      projectId: project._id,
      siteId: site._id,
      inspectorId: creator.user._id,
      status: "SCHEDULED",
    });

    const issuedPpe = await createPpeIssuance({
      projectId: project._id,
      siteId: site._id,
      issuedBy: creator.user._id,
    });
    const returnedPpe = await createPpeIssuance({
      projectId: project._id,
      siteId: site._id,
      issuedBy: creator.user._id,
      status: "RETURNED",
    });

    const verifiedAction = await createCorrectiveAction({
      projectId: project._id,
      siteId: site._id,
      assignedTo: creator.user._id,
    });
    const completedAction = await createCorrectiveAction({
      projectId: project._id,
      siteId: site._id,
      assignedTo: creator.user._id,
      status: "COMPLETED",
    });

    const activeContractor = await createContractor({
      projectId: project._id,
    });
    const inactiveContractor = await createContractor({
      projectId: project._id,
      isActive: false,
    });
    const otherProjectContractor = await createContractor({
      projectId: other.project._id,
    });

    const activePersonnel = await createContractorPersonnel({
      contractorId: activeContractor._id,
      siteId: site._id,
    });
    const inactivePersonnel = await createContractorPersonnel({
      contractorId: activeContractor._id,
      siteId: site._id,
      isActive: false,
    });
    const wrongSitePersonnel = await createContractorPersonnel({
      contractorId: activeContractor._id,
      siteId: other.site._id,
    });
    const inactiveEmployee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      isActive: false,
      assignedSites: [site._id],
    });

    const completedTalk = await createToolboxTalk({
      projectId: project._id,
      siteId: site._id,
      createdBy: creator.user._id,
    });
    const scheduledTalk = await createToolboxTalk({
      projectId: project._id,
      siteId: site._id,
      createdBy: creator.user._id,
      status: "SCHEDULED",
    });

    const invalidCases: Array<{
      label: string;
      body: Record<string, unknown>;
      status: number;
    }> = [
      {
        label: "inspection not completed",
        body: {
          links: { ...emptyLinks, inspectionIds: [String(scheduledInspection._id)] },
        },
        status: 409,
      },
      {
        label: "inspection on another site",
        body: {
          links: { ...emptyLinks, inspectionIds: [String(wrongSiteInspection._id)] },
        },
        status: 409,
      },
      {
        label: "missing attachment",
        body: {
          isolations: [
            {
              point: "Isolation",
              method: "Lock and tag",
              attachmentIds: [new Types.ObjectId().toString()],
            },
          ],
        },
        status: 409,
      },
      {
        label: "attachment belonging to another record",
        body: {
          gasTests: [
            {
              area: "Tank",
              attachmentIds: [String(otherPermitAttachment._id)],
            },
          ],
        },
        status: 409,
      },
      {
        label: "PPE issuance not currently issued",
        body: {
          links: { ...emptyLinks, ppeIssuanceIds: [String(returnedPpe._id)] },
        },
        status: 409,
      },
      {
        label: "corrective action not verified",
        body: {
          links: {
            ...emptyLinks,
            correctiveActionIds: [String(completedAction._id)],
          },
        },
        status: 409,
      },
      {
        label: "inactive contractor",
        body: {
          links: { ...emptyLinks, contractorIds: [String(inactiveContractor._id)] },
        },
        status: 409,
      },
      {
        label: "contractor not engaged on the project",
        body: {
          links: {
            ...emptyLinks,
            contractorIds: [String(otherProjectContractor._id)],
          },
        },
        status: 409,
      },
      {
        label: "inactive employee",
        body: {
          personnel: [
            {
              kind: "EMPLOYEE",
              employee: String(inactiveEmployee.user._id),
              name: "Inactive Worker",
            },
          ],
        },
        status: 409,
      },
      {
        label: "employee with contractor reference",
        body: {
          personnel: [
            {
              kind: "EMPLOYEE",
              employee: String(creator.user._id),
              contractor: String(activeContractor._id),
              name: "Ade Worker",
            },
          ],
        },
        status: 400,
      },
      {
        label: "inactive contractor personnel",
        body: {
          personnel: [
            {
              kind: "CONTRACTOR",
              contractorPersonnel: String(inactivePersonnel._id),
              contractor: String(activeContractor._id),
              name: "Contractor Worker",
            },
          ],
        },
        status: 409,
      },
      {
        label: "contractor personnel on another site",
        body: {
          personnel: [
            {
              kind: "CONTRACTOR",
              contractorPersonnel: String(wrongSitePersonnel._id),
              contractor: String(activeContractor._id),
              name: "Contractor Worker",
            },
          ],
        },
        status: 409,
      },
      {
        label: "toolbox talk not completed",
        body: {
          links: { ...emptyLinks, toolboxTalkId: String(scheduledTalk._id) },
        },
        status: 409,
      },
    ];

    for (const testCase of invalidCases) {
      const response = await capture(creator.authorization, permitId, {
        ...testCase.body,
      });

      expect(response.status, testCase.label).toBe(testCase.status);
    }

    const stored = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization);
    expect(stored.body.permit.readiness).toBeNull();

    const valid = await capture(creator.authorization, permitId, {
      personnel: [
        {
          kind: "EMPLOYEE",
          employee: String(creator.user._id),
          name: "Ade Worker",
        },
        {
          kind: "CONTRACTOR",
          contractorPersonnel: String(activePersonnel._id),
          contractor: String(activeContractor._id),
          name: "Contractor Worker",
        },
      ],
      equipment: [
        {
          name: "Welding set",
          inspection: String(validInspection._id),
        },
      ],
      isolations: [
        {
          point: "Pump P-101 suction",
          method: "Lock and tag",
          attachmentIds: [String(goodAttachment._id)],
        },
      ],
      gasTests: [
        {
          area: "Tank farm",
          oxygenPct: 20.9,
          attachmentIds: [String(goodAttachment._id)],
        },
      ],
      links: {
        inspectionIds: [String(validInspection._id)],
        ppeIssuanceIds: [String(issuedPpe._id)],
        correctiveActionIds: [String(verifiedAction._id)],
        contractorIds: [String(activeContractor._id)],
        toolboxTalkId: String(completedTalk._id),
      },
      worksiteVerification: {
        notes: "Controls verified at the worksite",
      },
      attestations: [
        { requirementId: "equipment_defined", state: "SATISFIED" },
      ],
    });

    expect(valid.status).toBe(200);
    expect(valid.body.permit.readiness.personnel).toHaveLength(2);
  });

  it("validates attestation requirement ids, conditions and open decisions", async () => {
    const { creator, permitId } = await createWorkspace();

    const unknown = await capture(creator.authorization, permitId, {
      attestations: [
        { requirementId: "not_a_requirement", state: "SATISFIED" },
      ],
    });
    expect(unknown.status).toBe(400);

    const universalNotApplicable = await capture(
      creator.authorization,
      permitId,
      {
        attestations: [
          { requirementId: "worksite_verification", state: "NOT_APPLICABLE" },
        ],
      },
    );
    expect(universalNotApplicable.status).toBe(400);

    const blockedSatisfied = await capture(creator.authorization, permitId, {
      attestations: [
        { requirementId: "authorized_issuer", state: "SATISFIED" },
      ],
    });
    expect(blockedSatisfied.status).toBe(409);

    const blockedNotApplicable = await capture(
      creator.authorization,
      permitId,
      {
        attestations: [
          { requirementId: "client_requirements", state: "NOT_APPLICABLE" },
        ],
      },
    );
    expect(blockedNotApplicable.status).toBe(409);

    for (const requirementId of [
      "critical_actions_and_residual_risk",
      "worker_briefing",
      "contractor_simops_coordination",
    ]) {
      const evidenceRequired = await capture(creator.authorization, permitId, {
        attestations: [{ requirementId, state: "SATISFIED" }],
      });

      expect(evidenceRequired.status, requirementId).toBe(409);
    }

    const conditionalNotApplicable = await capture(
      creator.authorization,
      permitId,
      {
        attestations: [
          { requirementId: "interfaces_defined", state: "NOT_APPLICABLE" },
        ],
      },
    );
    expect(conditionalNotApplicable.status).toBe(200);
    expect(
      conditionalNotApplicable.body.permit.readiness.attestations[0],
    ).toMatchObject({
      requirementId: "interfaces_defined",
      state: "NOT_APPLICABLE",
      recordedBy: String(creator.user._id),
    });

    const contractorNotApplicable = await capture(
      creator.authorization,
      permitId,
      {
        attestations: [
          {
            requirementId: "contractor_simops_coordination",
            state: "NOT_APPLICABLE",
          },
        ],
      },
    );
    expect(contractorNotApplicable.status).toBe(200);
    expect(
      contractorNotApplicable.body.permit.readiness.attestations[1],
    ).toMatchObject({
      requirementId: "contractor_simops_coordination",
      state: "NOT_APPLICABLE",
      recordedBy: String(creator.user._id),
    });
  });
});
