import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

let sequence = 0;

async function createSite() {
  sequence += 1;

  const project = await Project.create({
    name: `Risk Project ${sequence}`,
    code: `RISK${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Risk Site ${sequence}`,
    code: `RSITE${sequence}`,
  });

  return { project, site };
}

function hazard(overrides: Record<string, unknown> = {}) {
  return {
    hazard: "Work at height",
    consequences: "Fall from scaffold level 3",
    existingControls: "Guardrails and toe boards",
    likelihood: 3,
    severity: 4,
    residualLikelihood: 2,
    residualSeverity: 3,
    additionalControls: "Harness anchor points",
    ...overrides,
  };
}

function assessmentBody(
  projectId: unknown,
  ownerId: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    title: "Scaffold erection risk assessment",
    description: "Assessment for the north elevation scaffold.",
    projectId: String(projectId),
    ownerId: String(ownerId),
    reviewDate: new Date("2026-06-01T00:00:00.000Z").toISOString(),
    hazards: [hazard()],
    ...overrides,
  };
}

function createAssessment(
  authorization: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post("/api/risk-assessments")
    .set("Authorization", authorization)
    .send(body);
}

function updateStatus(
  authorization: string,
  assessmentId: string,
  status: string,
) {
  return request(app)
    .patch(`/api/risk-assessments/${assessmentId}/status`)
    .set("Authorization", authorization)
    .send({ status });
}

describe("risk assessments API", () => {
  it("requires authentication", async () => {
    const list = await request(app).get("/api/risk-assessments");
    const assignees = await request(app).get("/api/risk-assessments/assignees");

    expect(list.status).toBe(401);
    expect(assignees.status).toBe(401);
  });

  it("denies ordinary employees and supervisors the register", async () => {
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const supervisor = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });

    const employeeList = await request(app)
      .get("/api/risk-assessments")
      .set("Authorization", employee.authorization);
    const supervisorList = await request(app)
      .get("/api/risk-assessments")
      .set("Authorization", supervisor.authorization);

    expect(employeeList.status).toBe(403);
    expect(supervisorList.status).toBe(200);
    expect(supervisorList.body.riskAssessments).toEqual([]);
  });

  it("creates a draft with server-derived inherent and residual levels", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const created = await createAssessment(officer.authorization, {
      ...assessmentBody(project._id, officer.user._id),
      siteId: String(site._id),
    });

    expect(created.status).toBe(201);
    expect(created.body.riskAssessment).toMatchObject({
      status: "DRAFT",
      project: { id: String(project._id) },
      site: { id: String(site._id) },
      owner: { id: String(officer.user._id) },
    });
    expect(created.body.riskAssessment.hazards[0]).toMatchObject({
      hazard: "Work at height",
      likelihood: 3,
      severity: 4,
      // 3 × 4 = 12 → HIGH
      inherentLevel: "HIGH",
      residualLikelihood: 2,
      residualSeverity: 3,
      // 2 × 3 = 6 → MEDIUM
      residualLevel: "MEDIUM",
    });

    const audit = await AuditLog.findOne({
      entityType: "RiskAssessment",
      action: "risk_assessment.created",
    }).lean();

    expect(audit).not.toBeNull();
    expect(audit?.after).toMatchObject({
      status: "DRAFT",
      hazardCount: 1,
      highestInherentLevel: "HIGH",
      highestResidualLevel: "MEDIUM",
    });
    // Hazard free text must never reach the audit log.
    expect(JSON.stringify(audit?.after)).not.toContain("Work at height");
    expect(JSON.stringify(audit?.after)).not.toContain("Harness anchor points");
  });

  it("records ordered JHA task steps and links hazards to them", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const firstStepId = "64b000000000000000000001";

    const created = await createAssessment(officer.authorization, {
      ...assessmentBody(project._id, officer.user._id),
      siteId: String(site._id),
      taskSteps: [
        { id: firstStepId, description: "Erect scaffold to the second lift" },
        { description: "Inspect the completed scaffold" },
      ],
      hazards: [
        hazard({ taskStepId: firstStepId }),
        hazard({
          hazard: "Dropped tools",
          consequences: "Tool strikes a worker below",
          taskStepId: null,
        }),
      ],
    });

    expect(created.status).toBe(201);
    expect(created.body.riskAssessment.taskSteps).toHaveLength(2);
    expect(created.body.riskAssessment.taskSteps[0]).toMatchObject({
      id: firstStepId,
      sequence: 0,
      description: "Erect scaffold to the second lift",
    });
    expect(created.body.riskAssessment.taskSteps[1].sequence).toBe(1);
    expect(created.body.riskAssessment.taskSteps[1].id).toMatch(
      /^[0-9a-f]{24}$/,
    );
    expect(created.body.riskAssessment.hazards[0].taskStepId).toBe(
      firstStepId,
    );
    expect(created.body.riskAssessment.hazards[1].taskStepId).toBeNull();

    const audit = await AuditLog.findOne({
      entityType: "RiskAssessment",
      action: "risk_assessment.created",
    }).lean();

    expect(audit?.after).toMatchObject({
      taskStepCount: 2,
      generalHazardCount: 1,
    });
    expect(JSON.stringify(audit?.after)).not.toContain("Erect scaffold");

    const unknownStep = await createAssessment(officer.authorization, {
      ...assessmentBody(project._id, officer.user._id),
      siteId: String(site._id),
      taskSteps: [{ description: "Only step" }],
      hazards: [
        hazard({ taskStepId: "64b000000000000000000099" }),
      ],
    });

    expect(unknownStep.status).toBe(400);

    const assessmentId = created.body.riskAssessment.id;
    const secondStepId = created.body.riskAssessment.taskSteps[1].id;
    const removal = await request(app)
      .patch(`/api/risk-assessments/${assessmentId}`)
      .set("Authorization", officer.authorization)
      .send({
        taskSteps: [
          { id: secondStepId, description: "Inspect the completed scaffold" },
        ],
      });

    expect(removal.status).toBe(409);
  });

  it("rejects forged risk levels and out-of-range scores", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const forged = await createAssessment(officer.authorization, {
      ...assessmentBody(project._id, officer.user._id),
      hazards: [hazard({ inherentLevel: "LOW" })],
    });
    const outOfRange = await createAssessment(officer.authorization, {
      ...assessmentBody(project._id, officer.user._id),
      hazards: [hazard({ likelihood: 9 })],
    });
    const noHazards = await createAssessment(officer.authorization, {
      ...assessmentBody(project._id, officer.user._id),
      hazards: [],
    });

    expect(forged.status).toBe(400);
    expect(outOfRange.status).toBe(400);
    expect(noHazards.status).toBe(400);
  });

  it("rejects a site that does not belong to the project", async () => {
    const first = await createSite();
    const second = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [second.site._id],
    });

    const response = await createAssessment(officer.authorization, {
      ...assessmentBody(first.project._id, officer.user._id),
      siteId: String(second.site._id),
    });

    expect(response.status).toBe(409);
  });

  it("runs the DRAFT → IN_REVIEW → APPROVED → ARCHIVED workflow", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await createAssessment(officer.authorization, {
      ...assessmentBody(project._id, officer.user._id),
      siteId: String(site._id),
    });
    const assessmentId = created.body.riskAssessment.id;

    const submitted = await updateStatus(
      officer.authorization,
      assessmentId,
      "IN_REVIEW",
    );

    expect(submitted.status).toBe(200);
    expect(submitted.body.riskAssessment).toMatchObject({
      status: "IN_REVIEW",
      submittedBy: { id: String(officer.user._id) },
    });

    // An officer cannot approve their own assessment.
    const denied = await updateStatus(
      officer.authorization,
      assessmentId,
      "APPROVED",
    );

    expect(denied.status).toBe(403);

    const approved = await updateStatus(
      manager.authorization,
      assessmentId,
      "APPROVED",
    );

    expect(approved.status).toBe(200);
    expect(approved.body.riskAssessment).toMatchObject({
      status: "APPROVED",
      approvedBy: { id: String(manager.user._id) },
    });

    // Approved assessments are immutable except for archiving.
    const editDenied = await request(app)
      .patch(`/api/risk-assessments/${assessmentId}`)
      .set("Authorization", manager.authorization)
      .send({ title: "Changed after approval" });

    expect(editDenied.status).toBe(409);

    const archived = await updateStatus(
      manager.authorization,
      assessmentId,
      "ARCHIVED",
    );

    expect(archived.status).toBe(200);
    expect(archived.body.riskAssessment).toMatchObject({
      status: "ARCHIVED",
      archivedBy: { id: String(manager.user._id) },
    });

    const terminal = await updateStatus(
      manager.authorization,
      assessmentId,
      "DRAFT",
    );

    expect(terminal.status).toBe(409);
  });

  it("lets management return an assessment to draft", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await createAssessment(officer.authorization, {
      ...assessmentBody(project._id, officer.user._id),
      siteId: String(site._id),
    });
    const assessmentId = created.body.riskAssessment.id;

    await updateStatus(officer.authorization, assessmentId, "IN_REVIEW");

    const returned = await updateStatus(
      manager.authorization,
      assessmentId,
      "DRAFT",
    );

    expect(returned.status).toBe(200);
    expect(returned.body.riskAssessment).toMatchObject({
      status: "DRAFT",
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
    });

    const edited = await request(app)
      .patch(`/api/risk-assessments/${assessmentId}`)
      .set("Authorization", officer.authorization)
      .send({ title: "Revised scaffold assessment" });

    expect(edited.status).toBe(200);
    expect(edited.body.riskAssessment.title).toBe(
      "Revised scaffold assessment",
    );
  });

  it("scopes the register to assigned sites and the author", async () => {
    const siteA = await createSite();
    const siteB = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [siteA.site._id],
    });
    const supervisorA = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [siteA.site._id],
    });
    const supervisorB = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [siteB.site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const siteAssessment = await createAssessment(officer.authorization, {
      ...assessmentBody(siteA.project._id, officer.user._id),
      siteId: String(siteA.site._id),
    });
    // Project-level assessment is visible to its author even without a site.
    const projectAssessment = await createAssessment(officer.authorization, {
      ...assessmentBody(siteA.project._id, officer.user._id),
    });

    expect(siteAssessment.status).toBe(201);
    expect(projectAssessment.status).toBe(201);

    const supervisorARegister = await request(app)
      .get("/api/risk-assessments")
      .set("Authorization", supervisorA.authorization);
    const supervisorBRegister = await request(app)
      .get("/api/risk-assessments")
      .set("Authorization", supervisorB.authorization);
    const officerRegister = await request(app)
      .get("/api/risk-assessments")
      .set("Authorization", officer.authorization);
    const managerRegister = await request(app)
      .get("/api/risk-assessments")
      .set("Authorization", manager.authorization);

    expect(
      supervisorARegister.body.riskAssessments.map(
        (assessment: { id: string }) => assessment.id,
      ),
    ).toEqual([siteAssessment.body.riskAssessment.id]);
    expect(supervisorBRegister.body.riskAssessments).toEqual([]);
    expect(
      officerRegister.body.riskAssessments.map(
        (assessment: { id: string }) => assessment.id,
      ),
    ).toEqual(
      expect.arrayContaining([
        siteAssessment.body.riskAssessment.id,
        projectAssessment.body.riskAssessment.id,
      ]),
    );
    expect(managerRegister.body.riskAssessments.length).toBe(2);

    const crossSiteDetail = await request(app)
      .get(
        `/api/risk-assessments/${siteAssessment.body.riskAssessment.id}`,
      )
      .set("Authorization", supervisorB.authorization);

    expect(crossSiteDetail.status).toBe(404);
  });

  it("denies supervisors editing and employees detail access", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const supervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const created = await createAssessment(officer.authorization, {
      ...assessmentBody(project._id, officer.user._id),
      siteId: String(site._id),
    });
    const assessmentId = created.body.riskAssessment.id;

    const supervisorEdit = await request(app)
      .patch(`/api/risk-assessments/${assessmentId}`)
      .set("Authorization", supervisor.authorization)
      .send({ title: "Supervisor edit" });
    const employeeDetail = await request(app)
      .get(`/api/risk-assessments/${assessmentId}`)
      .set("Authorization", employee.authorization);

    expect(supervisorEdit.status).toBe(403);
    expect(employeeDetail.status).toBe(403);
  });

  it("lists assignable active owners", async () => {
    const officer = await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });

    const response = await request(app)
      .get("/api/risk-assessments/assignees")
      .set("Authorization", officer.authorization);

    expect(response.status).toBe(200);
    expect(response.body.assignees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: String(officer.user._id),
          ikoshRole: "HSE_OFFICER",
        }),
      ]),
    );
  });

  it("blocks project and site deletion while referenced", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const siteAssessment = await createAssessment(officer.authorization, {
      ...assessmentBody(project._id, officer.user._id),
      siteId: String(site._id),
    });

    expect(siteAssessment.status).toBe(201);

    // A site can only be deleted once nothing references it; the risk
    // assessment is the remaining dependency here.
    const siteDelete = await request(app)
      .delete(`/api/sites/${site._id}`)
      .set("Authorization", manager.authorization);

    expect(siteDelete.status).toBe(409);

    // Project-level assessments block project deletion even without sites.
    const standaloneProject = await Project.create({
      name: "Standalone risk project",
      code: `RSA${sequence + 1}`,
    });
    const projectAssessment = await createAssessment(officer.authorization, {
      ...assessmentBody(standaloneProject._id, officer.user._id),
    });

    expect(projectAssessment.status).toBe(201);

    const projectDelete = await request(app)
      .delete(`/api/projects/${standaloneProject._id}`)
      .set("Authorization", manager.authorization);

    expect(projectDelete.status).toBe(409);
  });
});
