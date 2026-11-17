import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Contractor } from "../src/models/Contractor.js";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { ContractorPersonnelSiteAssignment } from "../src/models/ContractorPersonnelSiteAssignment.js";
import { TrainingCourse } from "../src/models/TrainingCourse.js";
import { TrainingSession } from "../src/models/TrainingSession.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
]);

let sequence = 0;

async function createSite(status = "ACTIVE") {
  sequence += 1;

  const project = await Project.create({
    name: `Training Project ${sequence}`,
    code: `TRN${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Training Site ${sequence}`,
    code: `TSITE${sequence}`,
    status,
  });

  return { project, site };
}

async function createContractorPerson(siteId: unknown) {
  sequence += 1;

  const contractor = await Contractor.create({
    name: `Training Contractor ${sequence}`,
  });
  const person = await ContractorPersonnel.create({
    contractor: contractor._id,
    firstName: "Kunle",
    lastName: `Bello ${sequence}`,
    personnelId: `TRN-CP-${sequence}`,
  });

  await ContractorPersonnelSiteAssignment.create({
    personnel: person._id,
    contractor: contractor._id,
    site: siteId,
  });

  return person;
}

async function createCourse(
  managerAuthorization: string,
  overrides: Record<string, unknown> = {},
) {
  sequence += 1;
  const response = await request(app)
    .post("/api/training/courses")
    .set("Authorization", managerAuthorization)
    .send({
      code: `TRN-${sequence}`,
      title: `Working at height ${sequence}`,
      category: "WORK_AT_HEIGHT",
      defaultDurationMinutes: 60,
      ...overrides,
    });

  expect(response.status).toBe(201);
  return response.body.course;
}

function sessionBody(
  projectId: unknown,
  siteId: unknown,
  courseId: unknown,
  participants: unknown[] = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    courseId: String(courseId),
    projectId: String(projectId),
    siteId: String(siteId),
    topic: "Scaffold erection refresher",
    description: "Refresher for scaffold crews.",
    trainerName: "Grace Adeyemi",
    scheduledDate: new Date().toISOString(),
    durationMinutes: 60,
    participants,
    ...overrides,
  };
}

function createSession(
  authorization: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post("/api/training")
    .set("Authorization", authorization)
    .send(body);
}

function updateParticipants(
  authorization: string,
  sessionId: string,
  participants: unknown[],
) {
  return request(app)
    .put(`/api/training/${sessionId}/participants`)
    .set("Authorization", authorization)
    .send({ participants });
}

function updateStatus(
  authorization: string,
  sessionId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .patch(`/api/training/${sessionId}/status`)
    .set("Authorization", authorization)
    .send(body);
}

async function createSessionFixture() {
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
  const otherEmployee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
  const contractorPerson = await createContractorPerson(site._id);
  const course = await createCourse(manager.authorization);

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
    officer,
    employee,
    otherEmployee,
    contractorPerson,
    course,
    participants,
  };
}

describe("training courses", () => {
  it("restricts course changes to HSE management and blocks duplicate codes", async () => {
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const officer = await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });

    const created = await request(app)
      .post("/api/training/courses")
      .set("Authorization", officer.authorization)
      .send({
        code: "PPE-01",
        title: "PPE essentials",
        category: "PPE",
      });

    expect(created.status).toBe(403);

    const course = await createCourse(manager.authorization, {
      code: "ppe-01",
      title: "PPE essentials",
      category: "PPE",
    });

    expect(course.code).toBe("PPE-01");

    const duplicate = await request(app)
      .post("/api/training/courses")
      .set("Authorization", manager.authorization)
      .send({
        code: "PPE-01",
        title: "Duplicate PPE",
        category: "PPE",
      });

    expect(duplicate.status).toBe(409);

    const deactivated = await request(app)
      .patch(`/api/training/courses/${course.id}`)
      .set("Authorization", manager.authorization)
      .send({ isActive: false });

    expect(deactivated.status).toBe(200);
    expect(deactivated.body.course.isActive).toBe(false);

    const activeList = await request(app)
      .get("/api/training/courses")
      .set("Authorization", manager.authorization);

    expect(
      activeList.body.courses.some(
        (item: { id: string }) => item.id === course.id,
      ),
    ).toBe(false);

    const fullList = await request(app)
      .get("/api/training/courses?includeInactive=true")
      .set("Authorization", manager.authorization);

    expect(
      fullList.body.courses.some((item: { id: string }) => item.id === course.id),
    ).toBe(true);
  });
});

describe("training sessions", () => {
  it("schedules sessions with separate employee and contractor participants", async () => {
    const fixture = await createSessionFixture();

    const response = await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
        fixture.participants,
      ),
    );

    expect(response.status).toBe(201);
    expect(response.body.session.participantCount).toBe(2);
    expect(response.body.session.employeeParticipantCount).toBe(1);
    expect(response.body.session.contractorParticipantCount).toBe(1);

    const [employeeRow, contractorRow] = response.body.session.participants;
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
    const fixture = await createSessionFixture();
    const inactive = await createSite("PLANNED");
    const foreign = await createSite();
    const unassignedContractor = await ContractorPersonnel.create({
      contractor: (await Contractor.create({ name: "Unassigned Co" }))._id,
      firstName: "Sola",
      lastName: "Unassigned",
    });

    const inactiveResponse = await createSession(
      fixture.manager.authorization,
      sessionBody(
        inactive.project._id,
        inactive.site._id,
        fixture.course.id,
      ),
    );
    expect(inactiveResponse.status).toBe(409);

    const mismatchResponse = await createSession(
      fixture.manager.authorization,
      sessionBody(
        foreign.project._id,
        fixture.site._id,
        fixture.course.id,
      ),
    );
    expect(mismatchResponse.status).toBe(409);

    const contractorResponse = await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
        [
          {
            kind: "CONTRACTOR",
            contractorPersonnelId: String(unassignedContractor._id),
          },
        ],
      ),
    );
    expect(contractorResponse.status).toBe(400);

    const duplicateResponse = await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
        [fixture.participants[0], fixture.participants[0]],
      ),
    );
    expect(duplicateResponse.status).toBe(400);
  });

  it("scopes the register to assigned sites and returns 404 outside scope", async () => {
    const fixture = await createSessionFixture();
    const otherSite = await createSite();
    const outsider = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [otherSite.site._id],
    });

    const created = await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
        fixture.participants,
      ),
    );
    const sessionId = created.body.session.id as string;

    const ownList = await request(app)
      .get("/api/training")
      .set("Authorization", fixture.officer.authorization);
    expect(ownList.body.pagination.total).toBe(1);

    const otherList = await request(app)
      .get("/api/training")
      .set("Authorization", outsider.authorization);
    expect(otherList.body.pagination.total).toBe(0);

    const otherDetail = await request(app)
      .get(`/api/training/${sessionId}`)
      .set("Authorization", outsider.authorization);
    expect(otherDetail.status).toBe(404);

    const employeeDetail = await request(app)
      .get(`/api/training/${sessionId}`)
      .set("Authorization", fixture.employee.authorization);
    expect(employeeDetail.status).toBe(403);

    const managerList = await request(app)
      .get("/api/training")
      .set("Authorization", fixture.manager.authorization);
    expect(managerList.body.pagination.total).toBe(1);
  });

  it("keeps employee self-history private to the caller's own row", async () => {
    const fixture = await createSessionFixture();
    const created = await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
        fixture.participants,
      ),
    );
    expect(created.status).toBe(201);

    const mine = await request(app)
      .get("/api/training/my")
      .set("Authorization", fixture.employee.authorization);

    expect(mine.status).toBe(200);
    expect(mine.body.sessions).toHaveLength(1);

    const record = mine.body.sessions[0];
    expect(record.participation.employeeId).toBe(
      String(fixture.employee.user._id),
    );
    expect(record).not.toHaveProperty("participants");
    expect(JSON.stringify(mine.body)).not.toContain("Kunle");

    const other = await request(app)
      .get("/api/training/my")
      .set("Authorization", fixture.otherEmployee.authorization);

    expect(other.status).toBe(200);
    expect(other.body.sessions).toHaveLength(0);
  });

  it("validates attendance, completion and certificate dates", async () => {
    const fixture = await createSessionFixture();
    const created = await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
      ),
    );
    const sessionId = created.body.session.id as string;

    const completedWithoutAttendance = await updateParticipants(
      fixture.officer.authorization,
      sessionId,
      [
        {
          kind: "EMPLOYEE",
          employeeId: String(fixture.employee.user._id),
          attendance: "INVITED",
          completed: true,
        },
      ],
    );
    expect(completedWithoutAttendance.status).toBe(400);

    const badCertificate = await updateParticipants(
      fixture.officer.authorization,
      sessionId,
      [
        {
          kind: "EMPLOYEE",
          employeeId: String(fixture.employee.user._id),
          attendance: "ATTENDED",
          completed: true,
          certificateNumber: "CERT-1",
          certificateIssuedOn: "2026-05-01T00:00:00.000Z",
          certificateExpiresOn: "2026-04-01T00:00:00.000Z",
        },
      ],
    );
    expect(badCertificate.status).toBe(400);

    const numberWithoutIssue = await updateParticipants(
      fixture.officer.authorization,
      sessionId,
      [
        {
          kind: "EMPLOYEE",
          employeeId: String(fixture.employee.user._id),
          certificateNumber: "CERT-1",
        },
      ],
    );
    expect(numberWithoutIssue.status).toBe(400);

    const valid = await updateParticipants(
      fixture.officer.authorization,
      sessionId,
      [
        {
          kind: "EMPLOYEE",
          employeeId: String(fixture.employee.user._id),
          attendance: "ATTENDED",
          completed: true,
          certificateNumber: "CERT-1",
          certificateIssuedOn: "2026-05-01T00:00:00.000Z",
          certificateExpiresOn: "2027-05-01T00:00:00.000Z",
        },
        {
          kind: "CONTRACTOR",
          contractorPersonnelId: String(fixture.contractorPerson._id),
          attendance: "ABSENT",
        },
      ],
    );

    expect(valid.status).toBe(200);
    expect(valid.body.session.completedCount).toBe(1);
    expect(valid.body.session.attendedCount).toBe(1);
    expect(valid.body.session.participants[0].certificateState).toBe("VALID");
  });

  it("requires an attended participant and freezes terminal sessions", async () => {
    const fixture = await createSessionFixture();
    const created = await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
        [
          {
            kind: "EMPLOYEE",
            employeeId: String(fixture.employee.user._id),
            attendance: "INVITED",
          },
        ],
      ),
    );
    const sessionId = created.body.session.id as string;

    const blocked = await updateStatus(
      fixture.officer.authorization,
      sessionId,
      { status: "COMPLETED" },
    );
    expect(blocked.status).toBe(409);

    await updateParticipants(fixture.officer.authorization, sessionId, [
      {
        kind: "EMPLOYEE",
        employeeId: String(fixture.employee.user._id),
        attendance: "ATTENDED",
        completed: true,
      },
    ]);

    const completed = await updateStatus(
      fixture.officer.authorization,
      sessionId,
      { status: "COMPLETED" },
    );
    expect(completed.status).toBe(200);
    expect(completed.body.session.status).toBe("COMPLETED");
    expect(completed.body.session.completedAt).not.toBeNull();

    const edit = await request(app)
      .patch(`/api/training/${sessionId}`)
      .set("Authorization", fixture.officer.authorization)
      .send({ topic: "Rewritten after completion" });
    expect(edit.status).toBe(403);

    const attendanceEdit = await updateParticipants(
      fixture.officer.authorization,
      sessionId,
      [],
    );
    expect(attendanceEdit.status).toBe(403);

    const transitionAgain = await updateStatus(
      fixture.officer.authorization,
      sessionId,
      { status: "CANCELLED", reason: "Too late" },
    );
    expect(transitionAgain.status).toBe(409);
  });

  it("writes audit rows without free text or certificate details", async () => {
    const fixture = await createSessionFixture();
    const created = await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
        fixture.participants,
      ),
    );
    const sessionId = created.body.session.id as string;

    await updateParticipants(fixture.officer.authorization, sessionId, [
      {
        kind: "EMPLOYEE",
        employeeId: String(fixture.employee.user._id),
        attendance: "ATTENDED",
        completed: true,
        certificateNumber: "SECRET-CERT-9",
        certificateIssuedOn: "2026-01-01T00:00:00.000Z",
      },
    ]);
    await updateStatus(fixture.officer.authorization, sessionId, {
      status: "COMPLETED",
    });

    const audits = await AuditLog.find({ entityId: sessionId }).lean();
    const actions = audits.map((audit) => audit.action);

    expect(actions).toEqual(
      expect.arrayContaining([
        "training.session_created",
        "training.participants_updated",
        "training.session_completed",
      ]),
    );

    const serialized = JSON.stringify(audits);

    expect(serialized).not.toContain("Scaffold erection refresher");
    expect(serialized).not.toContain("Grace Adeyemi");
    expect(serialized).not.toContain("SECRET-CERT-9");
    expect(serialized).not.toContain("Kunle");
  });

  it("serves person history only within the viewer's site scope", async () => {
    const fixture = await createSessionFixture();
    const otherSite = await createSite();
    const outsider = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [otherSite.site._id],
    });

    await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
        fixture.participants,
      ),
    );

    const employeeHistory = await request(app)
      .get(
        `/api/training/personnel/employee/${String(fixture.employee.user._id)}/history`,
      )
      .set("Authorization", fixture.manager.authorization);

    expect(employeeHistory.status).toBe(200);
    expect(employeeHistory.body.records).toHaveLength(1);
    expect(employeeHistory.body.records[0].participation.kind).toBe("EMPLOYEE");
    expect(employeeHistory.body.records[0]).not.toHaveProperty("participants");

    const contractorHistory = await request(app)
      .get(
        `/api/training/personnel/contractor/${String(fixture.contractorPerson._id)}/history`,
      )
      .set("Authorization", fixture.manager.authorization);

    expect(contractorHistory.status).toBe(200);
    expect(contractorHistory.body.records).toHaveLength(1);
    expect(contractorHistory.body.records[0].participation.kind).toBe(
      "CONTRACTOR",
    );

    const outsiderHistory = await request(app)
      .get(
        `/api/training/personnel/contractor/${String(fixture.contractorPerson._id)}/history`,
      )
      .set("Authorization", outsider.authorization);

    expect(outsiderHistory.status).toBe(200);
    expect(outsiderHistory.body.records).toHaveLength(0);

    const employeeAttempt = await request(app)
      .get(
        `/api/training/personnel/employee/${String(fixture.employee.user._id)}/history`,
      )
      .set("Authorization", fixture.employee.authorization);

    expect(employeeAttempt.status).toBe(403);
  });

  it("scopes training evidence attachments and blocks terminal uploads", async () => {
    const fixture = await createSessionFixture();
    const otherSite = await createSite();
    const outsider = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [otherSite.site._id],
    });
    const created = await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
        [
          {
            kind: "EMPLOYEE",
            employeeId: String(fixture.employee.user._id),
            attendance: "ATTENDED",
            completed: true,
          },
        ],
      ),
    );
    const sessionId = created.body.session.id as string;

    function upload(authorization: string) {
      return request(app)
        .post("/api/attachments")
        .set("Authorization", authorization)
        .field("entityType", "training_session")
        .field("entityId", sessionId)
        .attach("file", PNG, {
          filename: "attendance.png",
          contentType: "image/png",
        });
    }

    const ownerUpload = await upload(fixture.officer.authorization);
    expect(ownerUpload.status).toBe(201);

    const employeeUpload = await upload(fixture.employee.authorization);
    expect(employeeUpload.status).toBe(404);

    const attachmentId = ownerUpload.body.attachment.id as string;

    const ownerDownload = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("Authorization", fixture.officer.authorization);
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

    await updateStatus(fixture.officer.authorization, sessionId, {
      status: "COMPLETED",
    });

    const terminalUpload = await upload(fixture.officer.authorization);
    expect(terminalUpload.status).toBe(409);
  });

  it("protects projects and sites that still have training history", async () => {
    const fixture = await createSessionFixture();
    await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
      ),
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

describe("training session persistence", () => {
  it("stores participants as discriminated references", async () => {
    const fixture = await createSessionFixture();
    await createSession(
      fixture.officer.authorization,
      sessionBody(
        fixture.project._id,
        fixture.site._id,
        fixture.course.id,
        fixture.participants,
      ),
    );

    const stored = await TrainingSession.findOne({}).lean();
    expect(stored?.participants).toHaveLength(2);
    expect(stored?.participants[0]?.employee).not.toBeNull();
    expect(stored?.participants[0]?.contractorPersonnel).toBeNull();
    expect(stored?.participants[1]?.contractorPersonnel).not.toBeNull();
    expect(stored?.participants[1]?.employee).toBeNull();

    const courses = await TrainingCourse.countDocuments();
    expect(courses).toBe(1);
  });
});
