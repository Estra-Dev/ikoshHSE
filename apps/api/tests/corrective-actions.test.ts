import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { Attachment } from "../src/models/Attachment.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { CorrectiveAction } from "../src/models/CorrectiveAction.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { createIkoshUser, signInAsIkoshUser } from "./helpers.js";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
]);

let sequence = 0;

async function createSite() {
  sequence += 1;

  const project = await Project.create({
    name: `Project ${sequence}`,
    code: `PRJ${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Site ${sequence}`,
    code: `SITE${sequence}`,
  });

  return { project, site };
}

function dueInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function manualBody(
  projectId: unknown,
  assignedTo: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    description: "Repair scaffold guardrails on level 2",
    source: "HSE_OBSERVATION",
    projectId: String(projectId),
    assignedTo: String(assignedTo),
    dueDate: dueInDays(7),
    ...overrides,
  };
}

function createAction(
  authorization: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post("/api/corrective-actions")
    .set("Authorization", authorization)
    .send(body);
}

function updateStatus(
  authorization: string,
  actionId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .patch(`/api/corrective-actions/${actionId}/status`)
    .set("Authorization", authorization)
    .send(body);
}

function uploadEvidence(
  authorization: string,
  actionId: string,
  options: { entityType?: string; entityId?: string } = {},
) {
  const call = request(app)
    .post("/api/attachments")
    .set("Authorization", authorization)
    .attach("file", PNG, {
      filename: "evidence.png",
      contentType: "image/png",
    });

  call.field("entityType", options.entityType ?? "corrective_action");
  call.field("entityId", options.entityId ?? actionId);

  return call;
}

describe("corrective actions API", () => {
  it("requires authentication", async () => {
    const list = await request(app).get("/api/corrective-actions");
    const assignees = await request(app).get(
      "/api/corrective-actions/assignees",
    );

    expect(list.status).toBe(401);
    expect(assignees.status).toBe(401);
  });

  it("denies ordinary employees and supervisors access to create", async () => {
    const { project } = await createSite();
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const supervisor = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });

    const employeeList = await request(app)
      .get("/api/corrective-actions")
      .set("Authorization", employee.authorization);

    expect(employeeList.status).toBe(403);

    const supervisorCreate = await createAction(
      supervisor.authorization,
      manualBody(project._id, supervisor.user._id),
    );

    expect(supervisorCreate.status).toBe(403);
    expect(await CorrectiveAction.countDocuments({})).toBe(0);
  });

  it("lets an HSE officer create a manual action at an assigned site", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const supervisor = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });

    const response = await createAction(
      officer.authorization,
      manualBody(project._id, supervisor.user._id, {
        siteId: String(site._id),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.correctiveAction).toMatchObject({
      source: "HSE_OBSERVATION",
      status: "OPEN",
      incident: null,
      project: { id: String(project._id), name: project.name },
      site: { id: String(site._id), name: site.name, code: site.code },
      assignedTo: {
        id: String(supervisor.user._id),
        firstName: supervisor.user.firstName,
        lastName: supervisor.user.lastName,
      },
      createdBy: { id: String(officer.user._id) },
      completionNotes: null,
      verifiedAt: null,
    });

    const log = await AuditLog.findOne({
      action: "corrective_action.created",
    }).lean();

    expect(log).not.toBeNull();
    expect(log?.entityType).toBe("CorrectiveAction");
    expect(log?.after).toMatchObject({ status: "OPEN", source: "HSE_OBSERVATION" });
    expect(log?.after).not.toHaveProperty("description");
  });

  it("derives project and site from an incident-linked action", async () => {
    const { project, site } = await createSite();
    const reporter = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const incident = await request(app)
      .post("/api/incidents")
      .set("Authorization", reporter.authorization)
      .send({
        siteId: String(site._id),
        type: "NEAR_MISS",
        title: "Dropped tool near walkway",
        description: "A spanner fell from the scaffold.",
        occurredAt: new Date().toISOString(),
      });

    expect(incident.status).toBe(201);

    const created = await createAction(manager.authorization, {
      description: "Rework scaffold tool tethering",
      source: "NEAR_MISS",
      incidentId: incident.body.incident.id,
      assignedTo: String(reporter.user._id),
      dueDate: dueInDays(5),
    });

    expect(created.status).toBe(201);
    expect(created.body.correctiveAction).toMatchObject({
      source: "NEAR_MISS",
      project: { id: String(project._id) },
      site: { id: String(site._id) },
      incident: {
        id: incident.body.incident.id,
        type: "NEAR_MISS",
        title: "Dropped tool near walkway",
      },
    });

    const mismatch = await createAction(manager.authorization, {
      description: "Mismatched source",
      source: "INCIDENT",
      incidentId: incident.body.incident.id,
      assignedTo: String(reporter.user._id),
      dueDate: dueInDays(5),
    });

    expect(mismatch.status).toBe(409);

    const suppliedProject = await createAction(manager.authorization, {
      description: "Client-supplied project",
      source: "NEAR_MISS",
      incidentId: incident.body.incident.id,
      projectId: String(project._id),
      assignedTo: String(reporter.user._id),
      dueDate: dueInDays(5),
    });

    expect(suppliedProject.status).toBe(400);
  });

  it("rejects a site outside the selected project", async () => {
    const first = await createSite();
    const second = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const response = await createAction(
      manager.authorization,
      manualBody(first.project._id, manager.user._id, {
        siteId: String(second.site._id),
      }),
    );

    expect(response.status).toBe(409);
    expect(await CorrectiveAction.countDocuments({})).toBe(0);
  });

  it("rejects employees and inactive users as assignees", async () => {
    const { project } = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const inactive = await createIkoshUser({
      ikoshRole: "HSE_OFFICER",
      isActive: false,
    });

    const employeeAssignee = await createAction(
      manager.authorization,
      manualBody(project._id, employee.user._id),
    );
    const inactiveAssignee = await createAction(
      manager.authorization,
      manualBody(project._id, inactive._id),
    );

    expect(employeeAssignee.status).toBe(400);
    expect(inactiveAssignee.status).toBe(400);
    expect(await CorrectiveAction.countDocuments({})).toBe(0);
  });

  it("scopes the register to assigned sites and direct assignments", async () => {
    const first = await createSite();
    const second = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const officerA = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [first.site._id],
    });
    const officerB = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [second.site._id],
    });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [first.site._id],
    });

    const siteAAction = await createAction(
      manager.authorization,
      manualBody(first.project._id, officerB.user._id, {
        siteId: String(first.site._id),
      }),
    );
    const siteBAction = await createAction(
      manager.authorization,
      manualBody(second.project._id, officerB.user._id, {
        siteId: String(second.site._id),
      }),
    );
    const assignedToA = await createAction(
      manager.authorization,
      manualBody(second.project._id, officerA.user._id, {
        siteId: String(second.site._id),
      }),
    );

    expect(siteAAction.status).toBe(201);
    expect(siteBAction.status).toBe(201);
    expect(assignedToA.status).toBe(201);

    const listA = await request(app)
      .get("/api/corrective-actions")
      .set("Authorization", officerA.authorization);
    const listManager = await request(app)
      .get("/api/corrective-actions")
      .set("Authorization", manager.authorization);
    const listEmployee = await request(app)
      .get("/api/corrective-actions")
      .set("Authorization", employee.authorization);

    expect(listA.status).toBe(200);
    expect(listA.body.correctiveActions).toHaveLength(2);
    expect(
      listA.body.correctiveActions.map(
        (action: { id: string }) => action.id,
      ),
    ).toEqual(
      expect.arrayContaining([
        siteAAction.body.correctiveAction.id,
        assignedToA.body.correctiveAction.id,
      ]),
    );

    expect(listManager.body.pagination.total).toBe(3);
    expect(listEmployee.status).toBe(403);

    const crossSite = await request(app)
      .get(`/api/corrective-actions/${siteBAction.body.correctiveAction.id}`)
      .set("Authorization", officerA.authorization);

    expect(crossSite.status).toBe(404);
  });

  it("filters by status, source and overdue", async () => {
    const { project } = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const overdue = await createAction(
      manager.authorization,
      manualBody(project._id, manager.user._id, {
        source: "OTHER",
        dueDate: dueInDays(-2),
      }),
    );
    await createAction(
      manager.authorization,
      manualBody(project._id, manager.user._id, {
        source: "HSE_OBSERVATION",
        dueDate: dueInDays(10),
      }),
    );

    expect(overdue.status).toBe(201);

    const overdueList = await request(app)
      .get("/api/corrective-actions?overdue=true")
      .set("Authorization", manager.authorization);
    const otherList = await request(app)
      .get("/api/corrective-actions?source=OTHER")
      .set("Authorization", manager.authorization);
    const openList = await request(app)
      .get("/api/corrective-actions?status=OPEN")
      .set("Authorization", manager.authorization);

    expect(overdueList.body.correctiveActions).toHaveLength(1);
    expect(overdueList.body.correctiveActions[0].id).toBe(
      overdue.body.correctiveAction.id,
    );
    expect(otherList.body.correctiveActions).toHaveLength(1);
    expect(openList.body.pagination.total).toBe(2);

    const invalid = await request(app)
      .get("/api/corrective-actions?status=NOPE")
      .set("Authorization", manager.authorization);

    expect(invalid.status).toBe(400);
  });

  it("lists only active HSE staff as assignees", async () => {
    await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });
    await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const inactive = await createIkoshUser({
      ikoshRole: "HSE_MANAGER",
      isActive: false,
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const response = await request(app)
      .get("/api/corrective-actions/assignees")
      .set("Authorization", manager.authorization);

    expect(response.status).toBe(200);

    const ids = response.body.assignees.map(
      (assignee: { id: string }) => assignee.id,
    );

    expect(ids).toContain(String(manager.user._id));
    expect(ids).not.toContain(String(employee.user._id));
    expect(ids).not.toContain(String(inactive._id));
    expect(
      response.body.assignees.every(
        (assignee: { firstName: string }) =>
          typeof assignee.firstName === "string",
      ),
    ).toBe(true);
  });

  it("enforces forward-only workflow and management-only verification", async () => {
    const { project, site } = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const assignee = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const otherOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const created = await createAction(
      manager.authorization,
      manualBody(project._id, assignee.user._id, {
        siteId: String(site._id),
      }),
    );
    const actionId = created.body.correctiveAction.id;

    const skipped = await updateStatus(assignee.authorization, actionId, {
      status: "COMPLETED",
      completionNotes: "Done early",
    });

    expect(skipped.status).toBe(409);

    const notAssignee = await updateStatus(
      otherOfficer.authorization,
      actionId,
      { status: "IN_PROGRESS" },
    );

    expect(notAssignee.status).toBe(403);

    const started = await updateStatus(assignee.authorization, actionId, {
      status: "IN_PROGRESS",
    });

    expect(started.status).toBe(200);
    expect(started.body.correctiveAction.status).toBe("IN_PROGRESS");

    const noNotes = await updateStatus(assignee.authorization, actionId, {
      status: "COMPLETED",
    });

    expect(noNotes.status).toBe(400);

    const completed = await updateStatus(assignee.authorization, actionId, {
      status: "COMPLETED",
      completionNotes: "Guardrails replaced and inspected.",
    });

    expect(completed.status).toBe(200);
    expect(completed.body.correctiveAction).toMatchObject({
      status: "COMPLETED",
      completionNotes: "Guardrails replaced and inspected.",
      completedBy: { id: String(assignee.user._id) },
    });
    expect(completed.body.correctiveAction.completedAt).toBeTypeOf("string");

    const assigneeVerify = await updateStatus(
      assignee.authorization,
      actionId,
      { status: "VERIFIED" },
    );

    expect(assigneeVerify.status).toBe(403);

    const verified = await updateStatus(manager.authorization, actionId, {
      status: "VERIFIED",
      verificationNotes: "Spot-checked on site.",
    });

    expect(verified.status).toBe(200);
    expect(verified.body.correctiveAction).toMatchObject({
      status: "VERIFIED",
      verificationNotes: "Spot-checked on site.",
      verifiedBy: { id: String(manager.user._id) },
    });
    expect(verified.body.correctiveAction.verifiedAt).toBeTypeOf("string");

    const reopen = await updateStatus(manager.authorization, actionId, {
      status: "COMPLETED",
      completionNotes: "Reopened",
    });

    expect(reopen.status).toBe(409);

    const verifiedEdit = await request(app)
      .patch(`/api/corrective-actions/${actionId}`)
      .set("Authorization", manager.authorization)
      .send({ description: "Changed after verification" });

    expect(verifiedEdit.status).toBe(409);

    const statusLog = await AuditLog.findOne({
      action: "corrective_action.status_changed",
      entityId: actionId,
    }).lean();

    expect(statusLog).not.toBeNull();
    expect(statusLog?.after).toMatchObject({ status: "VERIFIED" });
    expect(statusLog?.after).not.toHaveProperty("verificationNotes");
  });

  it("lets management update metadata and rejects invalid project/site moves", async () => {
    const first = await createSite();
    const second = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const officer = await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });
    const supervisor = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });

    const created = await createAction(
      manager.authorization,
      manualBody(first.project._id, officer.user._id, {
        siteId: String(first.site._id),
      }),
    );
    const actionId = created.body.correctiveAction.id;

    const updated = await request(app)
      .patch(`/api/corrective-actions/${actionId}`)
      .set("Authorization", manager.authorization)
      .send({
        description: "Updated action wording",
        assignedTo: String(supervisor.user._id),
        dueDate: dueInDays(14),
      });

    expect(updated.status).toBe(200);
    expect(updated.body.correctiveAction).toMatchObject({
      description: "Updated action wording",
      assignedTo: { id: String(supervisor.user._id) },
    });

    const updateLog = await AuditLog.findOne({
      action: "corrective_action.updated",
      entityId: actionId,
    }).lean();

    expect(updateLog).not.toBeNull();
    expect(updateLog?.after).toMatchObject({
      assignedTo: String(supervisor.user._id),
    });

    const immutable = await request(app)
      .patch(`/api/corrective-actions/${actionId}`)
      .set("Authorization", manager.authorization)
      .send({ source: "OTHER" });

    expect(immutable.status).toBe(400);

    const invalidMove = await request(app)
      .patch(`/api/corrective-actions/${actionId}`)
      .set("Authorization", manager.authorization)
      .send({ projectId: String(second.project._id) });

    expect(invalidMove.status).toBe(409);

    const officerEdit = await request(app)
      .patch(`/api/corrective-actions/${actionId}`)
      .set("Authorization", officer.authorization)
      .send({ description: "Not allowed" });

    expect(officerEdit.status).toBe(403);
  });

  it("secures CAPA evidence for upload, listing and download", async () => {
    const { project, site } = await createSite();
    const other = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const assignee = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const siteOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const otherOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [other.site._id],
    });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const created = await createAction(
      manager.authorization,
      manualBody(project._id, assignee.user._id, {
        siteId: String(site._id),
      }),
    );
    const actionId = created.body.correctiveAction.id;

    const uploaded = await uploadEvidence(assignee.authorization, actionId);
    expect(uploaded.status).toBe(201);

    const managerList = await request(app)
      .get(
        `/api/attachments?entityType=corrective_action&entityId=${actionId}`,
      )
      .set("Authorization", manager.authorization);
    const assigneeList = await request(app)
      .get(
        `/api/attachments?entityType=corrective_action&entityId=${actionId}`,
      )
      .set("Authorization", assignee.authorization);
    const unrelatedList = await request(app)
      .get(
        `/api/attachments?entityType=corrective_action&entityId=${actionId}`,
      )
      .set("Authorization", otherOfficer.authorization);
    const employeeList = await request(app)
      .get("/api/attachments")
      .set("Authorization", employee.authorization);

    expect(managerList.body.attachments).toHaveLength(1);
    expect(assigneeList.body.attachments).toHaveLength(1);
    expect(unrelatedList.body.attachments).toHaveLength(0);
    expect(employeeList.body.attachments).toHaveLength(0);

    const assigneeDownload = await request(app)
      .get(`/api/attachments/${uploaded.body.attachment.id}/download`)
      .set("Authorization", assignee.authorization);
    const employeeDownload = await request(app)
      .get(`/api/attachments/${uploaded.body.attachment.id}/download`)
      .set("Authorization", employee.authorization);
    const unrelatedDownload = await request(app)
      .get(`/api/attachments/${uploaded.body.attachment.id}/download`)
      .set("Authorization", otherOfficer.authorization);

    expect(assigneeDownload.status).toBe(200);
    expect(employeeDownload.status).toBe(404);
    expect(unrelatedDownload.status).toBe(404);

    const employeeUpload = await uploadEvidence(employee.authorization, actionId);
    const unrelatedUpload = await uploadEvidence(
      otherOfficer.authorization,
      actionId,
    );
    const siteUpload = await uploadEvidence(siteOfficer.authorization, actionId);

    expect(employeeUpload.status).toBe(404);
    expect(unrelatedUpload.status).toBe(404);
    expect(siteUpload.status).toBe(404);

    const managerUpload = await uploadEvidence(manager.authorization, actionId);
    expect(managerUpload.status).toBe(201);
  });

  it("allows detail access for the assignee and for staff at the action site", async () => {
    const first = await createSite();
    const second = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const assignee = await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });
    const siteSupervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [first.site._id],
    });
    const unrelatedOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [second.site._id],
    });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [first.site._id],
    });

    const created = await createAction(
      manager.authorization,
      manualBody(first.project._id, assignee.user._id, {
        siteId: String(first.site._id),
      }),
    );
    const actionId = created.body.correctiveAction.id;

    const assigneeDetail = await request(app)
      .get(`/api/corrective-actions/${actionId}`)
      .set("Authorization", assignee.authorization);
    const siteDetail = await request(app)
      .get(`/api/corrective-actions/${actionId}`)
      .set("Authorization", siteSupervisor.authorization);
    const unrelatedDetail = await request(app)
      .get(`/api/corrective-actions/${actionId}`)
      .set("Authorization", unrelatedOfficer.authorization);
    const employeeDetail = await request(app)
      .get(`/api/corrective-actions/${actionId}`)
      .set("Authorization", employee.authorization);
    const employeeAssignees = await request(app)
      .get("/api/corrective-actions/assignees")
      .set("Authorization", employee.authorization);

    expect(assigneeDetail.status).toBe(200);
    expect(assigneeDetail.body.correctiveAction.id).toBe(actionId);
    expect(siteDetail.status).toBe(200);
    expect(siteDetail.body.correctiveAction.id).toBe(actionId);
    expect(unrelatedDetail.status).toBe(404);
    expect(employeeDetail.status).toBe(403);
    expect(employeeAssignees.status).toBe(403);
  });

  it("keeps incident-linked project and site immutable on metadata updates", async () => {
    const first = await createSite();
    const second = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [first.site._id],
    });

    const incident = await request(app)
      .post("/api/incidents")
      .set("Authorization", manager.authorization)
      .send({
        siteId: String(first.site._id),
        type: "NEAR_MISS",
        title: "Unguarded opening",
        description: "An opening was left unguarded on level 1.",
        occurredAt: new Date().toISOString(),
      });

    expect(incident.status).toBe(201);

    const created = await createAction(manager.authorization, {
      description: "Install guard rails around the opening",
      source: "NEAR_MISS",
      incidentId: incident.body.incident.id,
      assignedTo: String(officer.user._id),
      dueDate: dueInDays(5),
    });
    const actionId = created.body.correctiveAction.id;

    const projectMove = await request(app)
      .patch(`/api/corrective-actions/${actionId}`)
      .set("Authorization", manager.authorization)
      .send({ projectId: String(second.project._id) });

    expect(projectMove.status).toBe(409);

    const siteMove = await request(app)
      .patch(`/api/corrective-actions/${actionId}`)
      .set("Authorization", manager.authorization)
      .send({ siteId: String(second.site._id) });

    expect(siteMove.status).toBe(409);

    const incidentChange = await request(app)
      .patch(`/api/corrective-actions/${actionId}`)
      .set("Authorization", manager.authorization)
      .send({ incidentId: String(second.site._id) });

    expect(incidentChange.status).toBe(400);

    const unchanged = await CorrectiveAction.findById(actionId).lean();

    expect(String(unchanged?.project)).toBe(String(first.project._id));
    expect(String(unchanged?.site)).toBe(String(first.site._id));
    expect(String(unchanged?.incident)).toBe(incident.body.incident.id);
    expect(
      await AuditLog.countDocuments({
        action: "corrective_action.updated",
        entityId: actionId,
      }),
    ).toBe(0);

    const metadata = await request(app)
      .patch(`/api/corrective-actions/${actionId}`)
      .set("Authorization", manager.authorization)
      .send({
        description: "Install guard rails and inspect anchors",
        assignedTo: String(manager.user._id),
      });

    expect(metadata.status).toBe(200);
    expect(metadata.body.correctiveAction).toMatchObject({
      description: "Install guard rails and inspect anchors",
      assignedTo: { id: String(manager.user._id) },
      project: { id: String(first.project._id) },
      site: { id: String(first.site._id) },
    });

    const manual = await createAction(
      manager.authorization,
      manualBody(first.project._id, officer.user._id),
    );
    const manualMove = await request(app)
      .patch(`/api/corrective-actions/${manual.body.correctiveAction.id}`)
      .set("Authorization", manager.authorization)
      .send({
        projectId: String(second.project._id),
        siteId: String(second.site._id),
      });

    expect(manualMove.status).toBe(200);
    expect(manualMove.body.correctiveAction).toMatchObject({
      project: { id: String(second.project._id) },
      site: { id: String(second.site._id) },
    });
  });

  it("blocks evidence uploads after verification but keeps evidence readable", async () => {
    const { project, site } = await createSite();
    const other = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const assignee = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const unrelated = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [other.site._id],
    });

    const created = await createAction(
      manager.authorization,
      manualBody(project._id, assignee.user._id, {
        siteId: String(site._id),
      }),
    );
    const actionId = created.body.correctiveAction.id;

    const evidence = await uploadEvidence(assignee.authorization, actionId);
    expect(evidence.status).toBe(201);

    await updateStatus(assignee.authorization, actionId, {
      status: "IN_PROGRESS",
    });
    await updateStatus(assignee.authorization, actionId, {
      status: "COMPLETED",
      completionNotes: "Handrail installed.",
    });
    const verified = await updateStatus(manager.authorization, actionId, {
      status: "VERIFIED",
      verificationNotes: "Checked on site.",
    });

    expect(verified.status).toBe(200);

    const assigneeUpload = await uploadEvidence(
      assignee.authorization,
      actionId,
    );
    const managerUpload = await uploadEvidence(manager.authorization, actionId);
    const unrelatedUpload = await uploadEvidence(unrelated.authorization, actionId);

    expect(assigneeUpload.status).toBe(409);
    expect(managerUpload.status).toBe(409);
    expect(unrelatedUpload.status).toBe(404);

    const list = await request(app)
      .get(
        `/api/attachments?entityType=corrective_action&entityId=${actionId}`,
      )
      .set("Authorization", manager.authorization);
    const download = await request(app)
      .get(`/api/attachments/${evidence.body.attachment.id}/download`)
      .set("Authorization", assignee.authorization);

    expect(list.body.attachments).toHaveLength(1);
    expect(download.status).toBe(200);
  });

  it("denies supervisors verification even when they are the assignee", async () => {
    const { project, site } = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const supervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });

    const created = await createAction(
      manager.authorization,
      manualBody(project._id, supervisor.user._id, {
        siteId: String(site._id),
      }),
    );
    const actionId = created.body.correctiveAction.id;

    await updateStatus(manager.authorization, actionId, {
      status: "IN_PROGRESS",
    });
    await updateStatus(manager.authorization, actionId, {
      status: "COMPLETED",
      completionNotes: "Work finished.",
    });

    const supervisorVerify = await updateStatus(
      supervisor.authorization,
      actionId,
      { status: "VERIFIED" },
    );

    expect(supervisorVerify.status).toBe(403);

    const stored = await CorrectiveAction.findById(actionId).lean();
    expect(stored?.status).toBe("COMPLETED");
  });

  it("rejects manual and incident-linked creation at unassigned sites", async () => {
    const first = await createSite();
    const second = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [first.site._id],
    });

    const manual = await createAction(
      officer.authorization,
      manualBody(second.project._id, officer.user._id, {
        siteId: String(second.site._id),
      }),
    );

    expect(manual.status).toBe(404);

    const incident = await request(app)
      .post("/api/incidents")
      .set("Authorization", manager.authorization)
      .send({
        siteId: String(second.site._id),
        type: "NEAR_MISS",
        title: "Slip hazard",
        description: "Oil spill left unmarked.",
        occurredAt: new Date().toISOString(),
      });

    expect(incident.status).toBe(201);

    const incidentLinked = await createAction(officer.authorization, {
      description: "Clean and mark the spill area",
      source: "NEAR_MISS",
      incidentId: incident.body.incident.id,
      assignedTo: String(officer.user._id),
      dueDate: dueInDays(3),
    });

    expect(incidentLinked.status).toBe(404);
    expect(await CorrectiveAction.countDocuments({})).toBe(0);
  });

  it("denies employees evidence linked to a CAPA after they uploaded it", async () => {
    const { project, site } = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const original = await request(app)
      .post("/api/attachments")
      .set("Authorization", employee.authorization)
      .attach("file", PNG, {
        filename: "site-photo.png",
        contentType: "image/png",
      });

    expect(original.status).toBe(201);
    expect(original.body.attachment.entityType).toBeNull();

    const created = await createAction(
      manager.authorization,
      manualBody(project._id, officer.user._id, {
        siteId: String(site._id),
      }),
    );
    const actionId = created.body.correctiveAction.id;
    const attachmentId = original.body.attachment.id;

    const relinked = await request(app)
      .patch(`/api/attachments/${attachmentId}`)
      .set("Authorization", manager.authorization)
      .send({ entityType: "corrective_action", entityId: actionId });

    expect(relinked.status).toBe(200);

    const employeeList = await request(app)
      .get("/api/attachments")
      .set("Authorization", employee.authorization);
    const employeeDownload = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("Authorization", employee.authorization);
    const managerDownload = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("Authorization", manager.authorization);

    expect(employeeList.body.attachments).toHaveLength(0);
    expect(employeeDownload.status).toBe(404);
    expect(managerDownload.status).toBe(200);

    const missingAction = await request(app)
      .patch(`/api/attachments/${attachmentId}`)
      .set("Authorization", manager.authorization)
      .send({
        entityType: "corrective_action",
        entityId: "0123456789abcdef01234567",
      });

    expect(missingAction.status).toBe(404);

    const stored = await Attachment.findById(attachmentId).lean();
    expect(String(stored?.entityId)).toBe(actionId);
  });
});
