import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { Attachment } from "../src/models/Attachment.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { CorrectiveAction } from "../src/models/CorrectiveAction.js";
import { Inspection } from "../src/models/Inspection.js";
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
    name: `Inspection Project ${sequence}`,
    code: `INSP${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Inspection Site ${sequence}`,
    code: `ISITE${sequence}`,
  });

  return { project, site };
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function inspectionBody(
  projectId: unknown,
  inspectorId: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    title: "Monthly scaffold inspection",
    type: "ROUTINE",
    projectId: String(projectId),
    inspectorId: String(inspectorId),
    scheduledFor: inDays(2),
    description: "Inspect scaffold access and guardrails.",
    ...overrides,
  };
}

function createInspection(
  authorization: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post("/api/inspections")
    .set("Authorization", authorization)
    .send(body);
}

function addFinding(
  authorization: string,
  inspectionId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(`/api/inspections/${inspectionId}/findings`)
    .set("Authorization", authorization)
    .send(body);
}

function updateStatus(
  authorization: string,
  inspectionId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .patch(`/api/inspections/${inspectionId}/status`)
    .set("Authorization", authorization)
    .send(body);
}

function linkCorrectiveAction(
  authorization: string,
  inspectionId: string,
  findingId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(
      `/api/inspections/${inspectionId}/findings/${findingId}/corrective-action`,
    )
    .set("Authorization", authorization)
    .send(body);
}

function uploadEvidence(authorization: string, inspectionId: string) {
  const call = request(app)
    .post("/api/attachments")
    .set("Authorization", authorization)
    .attach("file", PNG, {
      filename: "inspection.png",
      contentType: "image/png",
    });

  call.field("entityType", "inspection");
  call.field("entityId", inspectionId);

  return call;
}

describe("inspections API", () => {
  it("requires authentication", async () => {
    const list = await request(app).get("/api/inspections");
    const assignees = await request(app).get("/api/inspections/assignees");

    expect(list.status).toBe(401);
    expect(assignees.status).toBe(401);
  });

  it("denies employees and lets supervisors read but not schedule", async () => {
    const { project } = await createSite();
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const supervisor = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });

    const employeeList = await request(app)
      .get("/api/inspections")
      .set("Authorization", employee.authorization);
    const supervisorList = await request(app)
      .get("/api/inspections")
      .set("Authorization", supervisor.authorization);

    expect(employeeList.status).toBe(403);
    expect(supervisorList.status).toBe(200);
    expect(supervisorList.body.inspections).toHaveLength(0);

    const supervisorCreate = await createInspection(
      supervisor.authorization,
      inspectionBody(project._id, supervisor.user._id),
    );

    expect(supervisorCreate.status).toBe(403);
    expect(await Inspection.countDocuments({})).toBe(0);
  });

  it("lets an HSE officer schedule an inspection at an assigned site", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const response = await createInspection(
      officer.authorization,
      inspectionBody(project._id, officer.user._id, {
        siteId: String(site._id),
        type: "FOCUSED",
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.inspection).toMatchObject({
      title: "Monthly scaffold inspection",
      type: "FOCUSED",
      status: "SCHEDULED",
      project: { id: String(project._id), name: project.name },
      site: { id: String(site._id), name: site.name, code: site.code },
      inspector: { id: String(officer.user._id) },
      completionNotes: null,
      completedAt: null,
      findings: [],
      createdBy: { id: String(officer.user._id) },
    });

    const log = await AuditLog.findOne({ action: "inspection.created" }).lean();

    expect(log).not.toBeNull();
    expect(log?.entityType).toBe("Inspection");
    expect(log?.after).toMatchObject({
      project: String(project._id),
      site: String(site._id),
      inspector: String(officer.user._id),
      status: "SCHEDULED",
      findingCount: 0,
    });
    expect(log?.after).not.toHaveProperty("title");
    expect(log?.after).not.toHaveProperty("description");
  });

  it("validates project/site consistency and inspector eligibility", async () => {
    const first = await createSite();
    const second = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [first.site._id],
    });
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const inactive = await createIkoshUser({
      ikoshRole: "HSE_OFFICER",
      isActive: false,
    });

    const wrongSite = await createInspection(
      manager.authorization,
      inspectionBody(first.project._id, officer.user._id, {
        siteId: String(second.site._id),
      }),
    );

    expect(wrongSite.status).toBe(409);

    const unassignedSite = await createInspection(
      officer.authorization,
      inspectionBody(first.project._id, officer.user._id, {
        siteId: String(second.site._id),
      }),
    );

    expect(unassignedSite.status).toBe(404);

    const employeeInspector = await createInspection(
      manager.authorization,
      inspectionBody(first.project._id, employee.user._id),
    );
    const inactiveInspector = await createInspection(
      manager.authorization,
      inspectionBody(first.project._id, inactive._id),
    );

    expect(employeeInspector.status).toBe(400);
    expect(inactiveInspector.status).toBe(400);

    const invalidStatus = await request(app)
      .get("/api/inspections?status=NOPE")
      .set("Authorization", manager.authorization);
    const invalidType = await request(app)
      .get("/api/inspections?type=NOPE")
      .set("Authorization", manager.authorization);
    const invalidSite = await request(app)
      .get("/api/inspections?siteId=nope")
      .set("Authorization", manager.authorization);

    expect(invalidStatus.status).toBe(400);
    expect(invalidType.status).toBe(400);
    expect(invalidSite.status).toBe(400);
    expect(await Inspection.countDocuments({})).toBe(0);
  });

  it("scopes the register to assigned sites and assigned inspections", async () => {
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

    const siteA = await createInspection(
      manager.authorization,
      inspectionBody(first.project._id, officerB.user._id, {
        siteId: String(first.site._id),
        title: "Scaffold inspection alpha",
      }),
    );
    const siteB = await createInspection(
      manager.authorization,
      inspectionBody(second.project._id, officerB.user._id, {
        siteId: String(second.site._id),
        title: "Excavation inspection beta",
        type: "FOCUSED",
      }),
    );
    const assignedToA = await createInspection(
      manager.authorization,
      inspectionBody(second.project._id, officerA.user._id, {
        siteId: String(second.site._id),
        title: "Lifting inspection gamma",
        type: "FOLLOW_UP",
      }),
    );

    expect(siteA.status).toBe(201);
    expect(siteB.status).toBe(201);
    expect(assignedToA.status).toBe(201);

    const listA = await request(app)
      .get("/api/inspections")
      .set("Authorization", officerA.authorization);
    const listManager = await request(app)
      .get("/api/inspections")
      .set("Authorization", manager.authorization);
    const listEmployee = await request(app)
      .get("/api/inspections")
      .set("Authorization", employee.authorization);

    expect(listA.status).toBe(200);
    expect(listA.body.inspections).toHaveLength(2);
    expect(
      listA.body.inspections.map(
        (inspection: { id: string }) => inspection.id,
      ),
    ).toEqual(
      expect.arrayContaining([
        siteA.body.inspection.id,
        assignedToA.body.inspection.id,
      ]),
    );
    expect(listManager.body.pagination.total).toBe(3);
    expect(listEmployee.status).toBe(403);

    const crossSite = await request(app)
      .get(`/api/inspections/${siteB.body.inspection.id}`)
      .set("Authorization", officerA.authorization);

    expect(crossSite.status).toBe(404);

    const byTitle = await request(app)
      .get("/api/inspections?q=excavation")
      .set("Authorization", manager.authorization);
    const byType = await request(app)
      .get("/api/inspections?type=FOLLOW_UP")
      .set("Authorization", manager.authorization);
    const bySite = await request(app)
      .get(`/api/inspections?siteId=${first.site._id}`)
      .set("Authorization", manager.authorization);
    const byInspector = await request(app)
      .get(`/api/inspections?inspectorId=${officerA.user._id}`)
      .set("Authorization", manager.authorization);
    const paged = await request(app)
      .get("/api/inspections?page=2&limit=2")
      .set("Authorization", manager.authorization);

    expect(byTitle.body.inspections).toHaveLength(1);
    expect(byTitle.body.inspections[0].id).toBe(siteB.body.inspection.id);
    expect(byType.body.inspections).toHaveLength(1);
    expect(byType.body.inspections[0].id).toBe(assignedToA.body.inspection.id);
    expect(bySite.body.inspections).toHaveLength(1);
    expect(byInspector.body.inspections).toHaveLength(1);
    expect(paged.body.inspections).toHaveLength(1);
    expect(paged.body.pagination).toMatchObject({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it("lets the inspector record findings and complete with notes", async () => {
    const { project, site } = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const inspector = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const otherOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const supervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });

    const created = await createInspection(
      manager.authorization,
      inspectionBody(project._id, inspector.user._id, {
        siteId: String(site._id),
      }),
    );
    const inspectionId = created.body.inspection.id;

    const recorded = await addFinding(
      inspector.authorization,
      inspectionId,
      {
        description: "Missing mid-rail on level 2 scaffold",
        severity: "HIGH",
        recommendation: "Replace the mid-rail before next shift.",
      },
    );

    expect(recorded.status).toBe(201);
    expect(recorded.body.inspection.findings).toHaveLength(1);
    expect(recorded.body.inspection.findings[0]).toMatchObject({
      description: "Missing mid-rail on level 2 scaffold",
      severity: "HIGH",
      recommendation: "Replace the mid-rail before next shift.",
      correctiveAction: null,
    });

    const nonInspector = await addFinding(
      otherOfficer.authorization,
      inspectionId,
      {
        description: "Not my inspection",
        severity: "LOW",
      },
    );
    const supervisorFinding = await addFinding(
      supervisor.authorization,
      inspectionId,
      {
        description: "Supervisors cannot record findings",
        severity: "LOW",
      },
    );
    const invalidSeverity = await addFinding(
      inspector.authorization,
      inspectionId,
      {
        description: "Invalid severity",
        severity: "SEVERE",
      },
    );

    expect(nonInspector.status).toBe(403);
    expect(supervisorFinding.status).toBe(403);
    expect(invalidSeverity.status).toBe(400);

    const skipped = await updateStatus(
      inspector.authorization,
      inspectionId,
      { status: "COMPLETED" },
    );

    expect(skipped.status).toBe(409);

    const started = await updateStatus(
      inspector.authorization,
      inspectionId,
      { status: "IN_PROGRESS" },
    );

    expect(started.status).toBe(200);
    expect(started.body.inspection.status).toBe("IN_PROGRESS");

    const completed = await updateStatus(
      inspector.authorization,
      inspectionId,
      {
        status: "COMPLETED",
        completionNotes: "Mid-rail replaced and re-inspected.",
      },
    );

    expect(completed.status).toBe(200);
    expect(completed.body.inspection).toMatchObject({
      status: "COMPLETED",
      completionNotes: "Mid-rail replaced and re-inspected.",
      completedBy: { id: String(inspector.user._id) },
    });
    expect(completed.body.inspection.completedAt).toBeTypeOf("string");

    const lateFinding = await addFinding(
      inspector.authorization,
      inspectionId,
      {
        description: "Late finding",
        severity: "LOW",
      },
    );
    const lateEdit = await request(app)
      .patch(`/api/inspections/${inspectionId}`)
      .set("Authorization", manager.authorization)
      .send({ title: "Changed after completion" });

    expect(lateFinding.status).toBe(409);
    expect(lateEdit.status).toBe(409);

    const statusLog = await AuditLog.findOne({
      action: "inspection.status_changed",
      entityId: inspectionId,
    }).lean();
    const findingLog = await AuditLog.findOne({
      action: "inspection.finding_added",
      entityId: inspectionId,
    }).lean();

    expect(statusLog).not.toBeNull();
    expect(statusLog?.after).toMatchObject({ status: "COMPLETED" });
    expect(statusLog?.after).not.toHaveProperty("completionNotes");
    expect(findingLog).not.toBeNull();
    expect(findingLog?.after).toMatchObject({ findingCount: 1 });
  });

  it("requires a completion record and reserves cancellation for management", async () => {
    const { project } = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const inspector = await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });

    const created = await createInspection(
      manager.authorization,
      inspectionBody(project._id, inspector.user._id),
    );
    const inspectionId = created.body.inspection.id;

    await updateStatus(inspector.authorization, inspectionId, {
      status: "IN_PROGRESS",
    });

    const noRecord = await updateStatus(
      inspector.authorization,
      inspectionId,
      { status: "COMPLETED" },
    );

    expect(noRecord.status).toBe(400);

    const completed = await updateStatus(
      inspector.authorization,
      inspectionId,
      {
        status: "COMPLETED",
        completionNotes: "No findings observed.",
      },
    );

    expect(completed.status).toBe(200);

    const second = await createInspection(
      manager.authorization,
      inspectionBody(project._id, inspector.user._id, {
        title: "Cancellation candidate",
      }),
    );
    const secondId = second.body.inspection.id;

    const inspectorCancel = await updateStatus(
      inspector.authorization,
      secondId,
      { status: "CANCELLED" },
    );
    const managerCancel = await updateStatus(
      manager.authorization,
      secondId,
      { status: "CANCELLED" },
    );

    expect(inspectorCancel.status).toBe(403);
    expect(managerCancel.status).toBe(200);
    expect(managerCancel.body.inspection.status).toBe("CANCELLED");

    const afterCancel = await updateStatus(
      manager.authorization,
      secondId,
      { status: "IN_PROGRESS" },
    );

    expect(afterCancel.status).toBe(409);
  });

  it("raises a CAPA from a finding atomically and protects provenance", async () => {
    const { project, site } = await createSite();
    const other = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const inspector = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const assignee = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const created = await createInspection(
      manager.authorization,
      inspectionBody(project._id, inspector.user._id, {
        siteId: String(site._id),
      }),
    );
    const inspectionId = created.body.inspection.id;

    const finding = await addFinding(inspector.authorization, inspectionId, {
      description: "Emergency exit obstructed by stored materials",
      severity: "CRITICAL",
      recommendation: "Clear the exit route and mark a keep-clear zone.",
    });
    const findingId = finding.body.inspection.findings[0].id;

    const linked = await linkCorrectiveAction(
      inspector.authorization,
      inspectionId,
      findingId,
      {
        assignedTo: String(assignee.user._id),
        dueDate: inDays(3),
      },
    );

    expect(linked.status).toBe(201);
    expect(linked.body.correctiveAction).toMatchObject({
      source: "INSPECTION",
      status: "OPEN",
      inspection: { id: inspectionId, title: "Monthly scaffold inspection" },
      findingId,
      project: { id: String(project._id) },
      site: { id: String(site._id) },
      assignedTo: { id: String(assignee.user._id) },
      createdBy: { id: String(inspector.user._id) },
    });
    expect(linked.body.inspection.findings[0].correctiveAction).toMatchObject({
      id: linked.body.correctiveAction.id,
      status: "OPEN",
    });

    const linkLog = await AuditLog.findOne({
      action: "inspection.finding_linked",
      entityId: inspectionId,
    }).lean();
    const capaLog = await AuditLog.findOne({
      action: "corrective_action.created",
      entityId: linked.body.correctiveAction.id,
    }).lean();

    expect(linkLog).not.toBeNull();
    expect(linkLog?.after).toMatchObject({
      findingCount: 1,
      linkedCorrectiveActionCount: 1,
    });
    expect(capaLog).not.toBeNull();
    expect(capaLog?.after).toMatchObject({
      source: "INSPECTION",
      inspection: inspectionId,
      findingId,
    });

    const duplicate = await linkCorrectiveAction(
      inspector.authorization,
      inspectionId,
      findingId,
      {
        assignedTo: String(assignee.user._id),
        dueDate: inDays(3),
      },
    );
    const missingFinding = await linkCorrectiveAction(
      inspector.authorization,
      inspectionId,
      "0123456789abcdef01234567",
      {
        assignedTo: String(assignee.user._id),
        dueDate: inDays(3),
      },
    );

    expect(duplicate.status).toBe(409);
    expect(missingFinding.status).toBe(404);
    expect(await CorrectiveAction.countDocuments({})).toBe(1);

    const projectMove = await request(app)
      .patch(`/api/corrective-actions/${linked.body.correctiveAction.id}`)
      .set("Authorization", manager.authorization)
      .send({ projectId: String(other.project._id) });
    const sourceChange = await request(app)
      .patch(`/api/corrective-actions/${linked.body.correctiveAction.id}`)
      .set("Authorization", manager.authorization)
      .send({ source: "OTHER" });
    const inspectionMove = await request(app)
      .patch(`/api/inspections/${inspectionId}`)
      .set("Authorization", manager.authorization)
      .send({ siteId: String(other.site._id) });

    expect(projectMove.status).toBe(409);
    expect(sourceChange.status).toBe(400);
    expect(inspectionMove.status).toBe(409);

    const directCreate = await request(app)
      .post("/api/corrective-actions")
      .set("Authorization", manager.authorization)
      .send({
        description: "Forged inspection action",
        source: "INSPECTION",
        projectId: String(project._id),
        assignedTo: String(assignee.user._id),
        dueDate: inDays(3),
      });

    expect(directCreate.status).toBe(400);

    const register = await request(app)
      .get("/api/corrective-actions?source=INSPECTION")
      .set("Authorization", manager.authorization);

    expect(register.status).toBe(200);
    expect(register.body.correctiveActions).toHaveLength(1);
    expect(register.body.correctiveActions[0].inspection).toMatchObject({
      id: inspectionId,
      title: "Monthly scaffold inspection",
    });

    const progressed = await request(app)
      .patch(`/api/corrective-actions/${linked.body.correctiveAction.id}/status`)
      .set("Authorization", assignee.authorization)
      .send({ status: "IN_PROGRESS" });

    expect(progressed.status).toBe(200);
  });

  it("secures inspection evidence for upload, listing and download", async () => {
    const { project, site } = await createSite();
    const other = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const inspector = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const unrelated = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [other.site._id],
    });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const created = await createInspection(
      manager.authorization,
      inspectionBody(project._id, inspector.user._id, {
        siteId: String(site._id),
      }),
    );
    const inspectionId = created.body.inspection.id;

    const uploaded = await uploadEvidence(
      inspector.authorization,
      inspectionId,
    );
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.attachment.entityType).toBe("inspection");

    const managerList = await request(app)
      .get(`/api/attachments?entityType=inspection&entityId=${inspectionId}`)
      .set("Authorization", manager.authorization);
    const inspectorList = await request(app)
      .get(`/api/attachments?entityType=inspection&entityId=${inspectionId}`)
      .set("Authorization", inspector.authorization);
    const unrelatedList = await request(app)
      .get(`/api/attachments?entityType=inspection&entityId=${inspectionId}`)
      .set("Authorization", unrelated.authorization);
    const employeeList = await request(app)
      .get("/api/attachments")
      .set("Authorization", employee.authorization);

    expect(managerList.body.attachments).toHaveLength(1);
    expect(inspectorList.body.attachments).toHaveLength(1);
    expect(unrelatedList.body.attachments).toHaveLength(0);
    expect(employeeList.body.attachments).toHaveLength(0);

    const inspectorDownload = await request(app)
      .get(`/api/attachments/${uploaded.body.attachment.id}/download`)
      .set("Authorization", inspector.authorization);
    const unrelatedDownload = await request(app)
      .get(`/api/attachments/${uploaded.body.attachment.id}/download`)
      .set("Authorization", unrelated.authorization);
    const employeeDownload = await request(app)
      .get(`/api/attachments/${uploaded.body.attachment.id}/download`)
      .set("Authorization", employee.authorization);

    expect(inspectorDownload.status).toBe(200);
    expect(unrelatedDownload.status).toBe(404);
    expect(employeeDownload.status).toBe(404);

    const employeeUpload = await uploadEvidence(
      employee.authorization,
      inspectionId,
    );
    const unrelatedUpload = await uploadEvidence(
      unrelated.authorization,
      inspectionId,
    );
    const managerUpload = await uploadEvidence(
      manager.authorization,
      inspectionId,
    );

    expect(employeeUpload.status).toBe(404);
    expect(unrelatedUpload.status).toBe(404);
    expect(managerUpload.status).toBe(201);

    await updateStatus(manager.authorization, inspectionId, {
      status: "CANCELLED",
    });

    const inspectorAfterCancel = await uploadEvidence(
      inspector.authorization,
      inspectionId,
    );
    const managerAfterCancel = await uploadEvidence(
      manager.authorization,
      inspectionId,
    );

    expect(inspectorAfterCancel.status).toBe(409);
    expect(managerAfterCancel.status).toBe(409);

    const stillReadable = await request(app)
      .get(`/api/attachments?entityType=inspection&entityId=${inspectionId}`)
      .set("Authorization", inspector.authorization);

    expect(stillReadable.body.attachments).toHaveLength(2);
  });

  it("lists only active inspection-assignable HSE staff", async () => {
    const officer = await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const supervisor = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });
    const inactive = await createIkoshUser({
      ikoshRole: "HSE_OFFICER",
      isActive: false,
    });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .get("/api/inspections/assignees")
      .set("Authorization", admin.authorization);

    expect(response.status).toBe(200);

    const ids = response.body.assignees.map(
      (assignee: { id: string }) => assignee.id,
    );

    expect(ids).toContain(String(officer.user._id));
    expect(ids).toContain(String(manager.user._id));
    expect(ids).toContain(String(admin.user._id));
    expect(ids).not.toContain(String(supervisor.user._id));
    expect(ids).not.toContain(String(inactive._id));
  });

  it("rejects relinking an uploaded file to an inaccessible inspection", async () => {
    const { project, site } = await createSite();
    const other = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const inspector = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const created = await createInspection(
      manager.authorization,
      inspectionBody(project._id, inspector.user._id, {
        siteId: String(site._id),
      }),
    );
    const inspectionId = created.body.inspection.id;

    const original = await request(app)
      .post("/api/attachments")
      .set("Authorization", manager.authorization)
      .attach("file", PNG, {
        filename: "orphan.png",
        contentType: "image/png",
      });

    expect(original.status).toBe(201);

    const relinked = await request(app)
      .patch(`/api/attachments/${original.body.attachment.id}`)
      .set("Authorization", manager.authorization)
      .send({ entityType: "inspection", entityId: inspectionId });

    expect(relinked.status).toBe(200);

    const stored = await Attachment.findById(
      original.body.attachment.id,
    ).lean();

    expect(stored?.entityType).toBe("inspection");
    expect(String(stored?.entityId)).toBe(inspectionId);

    const missing = await request(app)
      .patch(`/api/attachments/${original.body.attachment.id}`)
      .set("Authorization", manager.authorization)
      .send({
        entityType: "inspection",
        entityId: "0123456789abcdef01234567",
      });

    expect(missing.status).toBe(404);
    expect(other.project._id).toBeDefined();
  });
});
