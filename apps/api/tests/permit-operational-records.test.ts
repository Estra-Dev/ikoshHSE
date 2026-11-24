import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { app } from "../src/app.js";
import { Attachment } from "../src/models/Attachment.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Permit } from "../src/models/Permit.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
let sequence = 0;

function nextCode(prefix: string): string {
  sequence += 1;
  return `${prefix}${sequence}`;
}

interface Workspace {
  projectId: string;
  siteId: string;
  creator: Awaited<ReturnType<typeof signInAsIkoshUser>>;
  responsible: Awaited<ReturnType<typeof signInAsIkoshUser>>;
  manager: Awaited<ReturnType<typeof signInAsIkoshUser>>;
  admin: Awaited<ReturnType<typeof signInAsIkoshUser>>;
  outsider: Awaited<ReturnType<typeof signInAsIkoshUser>>;
  supervisorElsewhere: Awaited<ReturnType<typeof signInAsIkoshUser>>;
  employee: Awaited<ReturnType<typeof signInAsIkoshUser>>;
  permitId: string;
}

async function createWorkspace(): Promise<Workspace> {
  const project = await Project.create({
    name: `Operational record project ${nextCode("P")}`,
    code: nextCode("PRJ"),
  });
  const site = await Site.create({
    project: project._id,
    name: `Operational record site ${nextCode("S")}`,
    code: nextCode("SITE"),
    status: "ACTIVE",
  });

  const creator = await signInAsIkoshUser({
    ikoshRole: "HSE_OFFICER",
    assignedSites: [site._id],
  });
  const responsible = await signInAsIkoshUser({
    ikoshRole: "SUPERVISOR",
    assignedSites: [site._id],
  });
  const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
  const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
  // HSE officer with no site assignment: has operatePermits but no permit scope.
  const outsider = await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });
  // Supervisor with no site assignment: operatePermits but no permit scope.
  const supervisorElsewhere = await signInAsIkoshUser({
    ikoshRole: "SUPERVISOR",
  });
  const employee = await signInAsIkoshUser({
    ikoshRole: "EMPLOYEE",
    assignedSites: [site._id],
  });

  const now = Date.now();
  const created = await request(app)
    .post("/api/permits")
    .set("Authorization", creator.authorization)
    .send({
      workDescription: "Operational record test work",
      workType: "HOT_WORK",
      projectId: String(project._id),
      siteId: String(site._id),
      location: "Test area",
      validFrom: new Date(now - HOUR).toISOString(),
      validTo: new Date(now + DAY).toISOString(),
      responsiblePersonId: String(responsible.user._id),
      workersInvolved: ["Test worker"],
      requiredPrecautions: ["PPE", "FIRE_WATCH"],
      hazards: [
        {
          hazard: "Test hazard",
          controlMeasures: "Test control",
        },
      ],
    });

  expect(created.status).toBe(201);

  return {
    projectId: String(project._id),
    siteId: String(site._id),
    creator,
    responsible,
    manager,
    admin,
    outsider,
    supervisorElsewhere,
    employee,
    permitId: created.body.permit.id as string,
  };
}

function postRecord(
  authorization: string,
  permitId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(`/api/permits/${permitId}/operational-records`)
    .set("Authorization", authorization)
    .send(body);
}

function getRecords(authorization: string, permitId: string, query = "") {
  return request(app)
    .get(`/api/permits/${permitId}/operational-records${query}`)
    .set("Authorization", authorization);
}

function transition(
  authorization: string,
  permitId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .patch(`/api/permits/${permitId}/status`)
    .set("Authorization", authorization)
    .send(body);
}

async function submit(workspace: Workspace): Promise<void> {
  const response = await transition(workspace.creator.authorization, workspace.permitId, {
    status: "SUBMITTED",
  });
  expect(response.status).toBe(200);
}

async function approve(workspace: Workspace): Promise<void> {
  await submit(workspace);
  const response = await transition(workspace.manager.authorization, workspace.permitId, {
    status: "APPROVED",
  });
  expect(response.status).toBe(200);
}

async function activate(workspace: Workspace): Promise<void> {
  const response = await transition(
    workspace.responsible.authorization,
    workspace.permitId,
    { status: "ACTIVE" },
  );
  expect(response.status).toBe(200);
}

async function suspend(workspace: Workspace): Promise<void> {
  const response = await transition(workspace.manager.authorization, workspace.permitId, {
    status: "SUSPENDED",
    reason: "Test suspension",
  });
  expect(response.status).toBe(200);
}

async function closePermit(workspace: Workspace): Promise<void> {
  const response = await transition(workspace.manager.authorization, workspace.permitId, {
    status: "CLOSED",
    closureChecks: {
      workAreaSecured: true,
      personnelAccountedFor: true,
      equipmentIsolated: true,
      siteHandoverCompleted: true,
    },
    closureNotes: "Work complete and area handed over.",
  });
  expect(response.status).toBe(200);
}

async function createAttachment(options: {
  permitId: string;
  uploadedBy: Types.ObjectId;
  entityType?: string;
  entityId?: string;
  filename?: string;
  storageKey?: string;
}) {
  return Attachment.create({
    storageKey: options.storageKey ?? `oprec/${nextCode("file")}`,
    originalFilename: options.filename ?? "evidence.pdf",
    mimeType: "application/pdf",
    size: 128,
    checksum: "a".repeat(64),
    entityType: options.entityType ?? "permit",
    entityId: new Types.ObjectId(options.entityId ?? options.permitId),
    uploadedBy: options.uploadedBy,
  });
}

const MONITORING = {
  type: "MONITORING_CHECK",
  notes: "Routine control check recorded.",
};

const REVALIDATION = {
  type: "REVALIDATION",
  notes: "Conditions and controls rechecked.",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("permit operational records API", () => {
  it("returns an empty paginated list for an accessible permit", async () => {
    const { creator, permitId } = await createWorkspace();

    const response = await getRecords(creator.authorization, permitId);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      records: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });
  });

  it("enforces authentication and permit scope on reads", async () => {
    const { creator, manager, outsider, employee, permitId } =
      await createWorkspace();

    const anonymous = await request(app).get(
      `/api/permits/${permitId}/operational-records`,
    );
    expect(anonymous.status).toBe(401);

    const employeeResponse = await getRecords(
      employee.authorization,
      permitId,
    );
    expect(employeeResponse.status).toBe(403);

    const outOfScope = await getRecords(outsider.authorization, permitId);
    expect(outOfScope.status).toBe(404);

    const management = await getRecords(manager.authorization, permitId);
    expect(management.status).toBe(200);

    const accessible = await getRecords(creator.authorization, permitId);
    expect(accessible.status).toBe(200);

    const invalidId = await getRecords(creator.authorization, "not-an-id");
    expect(invalidId.status).toBe(400);
  });

  it("enforces authentication, canOperatePermits and permit scope on writes", async () => {
    const workspace = await createWorkspace();
    await approve(workspace);

    const {
      creator,
      responsible,
      manager,
      admin,
      outsider,
      supervisorElsewhere,
      employee,
      permitId,
    } = workspace;

    const anonymous = await request(app)
      .post(`/api/permits/${permitId}/operational-records`)
      .send(MONITORING);
    expect(anonymous.status).toBe(401);

    // EMPLOYEE fails the router role guard and lacks operatePermits.
    const employeeResponse = await postRecord(
      employee.authorization,
      permitId,
      MONITORING,
    );
    expect(employeeResponse.status).toBe(403);

    // Both HSE roles hold operatePermits but fail the independent scope check.
    const outsiderResponse = await postRecord(
      outsider.authorization,
      permitId,
      MONITORING,
    );
    expect(outsiderResponse.status).toBe(404);

    const elsewhereResponse = await postRecord(
      supervisorElsewhere.authorization,
      permitId,
      MONITORING,
    );
    expect(elsewhereResponse.status).toBe(404);

    const creatorResponse = await postRecord(
      creator.authorization,
      permitId,
      MONITORING,
    );
    expect(creatorResponse.status).toBe(201);

    const responsibleResponse = await postRecord(
      responsible.authorization,
      permitId,
      REVALIDATION,
    );
    expect(responsibleResponse.status).toBe(201);

    const managerResponse = await postRecord(
      manager.authorization,
      permitId,
      MONITORING,
    );
    expect(managerResponse.status).toBe(201);

    const adminResponse = await postRecord(
      admin.authorization,
      permitId,
      REVALIDATION,
    );
    expect(adminResponse.status).toBe(201);

    const permit = await Permit.findById(permitId);
    expect(permit?.operationalRecords).toHaveLength(4);
  });

  it("rejects forged attribution and any non-strict request body", async () => {
    const workspace = await createWorkspace();
    await approve(workspace);
    const { creator, permitId } = workspace;

    const invalidBodies: Array<Record<string, unknown>> = [
      { ...MONITORING, recordedBy: String(new Types.ObjectId()) },
      { ...MONITORING, recordedAt: "2000-01-01T00:00:00.000Z" },
      { ...MONITORING, status: "CLOSED" },
      { ...MONITORING, policyVersion: 99 },
      { ...MONITORING, approvedBy: String(new Types.ObjectId()) },
      { ...MONITORING, result: "PASSED" },
      { notes: "Missing type" },
      { type: "INSPECTION", notes: "Unknown type" },
      { type: "MONITORING_CHECK" },
      { type: "MONITORING_CHECK", notes: "" },
      { type: "MONITORING_CHECK", notes: "   " },
      { type: "MONITORING_CHECK", notes: "x".repeat(2001) },
      {
        type: "MONITORING_CHECK",
        notes: "Too many attachments",
        attachmentIds: Array.from({ length: 21 }, () =>
          String(new Types.ObjectId()),
        ),
      },
      {
        type: "MONITORING_CHECK",
        notes: "Bad attachment id",
        attachmentIds: ["not-an-object-id"],
      },
    ];

    for (const body of invalidBodies) {
      const response = await postRecord(
        creator.authorization,
        permitId,
        body,
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
    }

    const permit = await Permit.findById(permitId);
    expect(permit?.operationalRecords).toHaveLength(0);

    const trimmed = await postRecord(creator.authorization, permitId, {
      type: "MONITORING_CHECK",
      notes: "  Trimmed monitoring note  ",
    });
    expect(trimmed.status).toBe(201);
    expect(trimmed.body.record.notes).toBe("Trimmed monitoring note");
  });

  it("accepts both record types on APPROVED, ACTIVE and SUSPENDED permits", async () => {
    const workspace = await createWorkspace();
    await approve(workspace);

    const actorIds: Record<string, string> = {
      APPROVED: String(workspace.manager.user._id),
      ACTIVE: String(workspace.responsible.user._id),
      SUSPENDED: String(workspace.manager.user._id),
    };
    const authorizationByStatus: Record<string, string> = {
      APPROVED: workspace.manager.authorization,
      ACTIVE: workspace.responsible.authorization,
      SUSPENDED: workspace.manager.authorization,
    };

    for (const status of ["APPROVED", "ACTIVE", "SUSPENDED"] as const) {
      const before = await Permit.findById(workspace.permitId);
      const beforeTime = Date.now();

      for (const body of [MONITORING, REVALIDATION]) {
        const response = await postRecord(
          authorizationByStatus[status],
          workspace.permitId,
          body,
        );
        expect(response.status, `${status}/${body.type}`).toBe(201);
        expect(response.body.record).toMatchObject({
          type: body.type,
          notes: body.notes,
          recordedBy: { id: actorIds[status] },
        });
        expect(
          new Date(response.body.record.recordedAt).getTime(),
        ).toBeGreaterThanOrEqual(beforeTime);
        expect(response.body.record.recordedBy.firstName).toEqual(
          expect.any(String),
        );
        expect(response.body.record.recordedBy.lastName).toEqual(
          expect.any(String),
        );

        const after = await Permit.findById(workspace.permitId);
        expect(after?.status).toBe(status);
        expect(after?.policyVersion).toBe(before?.policyVersion);
        expect(after?.approvedAt?.getTime()).toBe(
          before?.approvedAt?.getTime(),
        );
        expect(after?.approvedBy?.toString()).toBe(
          before?.approvedBy?.toString(),
        );
      }

      if (status === "APPROVED") {
        await activate(workspace);
      } else if (status === "ACTIVE") {
        await suspend(workspace);
      }
    }

    const records = await getRecords(
      workspace.creator.authorization,
      workspace.permitId,
      "?limit=100",
    );
    expect(records.status).toBe(200);
    expect(records.body.records).toHaveLength(6);

    const types = records.body.records.map(
      (record: { type: string }) => record.type,
    );
    expect(types.filter((type: string) => type === "MONITORING_CHECK")).toHaveLength(3);
    expect(types.filter((type: string) => type === "REVALIDATION")).toHaveLength(3);

    const timestamps = records.body.records.map((record: { recordedAt: string }) =>
      new Date(record.recordedAt).getTime(),
    );
    const sorted = [...timestamps].sort((left, right) => right - left);
    expect(timestamps).toEqual(sorted);

    // Recording evidence never blocks the next valid lifecycle action.
    const resumed = await transition(
      workspace.responsible.authorization,
      workspace.permitId,
      { status: "ACTIVE" },
    );
    expect(resumed.status).toBe(200);
  });

  it("rejects records outside the three writable lifecycle statuses", async () => {
    const draft = await createWorkspace();
    const draftResponse = await postRecord(
      draft.creator.authorization,
      draft.permitId,
      MONITORING,
    );
    expect(draftResponse.status).toBe(409);

    const submitted = await createWorkspace();
    await submit(submitted);
    const submittedResponse = await postRecord(
      submitted.creator.authorization,
      submitted.permitId,
      MONITORING,
    );
    expect(submittedResponse.status).toBe(409);

    const rejected = await createWorkspace();
    await submit(rejected);
    const rejectedTransition = await transition(
      rejected.manager.authorization,
      rejected.permitId,
      { status: "REJECTED", reason: "Not safe to proceed" },
    );
    expect(rejectedTransition.status).toBe(200);
    const rejectedResponse = await postRecord(
      rejected.creator.authorization,
      rejected.permitId,
      REVALIDATION,
    );
    expect(rejectedResponse.status).toBe(409);

    const cancelled = await createWorkspace();
    const cancelledTransition = await transition(
      cancelled.creator.authorization,
      cancelled.permitId,
      { status: "CANCELLED", reason: "No longer required" },
    );
    expect(cancelledTransition.status).toBe(200);
    const cancelledResponse = await postRecord(
      cancelled.creator.authorization,
      cancelled.permitId,
      MONITORING,
    );
    expect(cancelledResponse.status).toBe(409);

    const closed = await createWorkspace();
    await approve(closed);
    await activate(closed);
    await closePermit(closed);
    const closedResponse = await postRecord(
      closed.manager.authorization,
      closed.permitId,
      MONITORING,
    );
    expect(closedResponse.status).toBe(409);

    for (const workspace of [
      draft,
      submitted,
      rejected,
      cancelled,
      closed,
    ]) {
      const permit = await Permit.findById(workspace.permitId);
      expect(permit?.operationalRecords).toHaveLength(0);
    }
  });

  it("validates attachment ownership before appending", async () => {
    const workspace = await createWorkspace();
    await approve(workspace);

    const valid = await createAttachment({
      permitId: workspace.permitId,
      uploadedBy: workspace.creator.user._id,
      filename: "secret-evidence.pdf",
      storageKey: "private/storage/oprec-valid",
    });
    const otherPermit = await createAttachment({
      permitId: String(new Types.ObjectId()),
      uploadedBy: workspace.creator.user._id,
    });
    const nonPermit = await createAttachment({
      permitId: workspace.permitId,
      uploadedBy: workspace.creator.user._id,
      entityType: "inspection",
    });

    const notFound = await postRecord(
      workspace.creator.authorization,
      workspace.permitId,
      {
        type: "MONITORING_CHECK",
        notes: "Unknown attachment",
        attachmentIds: [String(new Types.ObjectId())],
      },
    );
    expect(notFound.status).toBe(409);

    const crossPermit = await postRecord(
      workspace.creator.authorization,
      workspace.permitId,
      {
        type: "MONITORING_CHECK",
        notes: "Cross permit attachment",
        attachmentIds: [String(otherPermit._id)],
      },
    );
    expect(crossPermit.status).toBe(409);

    const wrongEntity = await postRecord(
      workspace.creator.authorization,
      workspace.permitId,
      {
        type: "MONITORING_CHECK",
        notes: "Non permit attachment",
        attachmentIds: [String(nonPermit._id)],
      },
    );
    expect(wrongEntity.status).toBe(409);

    const permitAfterFailures = await Permit.findById(workspace.permitId);
    expect(permitAfterFailures?.operationalRecords).toHaveLength(0);

    const accepted = await postRecord(
      workspace.creator.authorization,
      workspace.permitId,
      {
        type: "REVALIDATION",
        notes: "Attachment accepted",
        attachmentIds: [
          String(valid._id),
          String(valid._id),
        ],
      },
    );
    expect(accepted.status).toBe(201);
    expect(accepted.body.record.attachmentIds).toEqual([String(valid._id)]);

    const serialized = JSON.stringify(accepted.body.record);
    expect(serialized).not.toContain("secret-evidence.pdf");
    expect(serialized).not.toContain("private/storage/oprec-valid");
    expect(Object.keys(accepted.body.record).sort()).toEqual(
      [
        "attachmentIds",
        "id",
        "notes",
        "recordedAt",
        "recordedBy",
        "type",
      ].sort(),
    );
  });

  it("keeps records append-only across permit lifecycle actions", async () => {
    const workspace = await createWorkspace();
    await approve(workspace);

    const first = await postRecord(
      workspace.creator.authorization,
      workspace.permitId,
      MONITORING,
    );
    expect(first.status).toBe(201);
    const original = first.body.record;

    await activate(workspace);
    await suspend(workspace);

    const afterLifecycle = await Permit.findById(workspace.permitId);
    expect(afterLifecycle?.operationalRecords).toHaveLength(1);
    expect(
      String(afterLifecycle?.operationalRecords[0]?._id),
    ).toBe(original.id);
    expect(afterLifecycle?.operationalRecords[0]?.notes).toBe(
      original.notes,
    );

    const listed = await getRecords(
      workspace.creator.authorization,
      workspace.permitId,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.records).toHaveLength(1);
    expect(listed.body.records[0]).toMatchObject({
      id: original.id,
      type: original.type,
      notes: original.notes,
      recordedAt: original.recordedAt,
      recordedBy: original.recordedBy,
    });

    const second = await postRecord(
      workspace.manager.authorization,
      workspace.permitId,
      REVALIDATION,
    );
    expect(second.status).toBe(201);

    const paginated = await getRecords(
      workspace.creator.authorization,
      workspace.permitId,
      "?page=2&limit=1",
    );
    expect(paginated.status).toBe(200);
    expect(paginated.body.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(paginated.body.records[0].id).toBe(original.id);

    // There is no update or delete endpoint for append-only evidence.
    const patch = await request(app)
      .patch(`/api/permits/${workspace.permitId}/operational-records`)
      .set("Authorization", workspace.manager.authorization)
      .send({ notes: "tampered" });
    expect(patch.status).toBe(404);

    const remove = await request(app)
      .delete(`/api/permits/${workspace.permitId}/operational-records`)
      .set("Authorization", workspace.manager.authorization);
    expect(remove.status).toBe(404);

    const stillThere = await Permit.findById(workspace.permitId);
    expect(stillThere?.operationalRecords).toHaveLength(2);
    expect(stillThere?.operationalRecords[0]?.notes).toBe(original.notes);
  });

  it("audits appends with privacy-safe, manager-discoverable snapshots", async () => {
    const workspace = await createWorkspace();
    await approve(workspace);

    const attachment = await createAttachment({
      permitId: workspace.permitId,
      uploadedBy: workspace.creator.user._id,
      filename: "confidential-evidence.pdf",
      storageKey: "private/storage/confidential-key",
    });

    const monitoringNotes = "Confidential monitoring observation text";
    const revalidationNotes = "Confidential revalidation observation text";

    const monitoring = await postRecord(
      workspace.creator.authorization,
      workspace.permitId,
      {
        type: "MONITORING_CHECK",
        notes: monitoringNotes,
        attachmentIds: [String(attachment._id)],
      },
    );
    expect(monitoring.status).toBe(201);

    const revalidation = await postRecord(
      workspace.manager.authorization,
      workspace.permitId,
      {
        type: "REVALIDATION",
        notes: revalidationNotes,
      },
    );
    expect(revalidation.status).toBe(201);

    const audits = await AuditLog.find({
      entityType: "Permit",
      entityId: workspace.permitId,
    }).lean();
    const monitoringAudit = audits.find(
      (audit) => audit.action === "permit.monitoring_check_recorded",
    );
    const revalidationAudit = audits.find(
      (audit) => audit.action === "permit.revalidation_recorded",
    );

    expect(monitoringAudit?.actor.toString()).toBe(
      String(workspace.creator.user._id),
    );
    expect(revalidationAudit?.actor.toString()).toBe(
      String(workspace.manager.user._id),
    );

    expect(monitoringAudit?.after).toMatchObject({
      recordId: monitoring.body.record.id,
      permitId: workspace.permitId,
      projectId: workspace.projectId,
      siteId: workspace.siteId,
      type: "MONITORING_CHECK",
      attachmentCount: 1,
    });
    expect(revalidationAudit?.after).toMatchObject({
      recordId: revalidation.body.record.id,
      permitId: workspace.permitId,
      projectId: workspace.projectId,
      siteId: workspace.siteId,
      type: "REVALIDATION",
      attachmentCount: 0,
    });

    for (const audit of [monitoringAudit, revalidationAudit]) {
      const snapshot = JSON.stringify({
        before: audit?.before ?? null,
        after: audit?.after ?? null,
      });
      expect(snapshot).not.toContain(monitoringNotes);
      expect(snapshot).not.toContain(revalidationNotes);
      expect(snapshot).not.toContain("confidential-evidence.pdf");
      expect(snapshot).not.toContain("private/storage/confidential-key");
      expect(snapshot).not.toContain("application/pdf");
      expect(snapshot).not.toContain("checksum");
      expect(snapshot).not.toContain("storageKey");
      expect(snapshot).not.toContain("originalFilename");
    }

    const managerQuery = await request(app)
      .get("/api/hse/audit-log")
      .query({
        entityType: "Permit",
        entityId: workspace.permitId,
      })
      .set("Authorization", workspace.manager.authorization);
    expect(managerQuery.status).toBe(200);
    const actions = managerQuery.body.data.auditLog.map(
      (entry: { action: string }) => entry.action,
    );
    expect(actions).toContain("permit.monitoring_check_recorded");
    expect(actions).toContain("permit.revalidation_recorded");

    const nonManagerQuery = await request(app)
      .get("/api/hse/audit-log")
      .query({ entityType: "Permit", entityId: workspace.permitId })
      .set("Authorization", workspace.creator.authorization);
    expect(nonManagerQuery.status).toBe(403);
  });

  it("rolls back the appended record when the audit insert fails", async () => {
    const workspace = await createWorkspace();
    await approve(workspace);

    vi.spyOn(AuditLog, "create").mockRejectedValue(
      new Error("audit store unavailable"),
    );

    const response = await postRecord(
      workspace.creator.authorization,
      workspace.permitId,
      MONITORING,
    );

    expect(response.status).toBe(500);

    const permit = await Permit.findById(workspace.permitId);
    expect(permit?.operationalRecords).toHaveLength(0);
    expect(
      await AuditLog.countDocuments({
        action: "permit.monitoring_check_recorded",
        entityId: workspace.permitId,
      }),
    ).toBe(0);
  });
});
