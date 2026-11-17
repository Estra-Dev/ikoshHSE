import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { CorrectiveAction } from "../src/models/CorrectiveAction.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
]);

let sequence = 0;

async function createSite() {
  sequence += 1;

  const project = await Project.create({
    name: `Audit Project ${sequence}`,
    code: `AUD${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Audit Site ${sequence}`,
    code: `ASITE${sequence}`,
  });

  return { project, site };
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function auditBody(
  projectId: unknown,
  auditorIds: unknown[],
  overrides: Record<string, unknown> = {},
) {
  return {
    title: "Annual HSE management system audit",
    type: "INTERNAL",
    projectId: String(projectId),
    auditorIds: auditorIds.map(String),
    scheduledFor: inDays(7),
    description: "Review of permit-to-work and lifting controls.",
    checklist: [
      {
        item: "Are permits to work available and signed?",
        notes: "Check the last three permits.",
      },
    ],
    ...overrides,
  };
}

function createAudit(
  authorization: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post("/api/audits")
    .set("Authorization", authorization)
    .send(body);
}

function uploadEvidence(authorization: string, auditId: string) {
  const call = request(app)
    .post("/api/attachments")
    .set("Authorization", authorization)
    .attach("file", PNG, {
      filename: "audit.png",
      contentType: "image/png",
    });

  call.field("entityType", "hse_audit");
  call.field("entityId", auditId);

  return call;
}

describe("HSE audits API", () => {
  it("requires authentication", async () => {
    const list = await request(app).get("/api/audits");
    const assignees = await request(app).get("/api/audits/assignees");

    expect(list.status).toBe(401);
    expect(assignees.status).toBe(401);
  });

  it("denies ordinary employees and lets supervisors read an empty register", async () => {
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const supervisor = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });

    const employeeList = await request(app)
      .get("/api/audits")
      .set("Authorization", employee.authorization);
    const supervisorList = await request(app)
      .get("/api/audits")
      .set("Authorization", supervisor.authorization);

    expect(employeeList.status).toBe(403);
    expect(supervisorList.status).toBe(200);
    expect(supervisorList.body.audits).toEqual([]);
  });

  it("schedules an audit with multiple auditors and excludes free text from the audit log", async () => {
    const { project, site } = await createSite();
    const firstAuditor = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const secondAuditor = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const created = await createAudit(firstAuditor.authorization, {
      ...auditBody(project._id, [firstAuditor.user._id, secondAuditor.user._id]),
      siteId: String(site._id),
    });

    expect(created.status).toBe(201);
    expect(created.body.audit).toMatchObject({
      status: "PLANNED",
      project: { id: String(project._id) },
      site: { id: String(site._id) },
    });
    expect(created.body.audit.auditors).toHaveLength(2);
    expect(created.body.audit.checklist[0]).toMatchObject({
      item: "Are permits to work available and signed?",
      result: "PENDING",
    });

    const log = await AuditLog.findOne({
      entityType: "HseAudit",
      action: "hse_audit.created",
    }).lean();

    expect(log).not.toBeNull();
    expect(log?.after).toMatchObject({
      status: "PLANNED",
      checklistCount: 1,
      assessedChecklistCount: 0,
      findingCount: 0,
    });
    // Checklist text and descriptions are free text and must be excluded.
    expect(JSON.stringify(log?.after)).not.toContain("permits to work");
    expect(JSON.stringify(log?.after)).not.toContain(
      "permit-to-work and lifting",
    );
  });

  it("rejects a mismatched site and inactive or non-HSE auditors", async () => {
    const first = await createSite();
    const second = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [second.site._id],
    });
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const wrongSite = await createAudit(officer.authorization, {
      ...auditBody(first.project._id, [officer.user._id]),
      siteId: String(second.site._id),
    });
    const wrongAuditor = await createAudit(officer.authorization, {
      ...auditBody(first.project._id, [employee.user._id]),
    });

    expect(wrongSite.status).toBe(409);
    expect(wrongAuditor.status).toBe(400);
  });

  it("lets assigned auditors conduct the workflow and reserves cancellation for management", async () => {
    const { project, site } = await createSite();
    const auditor = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const otherOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await createAudit(auditor.authorization, {
      ...auditBody(project._id, [auditor.user._id]),
      siteId: String(site._id),
    });
    const auditId = created.body.audit.id;

    const started = await request(app)
      .patch(`/api/audits/${auditId}/status`)
      .set("Authorization", auditor.authorization)
      .send({ status: "IN_PROGRESS" });

    expect(started.status).toBe(200);

    // Completion needs a finding or completion notes.
    const premature = await request(app)
      .patch(`/api/audits/${auditId}/status`)
      .set("Authorization", auditor.authorization)
      .send({ status: "COMPLETED" });

    expect(premature.status).toBe(400);

    // An officer who is not assigned to the audit cannot progress it.
    const unrelated = await request(app)
      .patch(`/api/audits/${auditId}/status`)
      .set("Authorization", otherOfficer.authorization)
      .send({ status: "COMPLETED", completionNotes: "All good." });

    expect(unrelated.status).toBe(403);

    const completed = await request(app)
      .patch(`/api/audits/${auditId}/status`)
      .set("Authorization", auditor.authorization)
      .send({
        status: "COMPLETED",
        completionNotes: "Checklist reviewed with the site team.",
      });

    expect(completed.status).toBe(200);
    expect(completed.body.audit).toMatchObject({
      status: "COMPLETED",
      completedBy: { id: String(auditor.user._id) },
    });

    // A completed audit cannot be cancelled or edited.
    const cancelTerminal = await request(app)
      .patch(`/api/audits/${auditId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "CANCELLED" });

    expect(cancelTerminal.status).toBe(409);

    const editTerminal = await request(app)
      .patch(`/api/audits/${auditId}`)
      .set("Authorization", manager.authorization)
      .send({ title: "Changed after completion" });

    expect(editTerminal.status).toBe(409);

    // Management may cancel a separate planned audit.
    const cancellable = await createAudit(auditor.authorization, {
      ...auditBody(project._id, [auditor.user._id]),
      siteId: String(site._id),
    });

    const cancelled = await request(app)
      .patch(`/api/audits/${cancellable.body.audit.id}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "CANCELLED" });

    expect(cancelled.status).toBe(200);
  });

  it("records checklist results and raises a corrective action from a finding", async () => {
    const { project, site } = await createSite();
    const auditor = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await createAudit(auditor.authorization, {
      ...auditBody(project._id, [auditor.user._id]),
      siteId: String(site._id),
    });
    const auditId = created.body.audit.id;
    const checklistId = created.body.audit.checklist[0].id;

    const checklistUpdated = await request(app)
      .patch(`/api/audits/${auditId}/checklist/${checklistId}`)
      .set("Authorization", auditor.authorization)
      .send({ result: "NON_COMPLIANT", notes: "Two permits were unsigned." });

    expect(checklistUpdated.status).toBe(200);
    expect(checklistUpdated.body.audit.checklist[0]).toMatchObject({
      result: "NON_COMPLIANT",
      notes: "Two permits were unsigned.",
    });

    const findingAdded = await request(app)
      .post(`/api/audits/${auditId}/findings`)
      .set("Authorization", auditor.authorization)
      .send({
        description: "Permits were not signed before work started.",
        severity: "HIGH",
        recommendation: "Re-brief supervisors on the permit process.",
      });

    expect(findingAdded.status).toBe(201);
    const findingId = findingAdded.body.audit.findings[0].id;

    expect(findingAdded.body.audit.findings[0]).toMatchObject({
      severity: "HIGH",
      correctiveAction: null,
    });

    const linked = await request(app)
      .post(`/api/audits/${auditId}/findings/${findingId}/corrective-action`)
      .set("Authorization", auditor.authorization)
      .send({
        assignedTo: String(manager.user._id),
        dueDate: inDays(14),
        description: "Re-train supervisors on permit sign-off.",
      });

    expect(linked.status).toBe(201);
    expect(linked.body.audit.findings[0].correctiveAction).toMatchObject({
      id: linked.body.correctiveAction.id,
      status: "OPEN",
    });
    expect(linked.body.correctiveAction).toMatchObject({
      source: "HSE_AUDIT",
      project: { id: String(project._id) },
      site: { id: String(site._id) },
      audit: { id: auditId },
    });

    const action = await CorrectiveAction.findOne({
      description: "Re-train supervisors on permit sign-off.",
    }).lean();

    expect(action).not.toBeNull();
    expect(String(action?.audit)).toBe(auditId);
    expect(String(action?.auditFindingId)).toBe(findingId);

    const duplicate = await request(app)
      .post(`/api/audits/${auditId}/findings/${findingId}/corrective-action`)
      .set("Authorization", auditor.authorization)
      .send({
        assignedTo: String(manager.user._id),
        dueDate: inDays(14),
      });

    expect(duplicate.status).toBe(409);
  });

  it("rejects generic corrective actions with the audit source", async () => {
    const officer = await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });
    const { project } = await createSite();

    const response = await request(app)
      .post("/api/corrective-actions")
      .set("Authorization", officer.authorization)
      .send({
        description: "Should be raised from a finding.",
        source: "HSE_AUDIT",
        projectId: String(project._id),
        assignedTo: String(officer.user._id),
        dueDate: inDays(7),
      });

    expect(response.status).toBe(400);
  });

  it("scopes the register to assigned sites and auditors", async () => {
    const siteA = await createSite();
    const siteB = await createSite();
    const auditor = await signInAsIkoshUser({
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

    const siteAudit = await createAudit(auditor.authorization, {
      ...auditBody(siteA.project._id, [auditor.user._id]),
      siteId: String(siteA.site._id),
    });
    // Project-level audit is visible to its assigned auditor even without a site.
    const projectAudit = await createAudit(manager.authorization, {
      ...auditBody(siteA.project._id, [auditor.user._id]),
    });

    expect(siteAudit.status).toBe(201);
    expect(projectAudit.status).toBe(201);

    const supervisorARegister = await request(app)
      .get("/api/audits")
      .set("Authorization", supervisorA.authorization);
    const supervisorBRegister = await request(app)
      .get("/api/audits")
      .set("Authorization", supervisorB.authorization);
    const auditorRegister = await request(app)
      .get("/api/audits")
      .set("Authorization", auditor.authorization);
    const managerRegister = await request(app)
      .get("/api/audits")
      .set("Authorization", manager.authorization);

    expect(
      supervisorARegister.body.audits.map((audit: { id: string }) => audit.id),
    ).toEqual([siteAudit.body.audit.id]);
    expect(supervisorBRegister.body.audits).toEqual([]);
    expect(
      auditorRegister.body.audits.map((audit: { id: string }) => audit.id),
    ).toEqual(
      expect.arrayContaining([
        siteAudit.body.audit.id,
        projectAudit.body.audit.id,
      ]),
    );
    expect(managerRegister.body.audits.length).toBe(2);

    const crossSiteDetail = await request(app)
      .get(`/api/audits/${siteAudit.body.audit.id}`)
      .set("Authorization", supervisorB.authorization);

    expect(crossSiteDetail.status).toBe(404);
  });

  it("secures audit evidence for upload, listing and download", async () => {
    const { project, site } = await createSite();
    const otherSite = await createSite();
    const auditor = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    // Staff at the audit's site may read its evidence even when unassigned to
    // conduct it.
    const sameSiteOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const crossSiteOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [otherSite.site._id],
    });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await createAudit(auditor.authorization, {
      ...auditBody(project._id, [auditor.user._id]),
      siteId: String(site._id),
    });
    const auditId = created.body.audit.id;

    const uploaded = await uploadEvidence(auditor.authorization, auditId);

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.attachment.entityType).toBe("hse_audit");

    const auditorList = await request(app)
      .get(`/api/attachments?entityType=hse_audit&entityId=${auditId}`)
      .set("Authorization", auditor.authorization);
    const managerList = await request(app)
      .get(`/api/attachments?entityType=hse_audit&entityId=${auditId}`)
      .set("Authorization", manager.authorization);
    const sameSiteList = await request(app)
      .get(`/api/attachments?entityType=hse_audit&entityId=${auditId}`)
      .set("Authorization", sameSiteOfficer.authorization);
    const crossSiteList = await request(app)
      .get(`/api/attachments?entityType=hse_audit&entityId=${auditId}`)
      .set("Authorization", crossSiteOfficer.authorization);
    const employeeList = await request(app)
      .get("/api/attachments")
      .set("Authorization", employee.authorization);

    expect(auditorList.body.attachments).toHaveLength(1);
    expect(managerList.body.attachments).toHaveLength(1);
    // Listing follows audit visibility, which includes the audit's site.
    expect(sameSiteList.body.attachments).toHaveLength(1);
    expect(crossSiteList.body.attachments).toHaveLength(0);
    expect(employeeList.body.attachments).toHaveLength(0);

    const employeeUpload = await uploadEvidence(
      employee.authorization,
      auditId,
    );
    // Upload is narrower than visibility: only management, the creator and
    // assigned auditors may add evidence.
    const sameSiteUpload = await uploadEvidence(
      sameSiteOfficer.authorization,
      auditId,
    );
    const crossSiteUpload = await uploadEvidence(
      crossSiteOfficer.authorization,
      auditId,
    );

    expect(employeeUpload.status).toBe(404);
    expect(sameSiteUpload.status).toBe(404);
    expect(crossSiteUpload.status).toBe(404);
  });

  it("blocks project and site deletion while referenced", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const siteAudit = await createAudit(officer.authorization, {
      ...auditBody(project._id, [officer.user._id]),
      siteId: String(site._id),
    });

    expect(siteAudit.status).toBe(201);

    const siteDelete = await request(app)
      .delete(`/api/sites/${site._id}`)
      .set("Authorization", manager.authorization);

    expect(siteDelete.status).toBe(409);

    // A project-level audit blocks project deletion even without sites.
    const standaloneProject = await Project.create({
      name: "Standalone audit project",
      code: `ASA${sequence + 1}`,
    });
    const projectAudit = await createAudit(officer.authorization, {
      ...auditBody(standaloneProject._id, [officer.user._id]),
    });

    expect(projectAudit.status).toBe(201);

    const projectDelete = await request(app)
      .delete(`/api/projects/${standaloneProject._id}`)
      .set("Authorization", manager.authorization);

    expect(projectDelete.status).toBe(409);
  });
});
