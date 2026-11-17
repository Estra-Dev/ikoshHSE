import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Contractor } from "../src/models/Contractor.js";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { ContractorPersonnelSiteAssignment } from "../src/models/ContractorPersonnelSiteAssignment.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { ToolboxTalk } from "../src/models/ToolboxTalk.js";
import { signInAsIkoshUser } from "./helpers.js";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
]);

let sequence = 0;

async function createSite(status = "ACTIVE") {
  sequence += 1;

  const project = await Project.create({
    name: `Toolbox Project ${sequence}`,
    code: `TBX${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Toolbox Site ${sequence}`,
    code: `TBSITE${sequence}`,
    status,
  });

  return { project, site };
}

async function createContractorPerson(siteId: unknown) {
  sequence += 1;

  const contractor = await Contractor.create({
    name: `Toolbox Contractor ${sequence}`,
  });
  const person = await ContractorPersonnel.create({
    contractor: contractor._id,
    firstName: "Ada",
    lastName: `Okoro ${sequence}`,
    personnelId: `TBX-CP-${sequence}`,
  });

  await ContractorPersonnelSiteAssignment.create({
    personnel: person._id,
    contractor: contractor._id,
    site: siteId,
  });

  return person;
}

function talkBody(
  projectId: unknown,
  siteId: unknown,
  participants: unknown[] = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId: String(projectId),
    siteId: String(siteId),
    topic: "Manual handling at the laydown yard",
    discussionPoints: "Lift technique, team lifts, route clearance.",
    facilitatorName: "Musa Ibrahim",
    scheduledDate: new Date().toISOString(),
    durationMinutes: 20,
    participants,
    ...overrides,
  };
}

function createTalk(authorization: string, body: Record<string, unknown>) {
  return request(app)
    .post("/api/toolbox-talks")
    .set("Authorization", authorization)
    .send(body);
}

function updateParticipants(
  authorization: string,
  talkId: string,
  participants: unknown[],
) {
  return request(app)
    .put(`/api/toolbox-talks/${talkId}/participants`)
    .set("Authorization", authorization)
    .send({ participants });
}

function updateStatus(
  authorization: string,
  talkId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .patch(`/api/toolbox-talks/${talkId}/status`)
    .set("Authorization", authorization)
    .send(body);
}

async function createTalkFixture() {
  const { project, site } = await createSite();
  const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
  const supervisor = await signInAsIkoshUser({
    ikoshRole: "SUPERVISOR",
    assignedSites: [site._id],
  });
  const employee = await signInAsIkoshUser({
    ikoshRole: "EMPLOYEE",
    assignedSites: [site._id],
  });
  const otherEmployee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
  const contractorPerson = await createContractorPerson(site._id);

  const participants = [
    {
      kind: "EMPLOYEE",
      employeeId: String(employee.user._id),
      attendance: "INVITED",
    },
    {
      kind: "CONTRACTOR",
      contractorPersonnelId: String(contractorPerson._id),
      attendance: "INVITED",
    },
  ];

  return {
    project,
    site,
    manager,
    supervisor,
    employee,
    otherEmployee,
    contractorPerson,
    participants,
  };
}

describe("toolbox talks", () => {
  it("schedules talks with separate employee and contractor attendees", async () => {
    const fixture = await createTalkFixture();

    const response = await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id, fixture.participants),
    );

    expect(response.status).toBe(201);
    expect(response.body.talk.participantCount).toBe(2);
    expect(response.body.talk.employeeParticipantCount).toBe(1);
    expect(response.body.talk.contractorParticipantCount).toBe(1);

    const [employeeRow, contractorRow] = response.body.talk.participants;
    expect(employeeRow.kind).toBe("EMPLOYEE");
    expect(employeeRow.employeeId).toBe(String(fixture.employee.user._id));
    expect(employeeRow.contractorPersonnelId).toBeNull();
    expect(contractorRow.kind).toBe("CONTRACTOR");
    expect(contractorRow.contractorPersonnelId).toBe(
      String(fixture.contractorPerson._id),
    );
    expect(contractorRow.employeeId).toBeNull();
    expect(contractorRow.contractor).not.toBeNull();
  });

  it("rejects inactive sites, mismatched projects, unassigned contractors and duplicates", async () => {
    const fixture = await createTalkFixture();
    const inactive = await createSite("PLANNED");
    const foreign = await createSite();
    const unassignedContractor = await ContractorPersonnel.create({
      contractor: (await Contractor.create({ name: "Unassigned Talk Co" }))._id,
      firstName: "Ngozi",
      lastName: "Unassigned",
    });

    const inactiveResponse = await createTalk(
      fixture.manager.authorization,
      talkBody(inactive.project._id, inactive.site._id),
    );
    expect(inactiveResponse.status).toBe(409);

    const mismatchResponse = await createTalk(
      fixture.manager.authorization,
      talkBody(foreign.project._id, fixture.site._id),
    );
    expect(mismatchResponse.status).toBe(409);

    const contractorResponse = await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id, [
        {
          kind: "CONTRACTOR",
          contractorPersonnelId: String(unassignedContractor._id),
        },
      ]),
    );
    expect(contractorResponse.status).toBe(400);

    const duplicateResponse = await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id, [
        fixture.participants[0],
        fixture.participants[0],
      ]),
    );
    expect(duplicateResponse.status).toBe(400);
  });

  it("scopes the register to assigned sites and returns 404 outside scope", async () => {
    const fixture = await createTalkFixture();
    const otherSite = await createSite();
    const outsider = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [otherSite.site._id],
    });

    const created = await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id, fixture.participants),
    );
    const talkId = created.body.talk.id as string;

    const ownList = await request(app)
      .get("/api/toolbox-talks")
      .set("Authorization", fixture.supervisor.authorization);
    expect(ownList.body.pagination.total).toBe(1);

    const otherList = await request(app)
      .get("/api/toolbox-talks")
      .set("Authorization", outsider.authorization);
    expect(otherList.body.pagination.total).toBe(0);

    const otherDetail = await request(app)
      .get(`/api/toolbox-talks/${talkId}`)
      .set("Authorization", outsider.authorization);
    expect(otherDetail.status).toBe(404);

    const employeeDetail = await request(app)
      .get(`/api/toolbox-talks/${talkId}`)
      .set("Authorization", fixture.employee.authorization);
    expect(employeeDetail.status).toBe(403);

    const managerList = await request(app)
      .get("/api/toolbox-talks")
      .set("Authorization", fixture.manager.authorization);
    expect(managerList.body.pagination.total).toBe(1);
  });

  it("keeps employee self-history private to the caller's own row", async () => {
    const fixture = await createTalkFixture();
    const created = await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id, fixture.participants),
    );
    expect(created.status).toBe(201);

    const mine = await request(app)
      .get("/api/toolbox-talks/my")
      .set("Authorization", fixture.employee.authorization);

    expect(mine.status).toBe(200);
    expect(mine.body.talks).toHaveLength(1);

    const record = mine.body.talks[0];
    expect(record.participation.employeeId).toBe(
      String(fixture.employee.user._id),
    );
    expect(record).not.toHaveProperty("participants");
    expect(JSON.stringify(mine.body)).not.toContain("Ada");

    const other = await request(app)
      .get("/api/toolbox-talks/my")
      .set("Authorization", fixture.otherEmployee.authorization);

    expect(other.status).toBe(200);
    expect(other.body.talks).toHaveLength(0);
  });

  it("requires an acknowledged attendee and freezes terminal talks", async () => {
    const fixture = await createTalkFixture();
    const created = await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id, [
        {
          kind: "EMPLOYEE",
          employeeId: String(fixture.employee.user._id),
          attendance: "ATTENDED",
          acknowledged: false,
        },
      ]),
    );
    const talkId = created.body.talk.id as string;

    const blocked = await updateStatus(
      fixture.supervisor.authorization,
      talkId,
      { status: "COMPLETED" },
    );
    expect(blocked.status).toBe(409);

    const acknowledgedWithoutAttendance = await updateParticipants(
      fixture.supervisor.authorization,
      talkId,
      [
        {
          kind: "EMPLOYEE",
          employeeId: String(fixture.employee.user._id),
          attendance: "INVITED",
          acknowledged: true,
        },
      ],
    );
    expect(acknowledgedWithoutAttendance.status).toBe(400);

    const recorded = await updateParticipants(
      fixture.supervisor.authorization,
      talkId,
      [
        {
          kind: "EMPLOYEE",
          employeeId: String(fixture.employee.user._id),
          attendance: "ATTENDED",
          acknowledged: true,
        },
        {
          kind: "CONTRACTOR",
          contractorPersonnelId: String(fixture.contractorPerson._id),
          attendance: "ABSENT",
        },
      ],
    );
    expect(recorded.status).toBe(200);
    expect(recorded.body.talk.acknowledgedCount).toBe(1);
    expect(recorded.body.talk.attendedCount).toBe(1);

    const completed = await updateStatus(
      fixture.supervisor.authorization,
      talkId,
      { status: "COMPLETED" },
    );
    expect(completed.status).toBe(200);
    expect(completed.body.talk.status).toBe("COMPLETED");
    expect(completed.body.talk.completedAt).not.toBeNull();

    const edit = await request(app)
      .patch(`/api/toolbox-talks/${talkId}`)
      .set("Authorization", fixture.supervisor.authorization)
      .send({ topic: "Rewritten after completion" });
    expect(edit.status).toBe(403);

    const attendanceEdit = await updateParticipants(
      fixture.supervisor.authorization,
      talkId,
      [],
    );
    expect(attendanceEdit.status).toBe(403);

    const transitionAgain = await updateStatus(
      fixture.supervisor.authorization,
      talkId,
      { status: "CANCELLED", reason: "Too late" },
    );
    expect(transitionAgain.status).toBe(409);
  });

  it("requires a cancellation reason and records the actor", async () => {
    const fixture = await createTalkFixture();
    const created = await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id),
    );
    const talkId = created.body.talk.id as string;

    const missingReason = await updateStatus(
      fixture.supervisor.authorization,
      talkId,
      { status: "CANCELLED" },
    );
    expect(missingReason.status).toBe(400);

    const cancelled = await updateStatus(
      fixture.supervisor.authorization,
      talkId,
      { status: "CANCELLED", reason: "Crew moved to emergency repair." },
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.talk.status).toBe("CANCELLED");
    expect(cancelled.body.talk.cancellationReason).toBe(
      "Crew moved to emergency repair.",
    );
    expect(cancelled.body.talk.cancelledBy.id).toBe(
      String(fixture.supervisor.user._id),
    );
  });

  it("writes audit rows without free text or participant names", async () => {
    const fixture = await createTalkFixture();
    const created = await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id, fixture.participants),
    );
    const talkId = created.body.talk.id as string;

    await updateParticipants(fixture.supervisor.authorization, talkId, [
      {
        kind: "EMPLOYEE",
        employeeId: String(fixture.employee.user._id),
        attendance: "ATTENDED",
        acknowledged: true,
      },
    ]);
    await updateStatus(fixture.supervisor.authorization, talkId, {
      status: "COMPLETED",
    });

    const audits = await AuditLog.find({ entityId: talkId }).lean();
    const actions = audits.map((audit) => audit.action);

    expect(actions).toEqual(
      expect.arrayContaining([
        "toolbox_talk.created",
        "toolbox_talk.participants_updated",
        "toolbox_talk.completed",
      ]),
    );

    const serialized = JSON.stringify(audits);

    expect(serialized).not.toContain("Manual handling at the laydown yard");
    expect(serialized).not.toContain("Musa Ibrahim");
    expect(serialized).not.toContain("Ada");
  });

  it("serves person history only within the viewer's site scope", async () => {
    const fixture = await createTalkFixture();
    const otherSite = await createSite();
    const outsider = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [otherSite.site._id],
    });

    await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id, fixture.participants),
    );

    const employeeHistory = await request(app)
      .get(
        `/api/toolbox-talks/personnel/employee/${String(fixture.employee.user._id)}/history`,
      )
      .set("Authorization", fixture.manager.authorization);

    expect(employeeHistory.status).toBe(200);
    expect(employeeHistory.body.records).toHaveLength(1);
    expect(employeeHistory.body.records[0].participation.kind).toBe("EMPLOYEE");
    expect(employeeHistory.body.records[0]).not.toHaveProperty("participants");

    const contractorHistory = await request(app)
      .get(
        `/api/toolbox-talks/personnel/contractor/${String(fixture.contractorPerson._id)}/history`,
      )
      .set("Authorization", fixture.manager.authorization);

    expect(contractorHistory.status).toBe(200);
    expect(contractorHistory.body.records).toHaveLength(1);
    expect(contractorHistory.body.records[0].participation.kind).toBe(
      "CONTRACTOR",
    );

    const outsiderHistory = await request(app)
      .get(
        `/api/toolbox-talks/personnel/contractor/${String(fixture.contractorPerson._id)}/history`,
      )
      .set("Authorization", outsider.authorization);

    expect(outsiderHistory.status).toBe(200);
    expect(outsiderHistory.body.records).toHaveLength(0);

    const employeeAttempt = await request(app)
      .get(
        `/api/toolbox-talks/personnel/employee/${String(fixture.employee.user._id)}/history`,
      )
      .set("Authorization", fixture.employee.authorization);

    expect(employeeAttempt.status).toBe(403);
  });

  it("scopes talk evidence attachments and blocks terminal uploads", async () => {
    const fixture = await createTalkFixture();
    const otherSite = await createSite();
    const outsider = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [otherSite.site._id],
    });
    const created = await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id, [
        {
          kind: "EMPLOYEE",
          employeeId: String(fixture.employee.user._id),
          attendance: "ATTENDED",
          acknowledged: true,
        },
      ]),
    );
    const talkId = created.body.talk.id as string;

    function upload(authorization: string) {
      return request(app)
        .post("/api/attachments")
        .set("Authorization", authorization)
        .field("entityType", "toolbox_talk")
        .field("entityId", talkId)
        .attach("file", PNG, {
          filename: "briefing.png",
          contentType: "image/png",
        });
    }

    const ownerUpload = await upload(fixture.supervisor.authorization);
    expect(ownerUpload.status).toBe(201);

    const employeeUpload = await upload(fixture.employee.authorization);
    expect(employeeUpload.status).toBe(404);

    const attachmentId = ownerUpload.body.attachment.id as string;

    const ownerDownload = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("Authorization", fixture.supervisor.authorization);
    expect(ownerDownload.status).toBe(200);

    const outsiderDownload = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("Authorization", outsider.authorization);
    expect(outsiderDownload.status).toBe(404);

    const employeeDownload = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("Authorization", fixture.employee.authorization);
    expect(employeeDownload.status).toBe(404);

    const employeeList = await request(app)
      .get("/api/attachments")
      .set("Authorization", fixture.employee.authorization);
    expect(
      employeeList.body.attachments.some(
        (attachment: { id: string }) => attachment.id === attachmentId,
      ),
    ).toBe(false);

    await updateStatus(fixture.supervisor.authorization, talkId, {
      status: "COMPLETED",
    });

    const terminalUpload = await upload(fixture.supervisor.authorization);
    expect(terminalUpload.status).toBe(409);
  });

  it("protects projects and sites that still have toolbox talk history", async () => {
    const fixture = await createTalkFixture();
    await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id),
    );

    const siteDelete = await request(app)
      .delete(`/api/sites/${String(fixture.site._id)}`)
      .set("Authorization", fixture.manager.authorization);
    expect(siteDelete.status).toBe(409);

    const projectDelete = await request(app)
      .delete(`/api/projects/${String(fixture.project._id)}`)
      .set("Authorization", fixture.manager.authorization);
    expect(projectDelete.status).toBe(409);
  });
});

describe("toolbox talk persistence", () => {
  it("stores attendees as discriminated references", async () => {
    const fixture = await createTalkFixture();
    await createTalk(
      fixture.supervisor.authorization,
      talkBody(fixture.project._id, fixture.site._id, fixture.participants),
    );

    const stored = await ToolboxTalk.findOne({}).lean();
    expect(stored?.participants).toHaveLength(2);
    expect(stored?.participants[0]?.employee).not.toBeNull();
    expect(stored?.participants[0]?.contractorPersonnel).toBeNull();
    expect(stored?.participants[1]?.contractorPersonnel).not.toBeNull();
    expect(stored?.participants[1]?.employee).toBeNull();
  });
});
