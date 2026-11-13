import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { Attachment } from "../src/models/Attachment.js";
import { Contractor } from "../src/models/Contractor.js";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { ContractorPersonnelSiteAssignment } from "../src/models/ContractorPersonnelSiteAssignment.js";
import { Incident } from "../src/models/Incident.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

let sequence = 0;

async function createProject() {
  sequence += 1;
  return Project.create({
    name: `Dashboard Project ${sequence}`,
    code: `DBP${sequence}`,
  });
}

async function createSite(projectId: unknown) {
  sequence += 1;
  return Site.create({
    project: projectId,
    name: `Dashboard Site ${sequence}`,
    code: `DBS${sequence}`,
  });
}

async function createContractor(projectId: unknown) {
  sequence += 1;
  return Contractor.create({
    name: `Dashboard Contractor ${sequence}`,
    projects: [projectId],
  });
}

async function createPersonnel(
  contractorId: unknown,
  siteId: unknown,
  firstName: string,
  lastName: string,
) {
  sequence += 1;
  return ContractorPersonnel.create({
    contractor: contractorId,
    firstName,
    lastName,
    personnelId: `DBPERSON-${sequence}`,
    site: siteId,
  });
}

async function createUnassignedPersonnel(
  contractorId: unknown,
  options: { isActive?: boolean } = {},
) {
  sequence += 1;
  return ContractorPersonnel.create({
    contractor: contractorId,
    firstName: "Unassigned",
    lastName: `Person ${sequence}`,
    personnelId: `DBPERSON-${sequence}`,
    isActive: options.isActive ?? true,
  });
}

async function createAssignment(
  personnelId: unknown,
  contractorId: unknown,
  siteId: unknown,
  options: { isActive?: boolean } = {},
) {
  return ContractorPersonnelSiteAssignment.create({
    personnel: personnelId,
    contractor: contractorId,
    site: siteId,
    isActive: options.isActive ?? true,
    ...(options.isActive === false ? { endedAt: new Date() } : {}),
  });
}

async function createIncident(options: {
  siteId: unknown;
  reportedBy: unknown;
  type?: "INCIDENT" | "NEAR_MISS";
  status?: "REPORTED" | "TRIAGED" | "CLOSED";
  category?:
    | "LOST_TIME_INJURY"
    | "NEAR_MISS"
    | "FIRST_AID_CASE"
    | null;
  occurredAt: string;
}) {
  sequence += 1;
  return Incident.create({
    site: options.siteId,
    reportedBy: options.reportedBy,
    type: options.type ?? "INCIDENT",
    title: `Incident ${sequence}`,
    description: "Dashboard aggregation fixture.",
    occurredAt: new Date(options.occurredAt),
    category: options.category ?? null,
    status: options.status ?? "REPORTED",
  });
}

async function createAttachment(options: {
  uploadedBy: unknown;
  entityType: "site" | "incident";
  entityId: unknown;
}) {
  sequence += 1;
  return Attachment.create({
    storageKey: sequence.toString(16).padStart(64, "0"),
    originalFilename: `fixture-${sequence}.png`,
    mimeType: "image/png",
    size: 12,
    checksum: "a".repeat(64),
    entityType: options.entityType,
    entityId: options.entityId,
    uploadedBy: options.uploadedBy,
  });
}

async function seedCrossSiteData() {
  const projectOne = await createProject();
  const projectTwo = await createProject();
  const siteOne = await createSite(projectOne._id);
  const siteTwo = await createSite(projectTwo._id);
  await createSite(projectOne._id);

  const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
  const employee = await signInAsIkoshUser({
    ikoshRole: "EMPLOYEE",
    assignedSites: [siteOne._id],
  });

  const contractorOne = await createContractor(projectOne._id);
  const contractorTwo = await createContractor(projectTwo._id);
  await createPersonnel(
    contractorOne._id,
    siteOne._id,
    "Site",
    "Worker One",
  );
  await createPersonnel(
    contractorTwo._id,
    siteTwo._id,
    "Site",
    "Worker Two",
  );

  const reported = await createIncident({
    siteId: siteOne._id,
    reportedBy: employee.user._id,
    status: "REPORTED",
    occurredAt: "2026-01-05T08:00:00.000Z",
  });
  const triaged = await createIncident({
    siteId: siteOne._id,
    reportedBy: employee.user._id,
    status: "TRIAGED",
    category: "LOST_TIME_INJURY",
    occurredAt: "2026-01-10T08:00:00.000Z",
  });
  const nearMiss = await createIncident({
    siteId: siteTwo._id,
    reportedBy: manager.user._id,
    type: "NEAR_MISS",
    status: "REPORTED",
    category: "NEAR_MISS",
    occurredAt: "2026-01-20T08:00:00.000Z",
  });
  await createIncident({
    siteId: siteTwo._id,
    reportedBy: manager.user._id,
    status: "CLOSED",
    category: "FIRST_AID_CASE",
    occurredAt: "2026-02-02T08:00:00.000Z",
  });

  await createAttachment({
    uploadedBy: employee.user._id,
    entityType: "site",
    entityId: siteOne._id,
  });
  await createAttachment({
    uploadedBy: manager.user._id,
    entityType: "incident",
    entityId: nearMiss._id,
  });

  return {
    projectOne,
    projectTwo,
    siteOne,
    siteTwo,
    manager,
    employee,
    reported,
    triaged,
  };
}

describe("HSE dashboard", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/hse/dashboard");

    expect(response.status).toBe(401);
  });

  it("returns accurate management-wide aggregates and incident breakdowns", async () => {
    await seedCrossSiteData();
    const manager = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .get("/api/hse/dashboard")
      .set("Authorization", manager.authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.totals).toEqual({
      projects: 2,
      sites: 3,
      contractors: 2,
      contractorPersonnel: 2,
      attachments: 2,
      incidents: 4,
      nearMisses: 1,
    });
    expect(response.body.data.incidents.byStatus).toEqual({
      REPORTED: 2,
      TRIAGED: 1,
      CLOSED: 1,
    });
    expect(response.body.data.incidents.byCategory).toEqual([
      { category: "FIRST_AID_CASE", count: 1 },
      { category: "LOST_TIME_INJURY", count: 1 },
      { category: "NEAR_MISS", count: 1 },
    ]);
    expect(response.body.data.incidents.unclassified).toBe(1);
    expect(response.body.data.incidents.trend).toEqual([
      { date: "2026-01-05", count: 1 },
      { date: "2026-01-10", count: 1 },
      { date: "2026-01-20", count: 1 },
      { date: "2026-02-02", count: 1 },
    ]);
    expect(response.body.data.scope).toMatchObject({
      projectId: null,
      siteId: null,
      from: null,
      to: null,
    });
    expect(JSON.stringify(response.body)).not.toContain("Worker");
  });

  it("counts distinct active personnel once across visible sites", async () => {
    const project = await createProject();
    const siteOne = await createSite(project._id);
    const siteTwo = await createSite(project._id);
    await createSite(project._id);
    const contractor = await createContractor(project._id);

    // Assigned to two visible sites; must be counted once.
    const multiSite = await createUnassignedPersonnel(contractor._id);
    await createAssignment(multiSite._id, contractor._id, siteOne._id);
    await createAssignment(multiSite._id, contractor._id, siteTwo._id);

    // Legacy-only assignment still counts.
    await createPersonnel(
      contractor._id,
      siteOne._id,
      "Legacy",
      "Worker",
    );

    // Legacy value plus an active assignment must deduplicate.
    const bothSources = await createPersonnel(
      contractor._id,
      siteOne._id,
      "Both",
      "Sources",
    );
    await createAssignment(bothSources._id, contractor._id, siteTwo._id);

    // Ended assignments do not count.
    const ended = await createUnassignedPersonnel(contractor._id);
    await createAssignment(ended._id, contractor._id, siteOne._id, {
      isActive: false,
    });

    // Inactive personnel do not count.
    const inactive = await createUnassignedPersonnel(contractor._id, {
      isActive: false,
    });
    await createAssignment(inactive._id, contractor._id, siteOne._id);

    // Unassigned personnel do not count.
    await createUnassignedPersonnel(contractor._id);

    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [siteOne._id, siteTwo._id],
    });

    const managementWide = await request(app)
      .get("/api/hse/dashboard")
      .set("Authorization", manager.authorization);
    const scoped = await request(app)
      .get("/api/hse/dashboard")
      .set("Authorization", employee.authorization);
    const siteScoped = await request(app)
      .get(`/api/hse/dashboard?siteId=${siteTwo._id}`)
      .set("Authorization", manager.authorization);

    expect(managementWide.body.data.totals.contractorPersonnel).toBe(3);
    expect(scoped.body.data.totals.contractorPersonnel).toBe(3);
    expect(siteScoped.body.data.totals.contractorPersonnel).toBe(2);
  });

  it("scopes aggregates to assigned sites for non-management roles", async () => {
    const data = await seedCrossSiteData();

    const employeeResponse = await request(app)
      .get("/api/hse/dashboard")
      .set("Authorization", data.employee.authorization);
    const managerResponse = await request(app)
      .get("/api/hse/dashboard")
      .set("Authorization", data.manager.authorization);

    expect(employeeResponse.status).toBe(200);
    expect(employeeResponse.body.data.totals).toEqual({
      projects: 1,
      sites: 1,
      contractors: 1,
      contractorPersonnel: 1,
      attachments: 1,
      incidents: 2,
      nearMisses: 0,
    });
    expect(employeeResponse.body.data.incidents.byStatus).toEqual({
      REPORTED: 1,
      TRIAGED: 1,
      CLOSED: 0,
    });
    expect(employeeResponse.body.data.incidents.unclassified).toBe(1);

    expect(managerResponse.body.data.totals.incidents).toBe(4);
    expect(managerResponse.body.data.totals.sites).toBe(3);
  });

  it("fails closed when a non-management user has no assigned sites", async () => {
    await seedCrossSiteData();
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [],
    });

    const response = await request(app)
      .get("/api/hse/dashboard")
      .set("Authorization", employee.authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.totals).toEqual({
      projects: 0,
      sites: 0,
      contractors: 0,
      contractorPersonnel: 0,
      attachments: 0,
      incidents: 0,
      nearMisses: 0,
    });
  });

  it("prevents cross-site and cross-project dashboard access", async () => {
    const data = await seedCrossSiteData();

    const crossSite = await request(app)
      .get(`/api/hse/dashboard?siteId=${data.siteTwo._id}`)
      .set("Authorization", data.employee.authorization);
    const crossProject = await request(app)
      .get(`/api/hse/dashboard?projectId=${data.projectTwo._id}`)
      .set("Authorization", data.employee.authorization);
    const assignedSite = await request(app)
      .get(`/api/hse/dashboard?siteId=${data.siteOne._id}`)
      .set("Authorization", data.employee.authorization);

    expect(crossSite.status).toBe(404);
    expect(crossProject.status).toBe(404);
    expect(assignedSite.status).toBe(200);
    expect(assignedSite.body.data.totals.sites).toBe(1);
    expect(assignedSite.body.data.totals.incidents).toBe(2);
  });

  it("applies project and site filters for management", async () => {
    const data = await seedCrossSiteData();

    const projectFiltered = await request(app)
      .get(`/api/hse/dashboard?projectId=${data.projectOne._id}`)
      .set("Authorization", data.manager.authorization);
    const siteFiltered = await request(app)
      .get(`/api/hse/dashboard?siteId=${data.siteTwo._id}`)
      .set("Authorization", data.manager.authorization);

    expect(projectFiltered.status).toBe(200);
    expect(projectFiltered.body.data.totals).toMatchObject({
      projects: 1,
      sites: 2,
      contractors: 1,
      contractorPersonnel: 1,
      incidents: 2,
    });
    expect(projectFiltered.body.data.scope.projectId).toBe(
      String(data.projectOne._id),
    );

    expect(siteFiltered.status).toBe(200);
    expect(siteFiltered.body.data.totals).toMatchObject({
      sites: 1,
      contractors: 1,
      contractorPersonnel: 1,
      incidents: 2,
      nearMisses: 1,
    });
    expect(siteFiltered.body.data.incidents.nearMisses).toBe(1);
  });

  it("applies an occurred-at date range to incident aggregates", async () => {
    const data = await seedCrossSiteData();

    const response = await request(app)
      .get(
        "/api/hse/dashboard?from=2026-01-06T00:00:00.000Z&to=2026-01-31T23:59:59.000Z",
      )
      .set("Authorization", data.manager.authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.totals.incidents).toBe(2);
    expect(response.body.data.incidents.trend).toEqual([
      { date: "2026-01-10", count: 1 },
      { date: "2026-01-20", count: 1 },
    ]);
    expect(response.body.data.incidents.byStatus).toEqual({
      REPORTED: 1,
      TRIAGED: 1,
      CLOSED: 0,
    });
  });

  it("validates filter identifiers and date ranges", async () => {
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const invalidProject = await request(app)
      .get("/api/hse/dashboard?projectId=not-an-id")
      .set("Authorization", manager.authorization);
    const invalidDate = await request(app)
      .get("/api/hse/dashboard?from=not-a-date")
      .set("Authorization", manager.authorization);
    const reversedRange = await request(app)
      .get(
        "/api/hse/dashboard?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z",
      )
      .set("Authorization", manager.authorization);

    expect(invalidProject.status).toBe(400);
    expect(invalidDate.status).toBe(400);
    expect(reversedRange.status).toBe(400);
  });
});
