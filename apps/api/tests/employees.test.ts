import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { User } from "../src/models/User.js";
import {
  createDepartment,
  createIkoshUser,
  makeDigitAuthUser,
  signInAs,
  signInAsIkoshUser,
} from "./helpers.js";

describe("GET /api/employees (directory)", () => {
  it("requires authentication and fails closed without an IKOSH record", async () => {
    const unauthorized = await request(app).get("/api/employees");

    expect(unauthorized.status).toBe(401);

    const noRecord = await request(app)
      .get("/api/employees")
      .set("Authorization", signInAs(makeDigitAuthUser("da_user_missing")));

    expect(noRecord.status).toBe(403);
  });

  it("returns paginated basic profiles and hides inactive employees", async () => {
    const operations = await createDepartment({
      name: "Operations",
      code: "OPS",
    });

    // The viewer is also an employee and appears in their own directory.
    const viewer = await signInAsIkoshUser({ lastName: "Zviewer" });

    await createIkoshUser({
      firstName: "Alice",
      lastName: "Anderson",
      email: "alice@ikosh.test",
      employeeId: "IK-0001",
      jobTitle: "Operator",
      department: operations._id,
    });
    await createIkoshUser({
      firstName: "Bob",
      lastName: "Brown",
      email: "bob@ikosh.test",
      employeeId: "IK-0002",
      jobTitle: "Technician",
      department: operations._id,
    });
    await createIkoshUser({
      firstName: "Carol",
      lastName: "Clark",
      email: "carol@ikosh.test",
      isActive: false,
    });

    const response = await request(app)
      .get("/api/employees")
      .set("Authorization", viewer.authorization);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.employees).toHaveLength(3);
    expect(response.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });

    // Basic profiles only: no sensitive or administrative fields.
    for (const employee of response.body.employees) {
      expect(Object.keys(employee).sort()).toEqual([
        "department",
        "email",
        "firstName",
        "id",
        "jobTitle",
        "lastName",
        "location",
        "phone",
      ]);
    }

    // Sorted by last name by default; inactive employees are hidden.
    expect(
      response.body.employees.map(
        (e: { lastName: string }) => e.lastName,
      ),
    ).toEqual(["Anderson", "Brown", "Zviewer"]);
  });

  it("paginates and limits results", async () => {
    for (let index = 0; index < 5; index += 1) {
      await createIkoshUser({ lastName: `Page ${index}` });
    }

    const { authorization } = await signInAsIkoshUser({ lastName: "Zviewer" });

    const firstPage = await request(app)
      .get("/api/employees?limit=2&page=1")
      .set("Authorization", authorization);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.employees).toHaveLength(2);
    expect(firstPage.body.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 6,
      totalPages: 3,
    });

    const thirdPage = await request(app)
      .get("/api/employees?limit=2&page=3")
      .set("Authorization", authorization);

    expect(thirdPage.status).toBe(200);
    expect(thirdPage.body.employees).toHaveLength(2);

    const invalidLimit = await request(app)
      .get("/api/employees?limit=500")
      .set("Authorization", authorization);

    expect(invalidLimit.status).toBe(400);
  });

  it("searches across names, emails and employee IDs", async () => {
    await createIkoshUser({
      firstName: "Dana",
      lastName: "Edwards",
      email: "dana.edwards@ikosh.test",
      employeeId: "IK-7777",
    });
    await createIkoshUser({
      firstName: "Edward",
      lastName: "Fox",
      email: "fox@ikosh.test",
    });

    const { authorization } = await signInAsIkoshUser();

    const byName = await request(app)
      .get("/api/employees?q=edwards")
      .set("Authorization", authorization);

    expect(byName.body.employees).toHaveLength(1);
    expect(byName.body.employees[0].lastName).toBe("Edwards");

    const byEmployeeId = await request(app)
      .get("/api/employees?q=IK-7777")
      .set("Authorization", authorization);

    expect(byEmployeeId.body.employees).toHaveLength(1);
    expect(byEmployeeId.body.employees[0].lastName).toBe("Edwards");

    const byEmail = await request(app)
      .get("/api/employees?q=fox@ikosh")
      .set("Authorization", authorization);

    expect(byEmail.body.employees).toHaveLength(1);
    expect(byEmail.body.employees[0].lastName).toBe("Fox");
  });

  it("filters by department, role and employment type", async () => {
    const operations = await createDepartment({
      name: "Operations",
      code: "OPS",
    });
    const safety = await createDepartment({ name: "Safety", code: "SAF" });

    await createIkoshUser({ department: operations._id, lastName: "Ops User" });
    await createIkoshUser({
      department: safety._id,
      lastName: "Safety User",
      ikoshRole: "HSE_OFFICER",
    });
    await createIkoshUser({
      lastName: "Intern User",
      employmentType: "INTERN",
    });

    const { authorization } = await signInAsIkoshUser();

    const byDepartment = await request(app)
      .get(`/api/employees?department=${String(operations._id)}`)
      .set("Authorization", authorization);

    expect(byDepartment.body.employees).toHaveLength(1);
    expect(byDepartment.body.employees[0].lastName).toBe("Ops User");

    const byRole = await request(app)
      .get("/api/employees?ikoshRole=HSE_OFFICER")
      .set("Authorization", authorization);

    expect(byRole.body.employees).toHaveLength(1);
    expect(byRole.body.employees[0].lastName).toBe("Safety User");

    const byEmploymentType = await request(app)
      .get("/api/employees?employmentType=INTERN")
      .set("Authorization", authorization);

    expect(byEmploymentType.body.employees).toHaveLength(1);
    expect(byEmploymentType.body.employees[0].lastName).toBe("Intern User");
  });

  it("lets only management roles list inactive employees", async () => {
    await createIkoshUser({ lastName: "Hidden", isActive: false });

    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const employeeResponse = await request(app)
      .get("/api/employees?isActive=false")
      .set("Authorization", employee.authorization);

    expect(
      employeeResponse.body.employees.map(
        (e: { lastName: string }) => e.lastName,
      ),
    ).not.toContain("Hidden");

    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const adminResponse = await request(app)
      .get("/api/employees?isActive=false")
      .set("Authorization", admin.authorization);

    expect(adminResponse.body.employees).toHaveLength(1);
    expect(adminResponse.body.employees[0].lastName).toBe("Hidden");
  });
});

describe("GET /api/employees/me", () => {
  it("returns the full own profile", async () => {
    const department = await createDepartment({
      name: "Operations",
      code: "OPS",
    });
    const manager = await createIkoshUser({
      firstName: "Manny",
      lastName: "Manager",
      jobTitle: "Site Manager",
    });

    const { user, authorization } = await signInAsIkoshUser({
      firstName: "Ola",
      lastName: "Owning",
      employeeId: "IK-0100",
      jobTitle: "Field Officer",
      department: department._id,
      managerId: manager._id,
      employmentType: "FULL_TIME",
      hireDate: new Date("2024-03-15T00:00:00.000Z"),
      phone: "+2348000000000",
      location: "Lagos",
    });

    const response = await request(app)
      .get("/api/employees/me")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.employee).toMatchObject({
      id: String(user._id),
      firstName: "Ola",
      lastName: "Owning",
      employeeId: "IK-0100",
      jobTitle: "Field Officer",
      employmentType: "FULL_TIME",
      hireDate: "2024-03-15T00:00:00.000Z",
      phone: "+2348000000000",
      location: "Lagos",
      ikoshRole: "EMPLOYEE",
      isActive: true,
      department: { id: String(department._id), name: "Operations" },
      manager: {
        id: String(manager._id),
        firstName: "Manny",
        lastName: "Manager",
        jobTitle: "Site Manager",
      },
    });
  });
});

describe("PATCH /api/employees/me", () => {
  it("updates own contact details only", async () => {
    const { authorization } = await signInAsIkoshUser();

    const response = await request(app)
      .patch("/api/employees/me")
      .set("Authorization", authorization)
      .send({ phone: "+2348011111111", location: "Abuja" });

    expect(response.status).toBe(200);
    expect(response.body.employee.phone).toBe("+2348011111111");
    expect(response.body.employee.location).toBe("Abuja");
  });

  it("strips employment, role and status fields", async () => {
    const { user, authorization } = await signInAsIkoshUser();

    const response = await request(app)
      .patch("/api/employees/me")
      .set("Authorization", authorization)
      .send({
        phone: "+2348022222222",
        ikoshRole: "ADMIN",
        isActive: false,
        employeeId: "IK-9999",
        jobTitle: "Chief Hacker",
      });

    expect(response.status).toBe(200);

    const refreshed = await User.findById(user._id);

    expect(refreshed?.phone).toBe("+2348022222222");
    expect(refreshed?.ikoshRole).toBe("EMPLOYEE");
    expect(refreshed?.isActive).toBe(true);
    expect(refreshed?.employeeId).toBeNull();
    expect(refreshed?.jobTitle).toBeNull();
  });

  it("rejects empty payloads (400)", async () => {
    const { authorization } = await signInAsIkoshUser();

    const response = await request(app)
      .patch("/api/employees/me")
      .set("Authorization", authorization)
      .send({});

    expect(response.status).toBe(400);
  });
});

describe("GET /api/employees/:id", () => {
  it("returns basic profiles to ordinary employees", async () => {
    const department = await createDepartment({
      name: "Operations",
      code: "OPS",
    });
    const target = await createIkoshUser({
      firstName: "Tina",
      lastName: "Target",
      employeeId: "IK-0200",
      hireDate: new Date("2023-01-01T00:00:00.000Z"),
      employmentType: "CONTRACT",
      department: department._id,
      ikoshRole: "SUPERVISOR",
    });

    const viewer = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const response = await request(app)
      .get(`/api/employees/${String(target._id)}`)
      .set("Authorization", viewer.authorization);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.employee).sort()).toEqual([
      "department",
      "email",
      "firstName",
      "id",
      "jobTitle",
      "lastName",
      "location",
      "phone",
    ]);
    expect(response.body.employee.lastName).toBe("Target");
  });

  it("returns full profiles to management roles and to the employee themselves", async () => {
    const target = await createIkoshUser({
      lastName: "Target",
      employeeId: "IK-0201",
      employmentType: "FULL_TIME",
      ikoshRole: "SUPERVISOR",
    });

    const self = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    // Viewer is EMPLOYEE but is the target itself.
    const selfResponse = await request(app)
      .get(`/api/employees/${String(self.user._id)}`)
      .set("Authorization", self.authorization);
    expect(selfResponse.body.employee.ikoshRole).toBe("EMPLOYEE");
    expect(selfResponse.body.employee).toHaveProperty("hireDate");

    for (const role of ["SUPERVISOR", "HSE_OFFICER", "ADMIN"]) {
      const viewer = await signInAsIkoshUser({ ikoshRole: role });

      const response = await request(app)
        .get(`/api/employees/${String(target._id)}`)
        .set("Authorization", viewer.authorization);

      expect(response.status).toBe(200);
      expect(response.body.employee).toHaveProperty("employeeId");
      expect(response.body.employee).toHaveProperty("hireDate");
      expect(response.body.employee).toHaveProperty("ikoshRole");
      expect(response.body.employee).toHaveProperty("isActive");
    }
  });

  it("hides inactive employees from ordinary employees (404)", async () => {
    const target = await createIkoshUser({ isActive: false });

    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const employeeResponse = await request(app)
      .get(`/api/employees/${String(target._id)}`)
      .set("Authorization", employee.authorization);

    expect(employeeResponse.status).toBe(404);

    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const adminResponse = await request(app)
      .get(`/api/employees/${String(target._id)}`)
      .set("Authorization", admin.authorization);

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.employee.isActive).toBe(false);
  });

  it("validates employee ids (400) and unknown employees (404)", async () => {
    const { authorization } = await signInAsIkoshUser();

    const invalid = await request(app)
      .get("/api/employees/not-an-object-id")
      .set("Authorization", authorization);

    expect(invalid.status).toBe(400);

    const notFound = await request(app)
      .get("/api/employees/0123456789ab0123456789ab")
      .set("Authorization", authorization);

    expect(notFound.status).toBe(404);
  });
});

describe("PATCH /api/employees/:id (employment information)", () => {
  it("is restricted to administrators", async () => {
    const target = await createIkoshUser();

    for (const role of ["EMPLOYEE", "SUPERVISOR", "HSE_OFFICER"]) {
      const viewer = await signInAsIkoshUser({ ikoshRole: role });

      const response = await request(app)
        .patch(`/api/employees/${String(target._id)}`)
        .set("Authorization", viewer.authorization)
        .send({ jobTitle: "Sneaky" });

      expect(response.status).toBe(403);
    }

    const refreshed = await User.findById(target._id);
    expect(refreshed?.jobTitle).toBeNull();
  });

  it("updates employment information", async () => {
    const department = await createDepartment({
      name: "Operations",
      code: "OPS",
    });
    const manager = await createIkoshUser({ firstName: "Manny", lastName: "Manager" });
    const target = await createIkoshUser();

    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .patch(`/api/employees/${String(target._id)}`)
      .set("Authorization", admin.authorization)
      .send({
        employeeId: "IK-0300",
        jobTitle: "Field Officer",
        department: String(department._id),
        employmentType: "FULL_TIME",
        hireDate: "2024-06-01",
        managerId: String(manager._id),
        phone: "+2348033333333",
        location: "Port Harcourt",
      });

    expect(response.status).toBe(200);
    expect(response.body.employee).toMatchObject({
      employeeId: "IK-0300",
      jobTitle: "Field Officer",
      employmentType: "FULL_TIME",
      hireDate: "2024-06-01T00:00:00.000Z",
      phone: "+2348033333333",
      location: "Port Harcourt",
      department: { id: String(department._id), name: "Operations" },
      manager: { id: String(manager._id) },
    });
  });

  it("rejects duplicate employee IDs (409)", async () => {
    await createIkoshUser({ employeeId: "IK-0400" });
    const target = await createIkoshUser();

    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .patch(`/api/employees/${String(target._id)}`)
      .set("Authorization", admin.authorization)
      .send({ employeeId: "IK-0400" });

    expect(response.status).toBe(409);
  });

  it("rejects unknown departments and managers (400)", async () => {
    const target = await createIkoshUser();
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const badDepartment = await request(app)
      .patch(`/api/employees/${String(target._id)}`)
      .set("Authorization", admin.authorization)
      .send({ department: "0123456789ab0123456789ab" });

    expect(badDepartment.status).toBe(400);

    const badManager = await request(app)
      .patch(`/api/employees/${String(target._id)}`)
      .set("Authorization", admin.authorization)
      .send({ managerId: "0123456789ab0123456789ab" });

    expect(badManager.status).toBe(400);
  });

  it("rejects making an employee their own manager (400)", async () => {
    const target = await createIkoshUser();
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .patch(`/api/employees/${String(target._id)}`)
      .set("Authorization", admin.authorization)
      .send({ managerId: String(target._id) });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/own manager/i);
  });
});

describe("PATCH /api/employees/:id/role", () => {
  it("changes IKOSH roles for administrators only", async () => {
    const target = await createIkoshUser();

    const supervisor = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });

    const forbidden = await request(app)
      .patch(`/api/employees/${String(target._id)}/role`)
      .set("Authorization", supervisor.authorization)
      .send({ ikoshRole: "HSE_OFFICER" });

    expect(forbidden.status).toBe(403);

    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .patch(`/api/employees/${String(target._id)}/role`)
      .set("Authorization", admin.authorization)
      .send({ ikoshRole: "HSE_OFFICER" });

    expect(response.status).toBe(200);
    expect(response.body.employee.ikoshRole).toBe("HSE_OFFICER");

    const refreshed = await User.findById(target._id);
    expect(refreshed?.ikoshRole).toBe("HSE_OFFICER");
  });

  it("prevents administrators from changing their own role", async () => {
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .patch(`/api/employees/${String(admin.user._id)}/role`)
      .set("Authorization", admin.authorization)
      .send({ ikoshRole: "EMPLOYEE" });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/own IKOSH role/i);
  });

  it("validates the payload (400)", async () => {
    const target = await createIkoshUser();
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .patch(`/api/employees/${String(target._id)}/role`)
      .set("Authorization", admin.authorization)
      .send({ ikoshRole: "SUPER_HERO" });

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/employees/:id/status", () => {
  it("deactivates employees without touching their IKOSH role", async () => {
    const target = await createIkoshUser({
      ikoshRole: "SUPERVISOR",
      employeeId: "IK-0500",
    });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .patch(`/api/employees/${String(target._id)}/status`)
      .set("Authorization", admin.authorization)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.employee.isActive).toBe(false);
    expect(response.body.employee.ikoshRole).toBe("SUPERVISOR");

    const refreshed = await User.findById(target._id);
    expect(refreshed?.isActive).toBe(false);
  });

  it("deactivated employees lose application access entirely", async () => {
    const { user, authorization } = await signInAsIkoshUser();

    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const deactivate = await request(app)
      .patch(`/api/employees/${String(user._id)}/status`)
      .set("Authorization", admin.authorization)
      .send({ isActive: false });

    expect(deactivate.status).toBe(200);

    // The same DigitAuth identity still authenticates, but every
    // application endpoint now rejects it.
    const directory = await request(app)
      .get("/api/employees")
      .set("Authorization", authorization);

    expect(directory.status).toBe(403);
    expect(directory.body.message).toMatch(/inactive/i);
  });

  it("prevents administrators from deactivating themselves", async () => {
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .patch(`/api/employees/${String(admin.user._id)}/status`)
      .set("Authorization", admin.authorization)
      .send({ isActive: false });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/own/i);
  });

  it("restricts status changes to administrators", async () => {
    const target = await createIkoshUser();
    const viewer = await signInAsIkoshUser({ ikoshRole: "HSE_OFFICER" });

    const response = await request(app)
      .patch(`/api/employees/${String(target._id)}/status`)
      .set("Authorization", viewer.authorization)
      .send({ isActive: false });

    expect(response.status).toBe(403);
  });
});
