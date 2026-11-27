import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { ManagementOfChange } from "../src/models/ManagementOfChange.js";
import { Project } from "../src/models/Project.js";
import { RiskAssessment } from "../src/models/RiskAssessment.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

let sequence = 0;

async function createWorksite(label = "MOC") {
  sequence += 1;

  const project = await Project.create({
    name: `${label} Project ${sequence}`,
    code: `${label}${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `${label} Site ${sequence}`,
    code: `${label}SITE${sequence}`,
  });

  return { project, site };
}

function changeBody(projectId: unknown, overrides: Record<string, unknown> = {}) {
  return {
    title: "Replace process pump",
    reason: "The existing pump is beyond its service life.",
    scope: "Replace the pump and associated pipework at the north elevation.",
    changeType: "PERMANENT",
    plannedStartAt: "2026-12-01T00:00:00.000Z",
    plannedEndAt: "2026-12-10T00:00:00.000Z",
    affectedAssets: ["Pump P-101", "Suction pipework"],
    affectedPeople: ["Maintenance team"],
    project: String(projectId),
    ...overrides,
  };
}

function assessmentBody(overrides: Record<string, unknown> = {}) {
  return {
    qhseRisks: "Loss of containment and pump failure during changeover.",
    environmentalAspects: "Potential minor spill of process fluid.",
    legalAndClientObligations: "Client permit and pressure-system requirements.",
    competenceRequirements: "Mechanical fitter and authorised isolator.",
    procedureChanges: "Update isolation and pump changeover procedure.",
    emergencyArrangements: "Spill response and first-aid arrangements remain.",
    interfaces: "Maintenance, operations and contractor interfaces.",
    ...overrides,
  };
}

function createChange(
  authorization: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post("/api/management-of-change")
    .set("Authorization", authorization)
    .send(body);
}

function getChange(authorization: string, id: string) {
  return request(app)
    .get(`/api/management-of-change/${id}`)
    .set("Authorization", authorization);
}

function submitChange(authorization: string, id: string) {
  return request(app)
    .post(`/api/management-of-change/${id}/submit`)
    .set("Authorization", authorization)
    .send({});
}

function approveChange(
  authorization: string,
  id: string,
  stage: "technical" | "management",
  body: Record<string, unknown> = {
    decision: "APPROVED",
    comments: "Approval recorded.",
  },
) {
  return request(app)
    .post(`/api/management-of-change/${id}/approvals/${stage}`)
    .set("Authorization", authorization)
    .send(body);
}

function implementationBody() {
  return {
    controls: "Isolation and permit controls.",
    testingPlan: "Pressure test.",
    communicationPlan: "Brief operations.",
    rollbackPlan: "Reinstate old pump.",
    updatedDocuments: ["Procedure"],
    briefingCompleted: true,
  };
}

async function assessChange(authorization: string, id: string) {
  return request(app)
    .patch(`/api/management-of-change/${id}/assessment`)
    .set("Authorization", authorization)
    .send(assessmentBody());
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("management of change API", () => {
  it("requires authentication and denies ordinary employees", async () => {
    const unauthenticated = await request(app).get(
      "/api/management-of-change",
    );

    expect(unauthenticated.status).toBe(401);

    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const forbidden = await request(app)
      .get("/api/management-of-change")
      .set("Authorization", employee.authorization);

    expect(forbidden.status).toBe(403);
  });

  it("lets supervisors read the register but not create changes", async () => {
    const { project, site } = await createWorksite();
    const supervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });

    const list = await request(app)
      .get("/api/management-of-change")
      .set("Authorization", supervisor.authorization);

    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([]);
    expect(list.body.approvalPolicy).toMatchObject({
      sop: "A03",
      sopStatus: "DRAFT",
      activationConfirmed: false,
      approvalAllowed: false,
    });

    const created = await createChange(
      supervisor.authorization,
      changeBody(project._id),
    );

    expect(created.status).toBe(403);
  });

  it("creates a uniquely referenced draft with stable identifiers", async () => {
    const { project, site } = await createWorksite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const first = await createChange(officer.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
      status: "APPROVED",
      approvals: [{ approvalType: "TECHNICAL", decision: "APPROVED" }],
    });

    expect(first.status).toBe(201);
    expect(first.body.item).toMatchObject({
      status: "DRAFT",
      title: "Replace process pump",
      project: { id: String(project._id), name: project.name },
      site: { id: String(site._id), name: site.name },
      changeOwner: { id: String(officer.user._id) },
      approvals: [],
    });
    expect(first.body.item.id).toMatch(/^[a-f0-9]{24}$/);
    expect(first.body.item).not.toHaveProperty("_id");
    expect(first.body.item.reference).toMatch(/^MOC-\d{8}-[A-F0-9]{24}$/);

    const second = await createChange(officer.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });

    expect(second.status).toBe(201);
    expect(second.body.item.reference).not.toBe(first.body.item.reference);

    const audit = await AuditLog.findOne({
      entityType: "ManagementOfChange",
      entityId: first.body.item.id,
      action: "management_of_change.created",
    }).lean();

    expect(audit).not.toBeNull();
    expect(audit?.after).toMatchObject({ status: "DRAFT" });
    // Free-text change content must never reach the audit log.
    expect(JSON.stringify(audit?.after)).not.toContain("Replace process pump");
    expect(JSON.stringify(audit?.after)).not.toContain(
      "The existing pump is beyond its service life.",
    );
  });

  it("opens records by the API id and rejects malformed identifiers", async () => {
    const { project, site } = await createWorksite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const created = await createChange(officer.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });

    const detail = await getChange(officer.authorization, created.body.item.id);

    expect(detail.status).toBe(200);
    expect(detail.body.item.id).toBe(created.body.item.id);
    expect(detail.body.item).not.toHaveProperty("_id");
    expect(detail.body.item.site.id).toBe(String(site._id));

    const malformed = await getChange(officer.authorization, "not-an-id");

    expect(malformed.status).toBe(400);
    expect(malformed.body.message).toMatch(/Invalid change request id/i);

    const missing = await getChange(
      officer.authorization,
      "64b000000000000000000001",
    );

    expect(missing.status).toBe(404);
  });

  it("searches, filters and paginates the register", async () => {
    const { project, site } = await createWorksite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const pump = await createChange(officer.authorization, {
      ...changeBody(project._id, { title: "Pump replacement" }),
      site: String(site._id),
    });
    const valve = await createChange(officer.authorization, {
      ...changeBody(project._id, {
        title: "Valve change",
        reason: "A leaking valve must be replaced.",
      }),
      site: String(site._id),
    });

    const assessed = await request(app)
      .patch(
        `/api/management-of-change/${valve.body.item.id}/assessment`,
      )
      .set("Authorization", officer.authorization)
      .send(assessmentBody());

    expect(assessed.status).toBe(200);

    const bySearch = await request(app)
      .get("/api/management-of-change")
      .query({ q: "pump" })
      .set("Authorization", officer.authorization);

    expect(bySearch.status).toBe(200);
    expect(bySearch.body.items).toHaveLength(1);
    expect(bySearch.body.items[0].id).toBe(pump.body.item.id);

    const byStatus = await request(app)
      .get("/api/management-of-change")
      .query({ status: "ASSESSMENT" })
      .set("Authorization", officer.authorization);

    expect(byStatus.status).toBe(200);
    expect(byStatus.body.items).toHaveLength(1);
    expect(byStatus.body.items[0].id).toBe(valve.body.item.id);

    const byProject = await request(app)
      .get("/api/management-of-change")
      .query({ projectId: String(project._id), siteId: String(site._id) })
      .set("Authorization", officer.authorization);

    expect(byProject.status).toBe(200);
    expect(byProject.body.items).toHaveLength(2);

    const paged = await request(app)
      .get("/api/management-of-change")
      .query({ page: 1, limit: 1 })
      .set("Authorization", officer.authorization);

    expect(paged.status).toBe(200);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });

    const invalidStatus = await request(app)
      .get("/api/management-of-change")
      .query({ status: "NOT_A_STATUS" })
      .set("Authorization", officer.authorization);

    expect(invalidStatus.status).toBe(400);
  });

  it("keeps records isolated by site and by ownership", async () => {
    const siteA = await createWorksite("ISOA");
    const siteB = await createWorksite("ISOB");
    const officerA = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [siteA.site._id],
    });
    const officerB = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [siteB.site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const siteRecord = await createChange(officerA.authorization, {
      ...changeBody(siteA.project._id),
      site: String(siteA.site._id),
    });
    const projectRecord = await createChange(
      officerA.authorization,
      changeBody(siteA.project._id),
    );

    expect(siteRecord.status).toBe(201);
    expect(projectRecord.status).toBe(201);

    const deniedCreate = await createChange(officerB.authorization, {
      ...changeBody(siteA.project._id),
      site: String(siteA.site._id),
    });

    expect(deniedCreate.status).toBe(404);

    const listB = await request(app)
      .get("/api/management-of-change")
      .set("Authorization", officerB.authorization);

    expect(listB.status).toBe(200);
    expect(listB.body.items).toEqual([]);

    const deniedSiteFilter = await request(app)
      .get("/api/management-of-change")
      .query({ siteId: String(siteA.site._id) })
      .set("Authorization", officerB.authorization);

    expect(deniedSiteFilter.status).toBe(404);

    expect(
      (await getChange(officerB.authorization, siteRecord.body.item.id)).status,
    ).toBe(404);
    expect(
      (
        await getChange(
          officerB.authorization,
          projectRecord.body.item.id,
        )
      ).status,
    ).toBe(404);

    expect(
      (
        await request(app)
          .patch(
            `/api/management-of-change/${siteRecord.body.item.id}/assessment`,
          )
          .set("Authorization", officerB.authorization)
          .send(assessmentBody())
      ).status,
    ).toBe(404);

    expect(
      (await getChange(officerA.authorization, projectRecord.body.item.id))
        .status,
    ).toBe(200);
    expect(
      (await getChange(manager.authorization, siteRecord.body.item.id)).status,
    ).toBe(200);
  });

  it("validates create fields and project/site relationships", async () => {
    const siteA = await createWorksite("VALA");
    const siteB = await createWorksite("VALB");
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [siteA.site._id],
    });

    const missingTitle = await createChange(officer.authorization, {
      ...changeBody(siteA.project._id),
      title: "   ",
    });
    expect(missingTitle.status).toBe(400);

    const badDates = await createChange(officer.authorization, {
      ...changeBody(siteA.project._id),
      plannedStartAt: "2026-12-10T00:00:00.000Z",
      plannedEndAt: "2026-12-01T00:00:00.000Z",
    });
    expect(badDates.status).toBe(400);

    const mismatchedSite = await createChange(officer.authorization, {
      ...changeBody(siteA.project._id),
      site: String(siteB.site._id),
    });
    expect(mismatchedSite.status).toBe(400);

    const unknownProject = await createChange(officer.authorization, {
      ...changeBody("64b000000000000000000001"),
    });
    expect(unknownProject.status).toBe(404);
  });

  it("saves complete assessments, records history and ignores status injection", async () => {
    const { project, site } = await createWorksite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const created = await createChange(officer.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });

    const incomplete = await request(app)
      .patch(
        `/api/management-of-change/${created.body.item.id}/assessment`,
      )
      .set("Authorization", officer.authorization)
      .send({ ...assessmentBody(), qhseRisks: "" });

    expect(incomplete.status).toBe(400);

    const saved = await request(app)
      .patch(`/api/management-of-change/${created.body.item.id}/assessment`)
      .set("Authorization", officer.authorization)
      .send({
        ...assessmentBody(),
        status: "PENDING_APPROVAL",
      });

    expect(saved.status).toBe(200);
    expect(saved.body.item.status).toBe("ASSESSMENT");
    expect(saved.body.item.impactAssessment.qhseRisks).toContain(
      "Loss of containment",
    );

    const history = await request(app)
      .get(
        `/api/management-of-change/${created.body.item.id}/history`,
      )
      .set("Authorization", officer.authorization);

    expect(history.status).toBe(200);
    expect(history.body.data.history.map((entry: { action: string }) => entry.action))
      .toEqual(
        expect.arrayContaining([
          "management_of_change.created",
          "management_of_change.assessment_updated",
        ]),
      );

    const second = await createChange(officer.authorization, {
      ...changeBody(project._id, { title: "Other change" }),
      site: String(site._id),
    });

    const secondHistory = await request(app)
      .get(
        `/api/management-of-change/${second.body.item.id}/history`,
      )
      .set("Authorization", officer.authorization);

    expect(secondHistory.status).toBe(200);
    expect(
      secondHistory.body.data.history.every(
        (entry: { entityId: string }) =>
          entry.entityId === second.body.item.id,
      ),
    ).toBe(true);
  });

  it("prevents linking a risk assessment from another project", async () => {
    const siteA = await createWorksite("LKA");
    const siteB = await createWorksite("LKB");
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [siteA.site._id],
    });

    const created = await createChange(officer.authorization, {
      ...changeBody(siteA.project._id),
      site: String(siteA.site._id),
    });

    const otherAssessment = await RiskAssessment.create({
      title: "Other project assessment",
      project: siteB.project._id,
      owner: officer.user._id,
      createdBy: officer.user._id,
      status: "APPROVED",
    });

    const rejected = await request(app)
      .patch(`/api/management-of-change/${created.body.item.id}/assessment`)
      .set("Authorization", officer.authorization)
      .send(
        assessmentBody({
          riskAssessment: String(otherAssessment._id),
        }),
      );

    expect(rejected.status).toBe(409);

    const sameProjectAssessment = await RiskAssessment.create({
      title: "Same project assessment",
      project: siteA.project._id,
      site: siteA.site._id,
      owner: officer.user._id,
      createdBy: officer.user._id,
      status: "APPROVED",
    });

    const accepted = await request(app)
      .patch(`/api/management-of-change/${created.body.item.id}/assessment`)
      .set("Authorization", officer.authorization)
      .send(
        assessmentBody({
          riskAssessment: String(sameProjectAssessment._id),
        }),
      );

    expect(accepted.status).toBe(200);
    expect(accepted.body.item.impactAssessment.riskAssessment).toMatchObject({
      id: String(sameProjectAssessment._id),
      title: "Same project assessment",
    });
  });

  it("blocks submission and implementation until delegated approval authorities exist", async () => {
    const { project, site } = await createWorksite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const created = await createChange(manager.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });
    const id = created.body.item.id;

    const prematureSubmit = await request(app)
      .post(`/api/management-of-change/${id}/submit`)
      .set("Authorization", manager.authorization)
      .send({});

    expect(prematureSubmit.status).toBe(409);

    await request(app)
      .patch(`/api/management-of-change/${id}/assessment`)
      .set("Authorization", manager.authorization)
      .send(assessmentBody());

    const blockedSubmit = await request(app)
      .post(`/api/management-of-change/${id}/submit`)
      .set("Authorization", manager.authorization)
      .send({});

    expect(blockedSubmit.status).toBe(409);
    expect(blockedSubmit.body.message).toMatch(
      /formal management confirmation/i,
    );

    const adminSubmit = await request(app)
      .post(`/api/management-of-change/${id}/submit`)
      .set("Authorization", admin.authorization)
      .send({});

    expect(adminSubmit.status).toBe(409);

    const officerSubmit = await request(app)
      .post(`/api/management-of-change/${id}/submit`)
      .set("Authorization", officer.authorization)
      .send({});

    expect(officerSubmit.status).toBe(403);

    const implementationBlocked = await request(app)
      .patch(`/api/management-of-change/${id}/implementation`)
      .set("Authorization", manager.authorization)
      .send({
        controls: "Isolation and permit controls.",
        testingPlan: "Pressure test.",
        communicationPlan: "Brief operations.",
        rollbackPlan: "Reinstate old pump.",
        updatedDocuments: ["Procedure"],
        briefingCompleted: true,
      });

    expect(implementationBlocked.status).toBe(409);

    // Even a manually forced APPROVED status cannot bypass the recorded
    // approval requirement.
    await ManagementOfChange.updateOne(
      { _id: id },
      { $set: { status: "APPROVED" } },
    );

    const forcedApproval = await request(app)
      .patch(`/api/management-of-change/${id}/implementation`)
      .set("Authorization", manager.authorization)
      .send({
        controls: "Isolation and permit controls.",
        testingPlan: "Pressure test.",
        communicationPlan: "Brief operations.",
        rollbackPlan: "Reinstate old pump.",
        updatedDocuments: ["Procedure"],
        briefingCompleted: true,
      });

    expect(forcedApproval.status).toBe(409);
    expect(forcedApproval.body.message).toMatch(/technical and management approvals/i);

    await ManagementOfChange.updateOne(
      { _id: id },
      {
        $set: {
          status: "VERIFICATION",
          "verification.testingCompleted": true,
          "verification.inspectionCompleted": true,
          "verification.actionsClosed": true,
        },
      },
    );

    const forcedClose = await request(app)
      .post(`/api/management-of-change/${id}/close`)
      .set("Authorization", manager.authorization)
      .send({});

    expect(forcedClose.status).toBe(409);
    expect(forcedClose.body.message).toMatch(/technical and management approvals/i);

    const detail = await getChange(manager.authorization, id);
    expect(detail.body.item.status).toBe("VERIFICATION");
    expect(detail.body.item.approvals).toEqual([]);
  });

  it("protects record history with the same site scope", async () => {
    const siteA = await createWorksite("HISA");
    const siteB = await createWorksite("HISB");
    const officerA = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [siteA.site._id],
    });
    const officerB = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [siteB.site._id],
    });

    const created = await createChange(officerA.authorization, {
      ...changeBody(siteA.project._id),
      site: String(siteA.site._id),
    });

    const denied = await request(app)
      .get(`/api/management-of-change/${created.body.item.id}/history`)
      .set("Authorization", officerB.authorization);

    expect(denied.status).toBe(404);

    const allowed = await request(app)
      .get(`/api/management-of-change/${created.body.item.id}/history`)
      .set("Authorization", officerA.authorization);

    expect(allowed.status).toBe(200);
    expect(allowed.body.data.history.length).toBeGreaterThan(0);
  });
});

describe("management of change two-stage approval", () => {
  it("records technical then management approval before implementation", async () => {
    vi.stubEnv("MOC_APPROVAL_ACTIVATED", "true");

    const { project, site } = await createWorksite("APPR");
    const owner = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const technicalManager = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const created = await createChange(owner.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });
    const id = created.body.item.id;

    expect((await assessChange(owner.authorization, id)).status).toBe(200);

    const submitted = await submitChange(manager.authorization, id);

    expect(submitted.status).toBe(200);
    expect(submitted.body.item.status).toBe("PENDING_APPROVAL");
    expect(submitted.body.item.submittedBy).toMatchObject({
      id: String(manager.user._id),
    });
    expect(submitted.body.item.submittedAt).toEqual(expect.any(String));

    const adminTechnical = await approveChange(
      admin.authorization,
      id,
      "technical",
    );

    expect(adminTechnical.status).toBe(403);

    const officerTechnical = await approveChange(
      owner.authorization,
      id,
      "technical",
    );

    expect(officerTechnical.status).toBe(403);

    const managementFirst = await approveChange(
      admin.authorization,
      id,
      "management",
    );

    expect(managementFirst.status).toBe(409);
    expect(managementFirst.body.message).toMatch(/technical approval first/i);

    const technical = await approveChange(
      technicalManager.authorization,
      id,
      "technical",
      {
        decision: "APPROVED",
        comments: "Technical controls reviewed and accepted.",
      },
    );

    expect(technical.status).toBe(200);
    expect(technical.body.item.status).toBe("PENDING_APPROVAL");
    expect(technical.body.item.approvals).toHaveLength(1);
    expect(technical.body.item.approvals[0]).toMatchObject({
      approvalType: "TECHNICAL",
      decision: "APPROVED",
      comments: "Technical controls reviewed and accepted.",
      approver: { id: String(technicalManager.user._id) },
      authorityBasis:
        "SOP A03 (draft) - HSE manager technical approval",
    });
    expect(technical.body.item.approvals[0].decidedAt).toEqual(
      expect.any(String),
    );

    const managerManagement = await approveChange(
      technicalManager.authorization,
      id,
      "management",
    );

    expect(managerManagement.status).toBe(403);

    const management = await approveChange(
      admin.authorization,
      id,
      "management",
      {
        decision: "APPROVED",
        comments: "Management approval granted.",
      },
    );

    expect(management.status).toBe(200);
    expect(management.body.item.status).toBe("APPROVED");
    expect(management.body.item.approvals).toHaveLength(2);
    expect(management.body.item.approvals[1]).toMatchObject({
      approvalType: "MANAGEMENT",
      decision: "APPROVED",
      comments: "Management approval granted.",
      approver: { id: String(admin.user._id) },
      authorityBasis:
        "SOP A03 (draft) - administrator management approval",
    });

    const implementation = await request(app)
      .patch(`/api/management-of-change/${id}/implementation`)
      .set("Authorization", manager.authorization)
      .send(implementationBody());

    expect(implementation.status).toBe(200);
    expect(implementation.body.item.status).toBe("IMPLEMENTING");

    const technicalAudit = await AuditLog.findOne({
      entityType: "ManagementOfChange",
      entityId: id,
      action: "management_of_change.technical_approved",
    }).lean();
    const managementAudit = await AuditLog.findOne({
      entityType: "ManagementOfChange",
      entityId: id,
      action: "management_of_change.management_approved",
    }).lean();

    expect(technicalAudit?.after).toMatchObject({
      status: "PENDING_APPROVAL",
      approvals: [
        expect.objectContaining({
          approvalType: "TECHNICAL",
          decision: "APPROVED",
          comments: "Technical controls reviewed and accepted.",
        }),
      ],
    });
    expect(managementAudit?.after).toMatchObject({
      status: "APPROVED",
      approvals: expect.arrayContaining([
        expect.objectContaining({
          approvalType: "TECHNICAL",
          decision: "APPROVED",
        }),
        expect.objectContaining({
          approvalType: "MANAGEMENT",
          decision: "APPROVED",
          comments: "Management approval granted.",
        }),
      ]),
    });
  });

  it("blocks self-approval and duplicate approval stages", async () => {
    vi.stubEnv("MOC_APPROVAL_ACTIVATED", "true");

    const { project, site } = await createWorksite("SELF");
    const ownerManager = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });
    const otherManager = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const created = await createChange(ownerManager.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });
    const id = created.body.item.id;

    await assessChange(ownerManager.authorization, id);
    expect((await submitChange(ownerManager.authorization, id)).status).toBe(
      200,
    );

    const selfTechnical = await approveChange(
      ownerManager.authorization,
      id,
      "technical",
    );

    expect(selfTechnical.status).toBe(403);
    expect(selfTechnical.body.message).toMatch(/own, created or submitted/i);

    const technical = await approveChange(
      otherManager.authorization,
      id,
      "technical",
    );

    expect(technical.status).toBe(200);

    const duplicate = await approveChange(
      otherManager.authorization,
      id,
      "technical",
    );

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toMatch(/already been recorded/i);
  });

  it("blocks self-approval at the management stage", async () => {
    vi.stubEnv("MOC_APPROVAL_ACTIVATED", "true");

    const { project, site } = await createWorksite("SELFM");
    const adminOwner = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await createChange(adminOwner.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });
    const id = created.body.item.id;

    await assessChange(adminOwner.authorization, id);
    expect((await submitChange(adminOwner.authorization, id)).status).toBe(
      200,
    );
    expect((await approveChange(manager.authorization, id, "technical")).status)
      .toBe(200);

    const selfManagement = await approveChange(
      adminOwner.authorization,
      id,
      "management",
    );

    expect(selfManagement.status).toBe(403);
    expect(selfManagement.body.message).toMatch(/own, created or submitted/i);
  });

  it("blocks implementation after rejection at either stage", async () => {
    vi.stubEnv("MOC_APPROVAL_ACTIVATED", "true");

    const { project, site } = await createWorksite("REJT");
    const owner = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const submitter = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const created = await createChange(owner.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });
    const id = created.body.item.id;

    await assessChange(owner.authorization, id);
    expect((await submitChange(submitter.authorization, id)).status).toBe(200);

    const rejected = await approveChange(
      manager.authorization,
      id,
      "technical",
      {
        decision: "REJECTED",
        comments: "Technical controls are insufficient.",
      },
    );

    expect(rejected.status).toBe(200);
    expect(rejected.body.item.status).toBe("REJECTED");
    expect(rejected.body.item.approvals).toHaveLength(1);

    const implementation = await request(app)
      .patch(`/api/management-of-change/${id}/implementation`)
      .set("Authorization", manager.authorization)
      .send(implementationBody());

    expect(implementation.status).toBe(409);

    const managementAfterRejection = await approveChange(
      admin.authorization,
      id,
      "management",
    );

    expect(managementAfterRejection.status).toBe(409);

    const rejectedAudit = await AuditLog.findOne({
      entityType: "ManagementOfChange",
      entityId: id,
      action: "management_of_change.technical_rejected",
    }).lean();

    expect(rejectedAudit?.after).toMatchObject({
      status: "REJECTED",
      approvals: [
        expect.objectContaining({
          decision: "REJECTED",
          comments: "Technical controls are insufficient.",
        }),
      ],
    });
  });

  it("blocks implementation after management rejection", async () => {
    vi.stubEnv("MOC_APPROVAL_ACTIVATED", "true");

    const { project, site } = await createWorksite("REJM");
    const owner = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const submitter = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const created = await createChange(owner.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });
    const id = created.body.item.id;

    await assessChange(owner.authorization, id);
    expect((await submitChange(submitter.authorization, id)).status).toBe(200);
    expect((await approveChange(manager.authorization, id, "technical")).status)
      .toBe(200);

    const rejected = await approveChange(
      admin.authorization,
      id,
      "management",
      {
        decision: "REJECTED",
        comments: "Management does not accept the residual risk.",
      },
    );

    expect(rejected.status).toBe(200);
    expect(rejected.body.item.status).toBe("REJECTED");
    expect(rejected.body.item.approvals).toHaveLength(2);
    expect(rejected.body.item.approvals[1]).toMatchObject({
      approvalType: "MANAGEMENT",
      decision: "REJECTED",
      comments: "Management does not accept the residual risk.",
    });

    const implementation = await request(app)
      .patch(`/api/management-of-change/${id}/implementation`)
      .set("Authorization", manager.authorization)
      .send(implementationBody());

    expect(implementation.status).toBe(409);

    const managementAudit = await AuditLog.findOne({
      entityType: "ManagementOfChange",
      entityId: id,
      action: "management_of_change.management_rejected",
    }).lean();

    expect(managementAudit?.after).toMatchObject({
      status: "REJECTED",
      approvals: expect.arrayContaining([
        expect.objectContaining({
          approvalType: "MANAGEMENT",
          decision: "REJECTED",
          comments: "Management does not accept the residual risk.",
        }),
      ]),
    });
  });

  it("validates approval payloads and ignores client-controlled fields", async () => {
    vi.stubEnv("MOC_APPROVAL_ACTIVATED", "true");

    const { project, site } = await createWorksite("APV");
    const owner = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const technicalManager = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const created = await createChange(owner.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });
    const id = created.body.item.id;

    await assessChange(owner.authorization, id);
    await submitChange(manager.authorization, id);

    const invalidDecision = await approveChange(
      technicalManager.authorization,
      id,
      "technical",
      { decision: "MAYBE", comments: "Invalid." },
    );
    expect(invalidDecision.status).toBe(400);

    const injectedApprover = await approveChange(
      technicalManager.authorization,
      id,
      "technical",
      {
        decision: "APPROVED",
        comments: "Approved.",
        approver: String(owner.user._id),
        decidedAt: "2020-01-01T00:00:00.000Z",
        authorityBasis: "Client supplied",
      },
    );
    expect(injectedApprover.status).toBe(400);

    const approved = await approveChange(
      technicalManager.authorization,
      id,
      "technical",
      { decision: "APPROVED", comments: "  Approved with review.  " },
    );

    expect(approved.status).toBe(200);
    expect(approved.body.item.approvals[0]).toMatchObject({
      approver: { id: String(technicalManager.user._id) },
      comments: "Approved with review.",
      authorityBasis:
        "SOP A03 (draft) - HSE manager technical approval",
    });
    expect(approved.body.item.approvals[0].decidedAt).not.toBe(
      "2020-01-01T00:00:00.000Z",
    );
  });

  it("keeps approval endpoints blocked while A03 is not activated", async () => {
    const { project, site } = await createWorksite("INACT");
    const owner = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const created = await createChange(owner.authorization, {
      ...changeBody(project._id),
      site: String(site._id),
    });
    const id = created.body.item.id;

    await assessChange(owner.authorization, id);

    const submit = await submitChange(manager.authorization, id);
    expect(submit.status).toBe(409);
    expect(submit.body.message).toMatch(/formal management confirmation/i);

    await ManagementOfChange.updateOne(
      { _id: id },
      { $set: { status: "PENDING_APPROVAL" } },
    );

    const technical = await approveChange(
      manager.authorization,
      id,
      "technical",
    );
    const management = await approveChange(admin.authorization, id, "management");

    expect(technical.status).toBe(409);
    expect(management.status).toBe(409);
    expect(technical.body.message).toMatch(
      /formal management confirmation/i,
    );
  });
});
