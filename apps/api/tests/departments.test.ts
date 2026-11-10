import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { Department } from "../src/models/Department.js";
import {
  createDepartment,
  createIkoshUser,
  makeDigitAuthUser,
  signInAs,
  signInAsIkoshUser,
} from "./helpers.js";

describe("GET /api/departments", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/departments");

    expect(response.status).toBe(401);
  });

  it("fails closed for DigitAuth identities without an IKOSH record", async () => {
    const response = await request(app)
      .get("/api/departments")
      .set("Authorization", signInAs(makeDigitAuthUser("da_user_nowhere")));

    expect(response.status).toBe(403);
  });

  it("lists active departments with member counts for any employee", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const operations = await createDepartment({
      name: "Operations",
      code: "OPS",
    });
    await createDepartment({
      name: "Archived Unit",
      code: "OLD",
      isActive: false,
    });

    await createIkoshUser({ department: operations._id });
    await createIkoshUser({ department: operations._id });

    const response = await request(app)
      .get("/api/departments")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.departments).toHaveLength(1);

    const department = response.body.departments[0];
    expect(department.name).toBe("Operations");
    expect(department.code).toBe("OPS");
    expect(department.memberCount).toBe(2);
    expect(department.isActive).toBe(true);
    expect(department.head).toBeNull();
    expect(department.id).toEqual(String(operations._id));
  });

  it("includes inactive departments only for administrators", async () => {
    await createDepartment({
      name: "Archived Unit",
      code: "OLD",
      isActive: false,
    });

    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const employeeResponse = await request(app)
      .get("/api/departments?includeInactive=true")
      .set("Authorization", employee.authorization);

    expect(employeeResponse.status).toBe(200);
    expect(employeeResponse.body.departments).toHaveLength(0);

    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
    const adminResponse = await request(app)
      .get("/api/departments?includeInactive=true")
      .set("Authorization", admin.authorization);

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.departments).toHaveLength(1);
    expect(adminResponse.body.departments[0].isActive).toBe(false);
  });
});

describe("POST /api/departments", () => {
  it("is restricted to administrators", async () => {
    for (const role of ["EMPLOYEE", "SUPERVISOR", "HSE_OFFICER"]) {
      const { authorization } = await signInAsIkoshUser({ ikoshRole: role });

      const response = await request(app)
        .post("/api/departments")
        .set("Authorization", authorization)
        .send({ name: "Safety", code: "SAF" });

      expect(response.status).toBe(403);
    }

    const stored = await Department.findOne({ name: "Safety" });
    expect(stored).toBeNull();
  });

  it("creates a department with a head", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
    const head = await createIkoshUser({
      firstName: "Grace",
      lastName: "Hopper",
    });

    const response = await request(app)
      .post("/api/departments")
      .set("Authorization", authorization)
      .send({
        name: "Health and Safety",
        code: "hse",
        description: "Safety operations",
        headId: String(head._id),
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.department).toMatchObject({
      name: "Health and Safety",
      code: "HSE",
      description: "Safety operations",
      memberCount: 0,
      isActive: true,
    });
    expect(response.body.department.head).toEqual({
      id: String(head._id),
      firstName: "Grace",
      lastName: "Hopper",
    });
  });

  it("rejects duplicate names and codes (409)", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    await createDepartment({ name: "Operations", code: "OPS" });

    const duplicateName = await request(app)
      .post("/api/departments")
      .set("Authorization", authorization)
      .send({ name: "Operations", code: "OTHER" });

    expect(duplicateName.status).toBe(409);

    const duplicateCode = await request(app)
      .post("/api/departments")
      .set("Authorization", authorization)
      .send({ name: "Different Name", code: "OPS" });

    expect(duplicateCode.status).toBe(409);
  });

  it("rejects invalid payloads (400)", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const missingName = await request(app)
      .post("/api/departments")
      .set("Authorization", authorization)
      .send({ code: "OPS" });

    expect(missingName.status).toBe(400);

    const badCode = await request(app)
      .post("/api/departments")
      .set("Authorization", authorization)
      .send({ name: "Operations", code: "way too long for a code" });

    expect(badCode.status).toBe(400);
  });

  it("rejects unknown department heads (400)", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .post("/api/departments")
      .set("Authorization", authorization)
      .send({
        name: "Operations",
        code: "OPS",
        headId: "0123456789ab0123456789ab",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/head/i);
  });
});

describe("PATCH /api/departments/:id", () => {
  it("updates department fields (administrator only)", async () => {
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const department = await createDepartment({
      name: "Operations",
      code: "OPS",
    });

    const forbidden = await request(app)
      .patch(`/api/departments/${String(department._id)}`)
      .set("Authorization", employee.authorization)
      .send({ name: "New Name" });

    expect(forbidden.status).toBe(403);

    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
    const head = await createIkoshUser({
      firstName: "Ada",
      lastName: "Lovelace",
    });

    const response = await request(app)
      .patch(`/api/departments/${String(department._id)}`)
      .set("Authorization", admin.authorization)
      .send({ name: "Field Operations", headId: String(head._id) });

    expect(response.status).toBe(200);
    expect(response.body.department.name).toBe("Field Operations");
    expect(response.body.department.head).toEqual({
      id: String(head._id),
      firstName: "Ada",
      lastName: "Lovelace",
    });

    // Clearing the head again.
    const cleared = await request(app)
      .patch(`/api/departments/${String(department._id)}`)
      .set("Authorization", admin.authorization)
      .send({ headId: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.department.head).toBeNull();
  });

  it("rejects unknown ids (404) and invalid ids (400)", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const notFound = await request(app)
      .patch("/api/departments/0123456789ab0123456789ab")
      .set("Authorization", authorization)
      .send({ name: "New Name" });

    expect(notFound.status).toBe(404);

    const invalid = await request(app)
      .patch("/api/departments/not-an-object-id")
      .set("Authorization", authorization)
      .send({ name: "New Name" });

    expect(invalid.status).toBe(400);
  });

  it("rejects empty update payloads (400)", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
    const department = await createDepartment({ name: "Ops", code: "OPS" });

    const response = await request(app)
      .patch(`/api/departments/${String(department._id)}`)
      .set("Authorization", authorization)
      .send({});

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/departments/:id", () => {
  it("refuses to delete departments with assigned employees (409)", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
    const department = await createDepartment({
      name: "Operations",
      code: "OPS",
    });
    await createIkoshUser({ department: department._id });

    const response = await request(app)
      .delete(`/api/departments/${String(department._id)}`)
      .set("Authorization", authorization);

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/reassign/i);

    const stillThere = await Department.findById(department._id);
    expect(stillThere).not.toBeNull();
  });

  it("deletes empty departments (200)", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
    const department = await createDepartment({
      name: "Operations",
      code: "OPS",
    });

    const response = await request(app)
      .delete(`/api/departments/${String(department._id)}`)
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Department deleted.",
    });

    const gone = await Department.findById(department._id);
    expect(gone).toBeNull();
  });

  it("is restricted to administrators and validates ids", async () => {
    const employee = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });
    const department = await createDepartment({ name: "Ops", code: "OPS" });

    const forbidden = await request(app)
      .delete(`/api/departments/${String(department._id)}`)
      .set("Authorization", employee.authorization);

    expect(forbidden.status).toBe(403);

    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const invalid = await request(app)
      .delete("/api/departments/not-an-object-id")
      .set("Authorization", admin.authorization);

    expect(invalid.status).toBe(400);

    const notFound = await request(app)
      .delete("/api/departments/0123456789ab0123456789ab")
      .set("Authorization", admin.authorization);

    expect(notFound.status).toBe(404);
  });
});
