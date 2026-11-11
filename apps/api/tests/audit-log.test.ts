import request from "supertest";
import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Project } from "../src/models/Project.js";
import { User } from "../src/models/User.js";
import { signInAsIkoshUser } from "./helpers.js";

describe("audit logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes an audit record for a successful domain mutation", async () => {
    const { user, authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const response = await request(app)
      .post("/api/projects")
      .set("Authorization", authorization)
      .send({ name: "Audited Project", code: "AUDIT1", client: "Client A" });

    expect(response.status).toBe(201);

    const logs = await AuditLog.find({ action: "project.created" }).lean();
    expect(logs).toHaveLength(1);

    const [log] = logs;
    expect(String(log.actor)).toBe(String(user._id));
    expect(log.entityType).toBe("Project");
    expect(String(log.entityId)).toBe(response.body.project.id);
    expect(log.after).toMatchObject({
      name: "Audited Project",
      code: "AUDIT1",
      client: "Client A",
      status: "ACTIVE",
    });
    expect(log.createdAt).toBeInstanceOf(Date);
  });

  it("rolls back the domain mutation when the audit write fails", async () => {
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    vi.spyOn(AuditLog, "create").mockRejectedValue(
      new Error("audit store unavailable"),
    );

    const response = await request(app)
      .post("/api/projects")
      .set("Authorization", authorization)
      .send({ name: "Rolled Back Project", code: "ROLLBACK" });

    expect(response.status).toBe(500);
    expect(await Project.countDocuments({ code: "ROLLBACK" })).toBe(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it("restricts audit records to HSE_MANAGER and ADMIN", async () => {
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const supervisor = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });
    const officer = await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    for (const denied of [employee, supervisor, officer]) {
      const response = await request(app)
        .get("/api/hse/audit-log")
        .set("Authorization", denied.authorization);

      expect(response.status).toBe(403);
    }

    for (const allowed of [manager, admin]) {
      const response = await request(app)
        .get("/api/hse/audit-log")
        .set("Authorization", allowed.authorization);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data.auditLog)).toBe(true);
    }
  });

  it("requires authentication for audit records", async () => {
    const response = await request(app).get("/api/hse/audit-log");

    expect(response.status).toBe(401);
  });

  it("excludes sensitive personal data from audit snapshots", async () => {
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
    const target = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      phone: "555-0100",
      location: "HQ",
    });

    const response = await request(app)
      .patch(`/api/employees/${target.user._id}`)
      .set("Authorization", admin.authorization)
      .send({ phone: "555-9999", location: "Remote" });

    expect(response.status).toBe(200);

    const log = await AuditLog.findOne({ action: "employee.updated" }).lean();
    expect(log).not.toBeNull();

    const serialized = JSON.stringify({ before: log?.before, after: log?.after });

    expect(serialized).not.toContain("555-0100");
    expect(serialized).not.toContain("555-9999");
    expect(serialized).not.toContain("HQ");
    expect(serialized).not.toContain("Remote");
    expect(serialized).not.toContain(target.user.email);
    expect(serialized).not.toContain("Test");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("token");

    expect(log?.after).toMatchObject({ ikoshRole: "EMPLOYEE" });
    expect(log?.after).not.toHaveProperty("phone");
    expect(log?.after).not.toHaveProperty("location");
    expect(log?.after).not.toHaveProperty("email");
    expect(log?.after).not.toHaveProperty("firstName");
    expect(log?.after).not.toHaveProperty("lastName");
  });

  it("derives the actor from req.ikoshUser rather than the request body", async () => {
    const { user, authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });
    const otherUser = new Types.ObjectId();

    const response = await request(app)
      .post("/api/projects")
      .set("Authorization", authorization)
      .send({
        name: "Spoofed Actor Project",
        code: "SPOOF",
        actor: String(otherUser),
        actorId: String(otherUser),
      });

    expect(response.status).toBe(201);

    const log = await AuditLog.findOne({ action: "project.created" }).lean();
    expect(String(log?.actor)).toBe(String(user._id));
    expect(String(log?.actor)).not.toBe(String(otherUser));
    expect(await User.countDocuments({ _id: otherUser })).toBe(0);
  });
});
