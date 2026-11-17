import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Permit } from "../src/models/Permit.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { User } from "../src/models/User.js";
import { signInAsIkoshUser } from "./helpers.js";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
]);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let sequence = 0;

async function createSite(status = "ACTIVE") {
  sequence += 1;

  const project = await Project.create({
    name: `Permit Project ${sequence}`,
    code: `PRM${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Permit Site ${sequence}`,
    code: `PSITE${sequence}`,
    status,
  });

  return { project, site };
}

function permitBody(
  projectId: unknown,
  siteId: unknown,
  responsiblePersonId: unknown,
  overrides: Record<string, unknown> = {},
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
    workersInvolved: ["Ade Worker — welder", "Bola Helper — fitter"],
    requiredPrecautions: ["PPE", "FIRE_WATCH"],
    hazards: [
      {
        hazard: "Sparks igniting flammable vapour",
        controlMeasures: "Gas testing and a dedicated fire watch",
      },
    ],
    ...overrides,
  };
}

function createPermit(authorization: string, body: Record<string, unknown>) {
  return request(app)
    .post("/api/permits")
    .set("Authorization", authorization)
    .send(body);
}

function updateStatus(
  authorization: string,
  permitId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .patch(`/api/permits/${permitId}/status`)
    .set("Authorization", authorization)
    .send(body);
}

function uploadPermitEvidence(
  authorization: string,
  permitId: string,
  buffer: Buffer = PNG,
) {
  return request(app)
    .post("/api/attachments")
    .set("Authorization", authorization)
    .field("entityType", "permit")
    .field("entityId", permitId)
    .attach("file", buffer, {
      filename: "permit-evidence.png",
      contentType: "image/png",
    });
}

/**
 * Creates a permit ready for workflow tests: an HSE officer (assigned to the
 * site) raises it, another officer is responsible, and an HSE manager is
 * available to approve.
 */
async function createPermitFixture() {
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

  const created = await createPermit(
    creator.authorization,
    permitBody(project._id, site._id, responsible.user._id),
  );

  expect(created.status).toBe(201);

  return {
    project,
    site,
    creator,
    responsible,
    manager,
    permitId: created.body.permit.id as string,
  };
}

describe("permits API", () => {
  it("requires authentication", async () => {
    const list = await request(app).get("/api/permits");
    const create = await request(app).post("/api/permits").send({});
    const assignees = await request(app).get("/api/permits/assignees");

    expect(list.status).toBe(401);
    expect(create.status).toBe(401);
    expect(assignees.status).toBe(401);
  });

  it("denies ordinary employees the whole permit module", async () => {
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const list = await request(app)
      .get("/api/permits")
      .set("Authorization", employee.authorization);
    const create = await createPermit(employee.authorization, {});

    expect(list.status).toBe(403);
    expect(create.status).toBe(403);
  });

  it("creates a draft permit without leaking free text into the audit log", async () => {
    const { project, site } = await createSite();
    const creator = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const responsible = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });

    const created = await createPermit(
      creator.authorization,
      permitBody(project._id, site._id, responsible.user._id),
    );

    expect(created.status).toBe(201);
    expect(created.body.permit).toMatchObject({
      status: "DRAFT",
      workType: "HOT_WORK",
      project: { id: String(project._id) },
      site: { id: String(site._id) },
      responsiblePerson: { id: String(responsible.user._id) },
      workersInvolved: ["Ade Worker — welder", "Bola Helper — fitter"],
      requiredPrecautions: ["PPE", "FIRE_WATCH"],
      isExpired: false,
    });
    expect(created.body.permit.hazards[0]).toMatchObject({
      hazard: "Sparks igniting flammable vapour",
      controlMeasures: "Gas testing and a dedicated fire watch",
    });

    const audit = await AuditLog.findOne({
      entityType: "Permit",
      action: "permit.created",
    }).lean();

    expect(audit).not.toBeNull();
    expect(audit?.after).toMatchObject({
      status: "DRAFT",
      workType: "HOT_WORK",
      workerCount: 2,
      precautionCount: 2,
      hazardCount: 1,
      responsiblePerson: String(responsible.user._id),
    });

    // Work descriptions, hazard text, worker names and locations are free text
    // and must never be copied into the audit trail.
    const snapshot = JSON.stringify(audit?.after);
    expect(snapshot).not.toContain("north storage tank");
    expect(snapshot).not.toContain("Sparks igniting");
    expect(snapshot).not.toContain("Gas testing");
    expect(snapshot).not.toContain("Ade Worker");
    expect(snapshot).not.toContain("Tank farm");
  });

  it("rejects status and approval fields in create and update payloads", async () => {
    const { project, site } = await createSite();
    const creator = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const forgedCreate = await createPermit(
      creator.authorization,
      permitBody(project._id, site._id, creator.user._id, {
        status: "APPROVED",
      }),
    );

    expect(forgedCreate.status).toBe(400);

    const created = await createPermit(
      creator.authorization,
      permitBody(project._id, site._id, creator.user._id),
    );
    const forgedUpdate = await request(app)
      .patch(`/api/permits/${created.body.permit.id}`)
      .set("Authorization", creator.authorization)
      .send({ status: "APPROVED" });

    expect(forgedUpdate.status).toBe(400);
  });

  it("requires an active site that belongs to the project", async () => {
    const first = await createSite();
    const second = await createSite();
    const planned = await createSite("PLANNED");
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [first.site._id, second.site._id, planned.site._id],
    });

    const wrongProject = await createPermit(
      officer.authorization,
      permitBody(first.project._id, second.site._id, officer.user._id),
    );
    const inactiveSite = await createPermit(
      officer.authorization,
      permitBody(planned.project._id, planned.site._id, officer.user._id),
    );

    expect(wrongProject.status).toBe(409);
    expect(inactiveSite.status).toBe(409);
  });

  it("validates the responsible person role, activity and site access", async () => {
    const { project, site } = await createSite();
    const otherSite = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const inactive = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      isActive: false,
      assignedSites: [site._id],
    });
    const offSiteSupervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [otherSite.site._id],
    });

    const employeeOwner = await createPermit(
      officer.authorization,
      permitBody(project._id, site._id, employee.user._id),
    );
    const inactiveOwner = await createPermit(
      officer.authorization,
      permitBody(project._id, site._id, inactive.user._id),
    );
    const offSiteOwner = await createPermit(
      officer.authorization,
      permitBody(project._id, site._id, offSiteSupervisor.user._id),
    );

    expect(employeeOwner.status).toBe(400);
    expect(inactiveOwner.status).toBe(400);
    expect(offSiteOwner.status).toBe(400);
  });

  it("runs the full DRAFT → SUBMITTED → APPROVED → ACTIVE → SUSPENDED → CLOSED lifecycle", async () => {
    const { creator, responsible, manager, permitId } =
      await createPermitFixture();

    const submitted = await updateStatus(
      responsible.authorization,
      permitId,
      { status: "SUBMITTED" },
    );

    expect(submitted.status).toBe(200);
    expect(submitted.body.permit).toMatchObject({
      status: "SUBMITTED",
      submittedBy: { id: String(responsible.user._id) },
    });

    // The submitter is also the responsible person, so self-approval is denied.
    const selfApproval = await updateStatus(responsible.authorization, permitId, {
      status: "APPROVED",
    });

    expect(selfApproval.status).toBe(403);

    const approved = await updateStatus(manager.authorization, permitId, {
      status: "APPROVED",
    });

    expect(approved.status).toBe(200);
    expect(approved.body.permit).toMatchObject({
      status: "APPROVED",
      approvedBy: { id: String(manager.user._id) },
    });

    const activated = await updateStatus(responsible.authorization, permitId, {
      status: "ACTIVE",
    });

    expect(activated.status).toBe(200);
    expect(activated.body.permit).toMatchObject({
      status: "ACTIVE",
      activatedBy: { id: String(responsible.user._id) },
    });

    const suspended = await updateStatus(responsible.authorization, permitId, {
      status: "SUSPENDED",
      reason: "Unexpected gas reading in the work area",
    });

    expect(suspended.status).toBe(200);
    expect(suspended.body.permit).toMatchObject({
      status: "SUSPENDED",
      suspensionReason: "Unexpected gas reading in the work area",
    });

    const resumed = await updateStatus(responsible.authorization, permitId, {
      status: "ACTIVE",
    });

    expect(resumed.status).toBe(200);
    expect(resumed.body.permit).toMatchObject({
      status: "ACTIVE",
      resumedBy: { id: String(responsible.user._id) },
    });

    const closed = await updateStatus(responsible.authorization, permitId, {
      status: "CLOSED",
      closureNotes: "Work complete, area handed back to operations.",
      closureChecks: {
        workAreaSecured: true,
        personnelAccountedFor: true,
        equipmentIsolated: true,
        siteHandoverCompleted: true,
      },
    });

    expect(closed.status).toBe(200);
    expect(closed.body.permit).toMatchObject({
      status: "CLOSED",
      closedBy: { id: String(responsible.user._id) },
      closureNotes: "Work complete, area handed back to operations.",
      closureChecks: {
        workAreaSecured: true,
        personnelAccountedFor: true,
        equipmentIsolated: true,
        siteHandoverCompleted: true,
      },
      isExpired: false,
    });

    const reopened = await updateStatus(manager.authorization, permitId, {
      status: "ACTIVE",
    });

    expect(reopened.status).toBe(409);

    // The workflow audit trail records status metadata but not the reason or
    // closure notes, which are free text.
    const auditLogs = await AuditLog.find({
      entityType: "Permit",
      entityId: closed.body.permit.id,
    }).lean();

    expect(auditLogs.length).toBeGreaterThanOrEqual(6);

    for (const log of auditLogs) {
      const snapshot = JSON.stringify({ before: log.before, after: log.after });
      expect(snapshot).not.toContain("Unexpected gas reading");
      expect(snapshot).not.toContain("handed back to operations");
    }

    expect(creator.user._id).toBeDefined();
  });

  it("blocks an author or submitter from approving their own permit", async () => {
    const { project, site } = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const otherManager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    // The same manager is creator, responsible person and submitter.
    const created = await createPermit(
      manager.authorization,
      permitBody(project._id, site._id, manager.user._id),
    );
    const permitId = created.body.permit.id;

    const submitted = await updateStatus(manager.authorization, permitId, {
      status: "SUBMITTED",
    });
    expect(submitted.status).toBe(200);

    const selfApproval = await updateStatus(manager.authorization, permitId, {
      status: "APPROVED",
    });
    expect(selfApproval.status).toBe(403);

    const approved = await updateStatus(otherManager.authorization, permitId, {
      status: "APPROVED",
    });
    expect(approved.status).toBe(200);
  });

  it("blocks approval and activation outside the validity window", async () => {
    const { project, site } = await createSite();
    const creator = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const now = Date.now();

    const future = await createPermit(
      creator.authorization,
      permitBody(project._id, site._id, creator.user._id, {
        validFrom: new Date(now + DAY).toISOString(),
        validTo: new Date(now + 2 * DAY).toISOString(),
      }),
    );
    const futureId = future.body.permit.id;

    await updateStatus(creator.authorization, futureId, { status: "SUBMITTED" });

    const futureApproved = await updateStatus(manager.authorization, futureId, {
      status: "APPROVED",
    });
    expect(futureApproved.status).toBe(200);

    const earlyActivation = await updateStatus(
      creator.authorization,
      futureId,
      { status: "ACTIVE" },
    );
    expect(earlyActivation.status).toBe(409);

    const expired = await createPermit(
      creator.authorization,
      permitBody(project._id, site._id, creator.user._id, {
        validFrom: new Date(now - 2 * DAY).toISOString(),
        validTo: new Date(now - DAY).toISOString(),
      }),
    );
    const expiredId = expired.body.permit.id;

    await updateStatus(creator.authorization, expiredId, { status: "SUBMITTED" });

    const expiredApproval = await updateStatus(manager.authorization, expiredId, {
      status: "APPROVED",
    });
    expect(expiredApproval.status).toBe(409);
  });

  it("marks expired permits, refuses activation and still allows safe closure", async () => {
    const { responsible, manager, permitId } = await createPermitFixture();

    await updateStatus(responsible.authorization, permitId, {
      status: "SUBMITTED",
    });
    await updateStatus(manager.authorization, permitId, { status: "APPROVED" });
    await updateStatus(responsible.authorization, permitId, { status: "ACTIVE" });

    // Simulate the validity window elapsing while work is still active.
    await Permit.updateOne(
      { _id: permitId },
      { validTo: new Date(Date.now() - HOUR) },
    );

    const detail = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", manager.authorization);

    expect(detail.status).toBe(200);
    expect(detail.body.permit.isExpired).toBe(true);

    const suspendExpired = await updateStatus(
      responsible.authorization,
      permitId,
      { status: "SUSPENDED", reason: "Permit has lapsed" },
    );
    expect(suspendExpired.status).toBe(409);

    const closeWithoutChecks = await updateStatus(
      responsible.authorization,
      permitId,
      { status: "CLOSED", closureNotes: "Area handed back." },
    );
    expect(closeWithoutChecks.status).toBe(400);

    const partiallyChecked = await updateStatus(
      responsible.authorization,
      permitId,
      {
        status: "CLOSED",
        closureNotes: "Area handed back.",
        closureChecks: {
          workAreaSecured: true,
          personnelAccountedFor: true,
          equipmentIsolated: false,
          siteHandoverCompleted: true,
        },
      },
    );
    expect(partiallyChecked.status).toBe(400);

    const noNotes = await updateStatus(responsible.authorization, permitId, {
      status: "CLOSED",
      closureChecks: {
        workAreaSecured: true,
        personnelAccountedFor: true,
        equipmentIsolated: true,
        siteHandoverCompleted: true,
      },
    });
    expect(noNotes.status).toBe(400);

    const closed = await updateStatus(responsible.authorization, permitId, {
      status: "CLOSED",
      closureNotes: "Work stopped on expiry and the area was made safe.",
      closureChecks: {
        workAreaSecured: true,
        personnelAccountedFor: true,
        equipmentIsolated: true,
        siteHandoverCompleted: true,
      },
    });

    expect(closed.status).toBe(200);
    expect(closed.body.permit).toMatchObject({
      status: "CLOSED",
      // Terminal permits are history, not currently expired work.
      isExpired: false,
    });
  });

  it("refuses to resume a suspended permit once it has expired", async () => {
    const { responsible, manager, permitId } = await createPermitFixture();

    await updateStatus(responsible.authorization, permitId, {
      status: "SUBMITTED",
    });
    await updateStatus(manager.authorization, permitId, { status: "APPROVED" });
    await updateStatus(responsible.authorization, permitId, { status: "ACTIVE" });
    await updateStatus(responsible.authorization, permitId, {
      status: "SUSPENDED",
      reason: "Gas alarm",
    });

    await Permit.updateOne(
      { _id: permitId },
      { validTo: new Date(Date.now() - HOUR) },
    );

    const resume = await updateStatus(responsible.authorization, permitId, {
      status: "ACTIVE",
    });

    expect(resume.status).toBe(409);

    const close = await updateStatus(responsible.authorization, permitId, {
      status: "CLOSED",
      closureNotes: "Suspended permit expired; area verified clear.",
      closureChecks: {
        workAreaSecured: true,
        personnelAccountedFor: true,
        equipmentIsolated: true,
        siteHandoverCompleted: true,
      },
    });

    expect(close.status).toBe(200);
  });

  it("restricts approval to HSE management and invalid transitions", async () => {
    const { project, site, creator, responsible, manager, permitId } =
      await createPermitFixture();
    const supervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });

    const draftActivation = await updateStatus(
      responsible.authorization,
      permitId,
      { status: "ACTIVE" },
    );
    expect(draftActivation.status).toBe(409);

    await updateStatus(creator.authorization, permitId, { status: "SUBMITTED" });

    const supervisorApproval = await updateStatus(
      supervisor.authorization,
      permitId,
      { status: "APPROVED" },
    );
    expect(supervisorApproval.status).toBe(403);

    const approved = await updateStatus(manager.authorization, permitId, {
      status: "APPROVED",
    });
    expect(approved.status).toBe(200);

    // HSE officers who are neither the responsible person nor management cannot
    // activate a permit.
    const unrelatedOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const officerActivation = await updateStatus(
      unrelatedOfficer.authorization,
      permitId,
      { status: "ACTIVE" },
    );
    expect(officerActivation.status).toBe(403);

    // Rejection requires a reason and is restricted to management.
    const submitted = await createPermit(
      creator.authorization,
      permitBody(project._id, site._id, responsible.user._id),
    );
    const submittedId = submitted.body.permit.id;

    await updateStatus(creator.authorization, submittedId, {
      status: "SUBMITTED",
    });

    const managerNoReason = await updateStatus(manager.authorization, submittedId, {
      status: "REJECTED",
    });
    expect(managerNoReason.status).toBe(400);

    const rejected = await updateStatus(manager.authorization, submittedId, {
      status: "REJECTED",
      reason: "Control measures were not evidenced",
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.permit).toMatchObject({
      status: "REJECTED",
      rejectionReason: "Control measures were not evidenced",
    });
  });

  it("enforces cancellation rules by status and role", async () => {
    const { project, site } = await createSite();
    const creator = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const otherOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const draft = await createPermit(
      creator.authorization,
      permitBody(project._id, site._id, creator.user._id),
    );
    const draftId = draft.body.permit.id;

    const otherCancel = await updateStatus(
      otherOfficer.authorization,
      draftId,
      { status: "CANCELLED", reason: "Not needed" },
    );
    expect(otherCancel.status).toBe(403);

    const cancelledDraft = await updateStatus(creator.authorization, draftId, {
      status: "CANCELLED",
      reason: "Scope changed",
    });
    expect(cancelledDraft.status).toBe(200);

    const approved = await createPermit(
      creator.authorization,
      permitBody(project._id, site._id, creator.user._id),
    );
    const approvedId = approved.body.permit.id;

    await updateStatus(creator.authorization, approvedId, {
      status: "SUBMITTED",
    });
    await updateStatus(manager.authorization, approvedId, { status: "APPROVED" });

    // Approved permits can only be cancelled by HSE management.
    const creatorCancelApproved = await updateStatus(
      creator.authorization,
      approvedId,
      { status: "CANCELLED", reason: "Try to cancel" },
    );
    expect(creatorCancelApproved.status).toBe(403);

    const managerCancelApproved = await updateStatus(
      manager.authorization,
      approvedId,
      { status: "CANCELLED", reason: "Work package withdrawn" },
    );
    expect(managerCancelApproved.status).toBe(200);

    // In-flight work must be suspended or closed, never cancelled away.
    const inFlight = await createPermit(
      creator.authorization,
      permitBody(project._id, site._id, creator.user._id),
    );
    const inFlightId = inFlight.body.permit.id;

    await updateStatus(creator.authorization, inFlightId, {
      status: "SUBMITTED",
    });
    await updateStatus(manager.authorization, inFlightId, { status: "APPROVED" });
    await updateStatus(creator.authorization, inFlightId, { status: "ACTIVE" });

    const cancelActive = await updateStatus(manager.authorization, inFlightId, {
      status: "CANCELLED",
      reason: "Cannot cancel live work",
    });
    expect(cancelActive.status).toBe(409);
  });

  it("scopes the register and detail to assigned sites, creator and responsible person", async () => {
    const siteA = await createSite();
    const siteB = await createSite();
    const creator = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [siteA.site._id],
    });
    const siteASupervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [siteA.site._id],
    });
    const siteBSupervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [siteB.site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await createPermit(
      creator.authorization,
      permitBody(siteA.project._id, siteA.site._id, siteASupervisor.user._id),
    );
    const permitId = created.body.permit.id;

    const siteARegister = await request(app)
      .get("/api/permits")
      .set("Authorization", siteASupervisor.authorization);
    const siteBRegister = await request(app)
      .get("/api/permits")
      .set("Authorization", siteBSupervisor.authorization);
    const managerRegister = await request(app)
      .get("/api/permits")
      .set("Authorization", manager.authorization);

    expect(
      siteARegister.body.permits.map((permit: { id: string }) => permit.id),
    ).toEqual([permitId]);
    expect(siteBRegister.body.permits).toEqual([]);
    expect(
      managerRegister.body.permits.map((permit: { id: string }) => permit.id),
    ).toContain(permitId);

    const crossSiteDetail = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", siteBSupervisor.authorization);
    expect(crossSiteDetail.status).toBe(404);

    // A permit they neither created nor are responsible for is invisible even
    // without a site filter.
    const unrelatedOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [siteB.site._id],
    });
    const unrelatedDetail = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", unrelatedOfficer.authorization);
    expect(unrelatedDetail.status).toBe(404);

    // Filters are combined with the scope, never broadening it.
    const filtered = await request(app)
      .get("/api/permits?status=DRAFT&workType=HOT_WORK&q=north")
      .set("Authorization", siteBSupervisor.authorization);

    expect(filtered.body.permits).toEqual([]);
  });

  it("restricts draft edits to the creator, responsible person or management", async () => {
    const { site, creator, responsible, manager, permitId } =
      await createPermitFixture();
    const supervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });

    const supervisorEdit = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", supervisor.authorization)
      .send({ workDescription: "Edited by an unrelated supervisor" });

    expect(supervisorEdit.status).toBe(403);

    const responsibleEdit = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", responsible.authorization)
      .send({ workDescription: "Revised hot work scope" });

    expect(responsibleEdit.status).toBe(200);
    expect(responsibleEdit.body.permit.workDescription).toBe(
      "Revised hot work scope",
    );

    // Changing the site re-validates the responsible person's site access.
    const otherSite = await createSite();
    const moveResponsibleOffSite = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", manager.authorization)
      .send({
        projectId: String(otherSite.project._id),
        siteId: String(otherSite.site._id),
      });

    expect(moveResponsibleOffSite.status).toBe(400);

    const approved = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", manager.authorization)
      .send({ validTo: new Date(Date.now() + 2 * DAY).toISOString() });

    expect(approved.status).toBe(200);

    await updateStatus(creator.authorization, permitId, { status: "SUBMITTED" });

    const editSubmitted = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization)
      .send({ workDescription: "Too late to edit" });

    expect(editSubmitted.status).toBe(403);

    // The fixture creator could raise the permit because they are assigned to
    // the site; that fact is unchanged by the failed site move.
    expect(creator.user._id).toBeDefined();
  });

  it("lists eligible responsible people filtered by site", async () => {
    const { site } = await createSite();
    const otherSite = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const onSite = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });
    const offSite = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [otherSite.site._id],
    });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const unfiltered = await request(app)
      .get("/api/permits/assignees")
      .set("Authorization", officer.authorization);
    const filtered = await request(app)
      .get(`/api/permits/assignees?siteId=${site._id}`)
      .set("Authorization", officer.authorization);

    expect(unfiltered.status).toBe(200);
    expect(
      unfiltered.body.assignees.map((assignee: { id: string }) => assignee.id),
    ).toEqual(expect.arrayContaining([String(onSite.user._id)]));

    const filteredIds = filtered.body.assignees.map(
      (assignee: { id: string }) => assignee.id,
    );

    expect(filteredIds).toContain(String(onSite.user._id));
    expect(filteredIds).not.toContain(String(offSite.user._id));
    expect(filteredIds).not.toContain(String(employee.user._id));

    // Site-scoped listings require access to the site.
    const outsider = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [otherSite.site._id],
    });
    const denied = await request(app)
      .get(`/api/permits/assignees?siteId=${site._id}`)
      .set("Authorization", outsider.authorization);

    expect(denied.status).toBe(404);
  });

  it("scopes permit evidence uploads and downloads", async () => {
    const { site, creator, manager, permitId } = await createPermitFixture();
    const crossSiteOfficer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [(await createSite()).site._id],
    });
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const uploaded = await uploadPermitEvidence(
      creator.authorization,
      permitId,
    );

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.attachment).toMatchObject({
      entityType: "permit",
      entityId: permitId,
    });

    const managerDownload = await request(app)
      .get(`/api/attachments/${uploaded.body.attachment.id}/download`)
      .set("Authorization", manager.authorization);
    expect(managerDownload.status).toBe(200);

    const crossSiteUpload = await uploadPermitEvidence(
      crossSiteOfficer.authorization,
      permitId,
    );
    const employeeUpload = await uploadPermitEvidence(
      employee.authorization,
      permitId,
    );

    expect(crossSiteUpload.status).toBe(404);
    expect(employeeUpload.status).toBe(404);

    const crossSiteList = await request(app)
      .get(`/api/attachments?entityType=permit&entityId=${permitId}`)
      .set("Authorization", crossSiteOfficer.authorization);
    expect(crossSiteList.body.attachments).toEqual([]);

    await updateStatus(creator.authorization, permitId, {
      status: "SUBMITTED",
    });
    await updateStatus(manager.authorization, permitId, { status: "APPROVED" });
    await updateStatus(manager.authorization, permitId, { status: "ACTIVE" });
    await updateStatus(manager.authorization, permitId, {
      status: "CLOSED",
      closureNotes: "Area handed over.",
      closureChecks: {
        workAreaSecured: true,
        personnelAccountedFor: true,
        equipmentIsolated: true,
        siteHandoverCompleted: true,
      },
    });

    const terminalUpload = await uploadPermitEvidence(
      creator.authorization,
      permitId,
    );

    expect(terminalUpload.status).toBe(409);

    // Sanity check that the fixture used an active site.
    expect(site.status).toBe("ACTIVE");
  });

  it("blocks site deletion while any permit references it", async () => {
    const { site, creator, responsible, manager } =
      await createPermitFixture();

    // Remove unrelated dependencies so the permit is the only blocker.
    await User.updateMany(
      { _id: { $in: [creator.user._id, responsible.user._id] } },
      { $set: { assignedSites: [] } },
    );

    const deleted = await request(app)
      .delete(`/api/sites/${site._id}`)
      .set("Authorization", manager.authorization);

    expect(deleted.status).toBe(409);
    expect(deleted.body.message).toMatch(/permit/i);
  });

  it("blocks project deletion even when only a terminal permit remains", async () => {
    const { project, site, creator, manager, permitId } =
      await createPermitFixture();

    await updateStatus(creator.authorization, permitId, { status: "SUBMITTED" });
    await updateStatus(manager.authorization, permitId, { status: "APPROVED" });
    await updateStatus(manager.authorization, permitId, { status: "ACTIVE" });
    await updateStatus(manager.authorization, permitId, {
      status: "CLOSED",
      closureNotes: "Complete.",
      closureChecks: {
        workAreaSecured: true,
        personnelAccountedFor: true,
        equipmentIsolated: true,
        siteHandoverCompleted: true,
      },
    });

    // Remove the site directly so only the permit remains as a dependency.
    await Site.deleteOne({ _id: site._id });

    const projectDelete = await request(app)
      .delete(`/api/projects/${project._id}`)
      .set("Authorization", manager.authorization);

    expect(projectDelete.status).toBe(409);
    expect(projectDelete.body.message).toMatch(/permit/i);
  });
});
