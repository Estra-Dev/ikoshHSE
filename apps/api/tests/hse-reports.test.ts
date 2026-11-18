import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { CorrectiveAction } from "../src/models/CorrectiveAction.js";
import { HseAudit } from "../src/models/HseAudit.js";
import { Incident } from "../src/models/Incident.js";
import { Inspection } from "../src/models/Inspection.js";
import { Permit } from "../src/models/Permit.js";
import { Project } from "../src/models/Project.js";
import { RiskAssessment } from "../src/models/RiskAssessment.js";
import { Site } from "../src/models/Site.js";
import { ToolboxTalk } from "../src/models/ToolboxTalk.js";
import { TrainingCourse } from "../src/models/TrainingCourse.js";
import { TrainingSession } from "../src/models/TrainingSession.js";
import { signInAsIkoshUser } from "./helpers.js";

let sequence = 0;

interface SiteFixture {
  project: { _id: Types.ObjectId };
  site: { _id: Types.ObjectId };
}

async function createSite(prefix: string): Promise<SiteFixture> {
  sequence += 1;

  const project = await Project.create({
    name: `${prefix} Project ${sequence}`,
    code: `${prefix}P${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `${prefix} Site ${sequence}`,
    code: `${prefix}S${sequence}`,
    status: "ACTIVE",
  });

  return { project, site };
}

function participant(
  kind: "EMPLOYEE" | "CONTRACTOR",
  personId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  return {
    kind,
    ...(kind === "EMPLOYEE"
      ? { employee: personId }
      : { contractorPersonnel: personId }),
    name: kind === "EMPLOYEE" ? "Report Employee" : "Report Contractor",
    attendance: "INVITED",
    notes: null,
    ...overrides,
  };
}

async function seedSite(
  fixture: SiteFixture,
  creatorId: Types.ObjectId,
  employeeId: Types.ObjectId,
  contractorPersonId: Types.ObjectId,
  courseId: Types.ObjectId,
  occurredAt: string,
  nearMissAt = "2026-01-20T15:30:00.000Z",
) {
  await Incident.create({
    site: fixture.site._id,
    reportedBy: creatorId,
    type: "INCIDENT",
    title: "Forklift contact",
    description: "Forklift clipped a barrier.",
    occurredAt: new Date(occurredAt),
    category: "FIRST_AID_CASE",
    status: "REPORTED",
  });

  await Incident.create({
    site: fixture.site._id,
    reportedBy: creatorId,
    type: "NEAR_MISS",
    title: "Falling object near miss",
    description: "A spanner fell near a walkway.",
    occurredAt: new Date(nearMissAt),
    status: "CLOSED",
  });

  await Inspection.create({
    title: "Weekly walkdown",
    type: "ROUTINE",
    status: "COMPLETED",
    project: fixture.project._id,
    site: fixture.site._id,
    inspector: creatorId,
    scheduledFor: new Date("2026-01-15T09:00:00.000Z"),
    createdBy: creatorId,
    findings: [
      {
        description: "Missing guard",
        severity: "HIGH",
        createdBy: creatorId,
      },
      {
        description: "Housekeeping",
        severity: "LOW",
        createdBy: creatorId,
      },
    ],
  });

  await HseAudit.create({
    title: "ISO 45001 audit",
    type: "INTERNAL",
    status: "COMPLETED",
    project: fixture.project._id,
    site: fixture.site._id,
    auditors: [creatorId],
    scheduledFor: new Date("2026-01-18T09:00:00.000Z"),
    createdBy: creatorId,
    findings: [
      {
        description: "Procedure not followed",
        severity: "MEDIUM",
        createdBy: creatorId,
      },
    ],
    checklist: [
      { item: "Document control", result: "COMPLIANT" },
      { item: "Training records", result: "NON_COMPLIANT" },
    ],
  });

  await Permit.create({
    workDescription: "Hot work on pipe rack",
    workType: "HOT_WORK",
    status: "ACTIVE",
    project: fixture.project._id,
    site: fixture.site._id,
    validFrom: new Date("2026-01-05T08:00:00.000Z"),
    validTo: new Date("2030-01-05T08:00:00.000Z"),
    responsiblePerson: creatorId,
    createdBy: creatorId,
  });

  await CorrectiveAction.create({
    description: "Repair guard",
    source: "OTHER",
    project: fixture.project._id,
    site: fixture.site._id,
    assignedTo: creatorId,
    dueDate: new Date("2026-01-01T00:00:00.000Z"),
    status: "OPEN",
    createdBy: creatorId,
  });

  await RiskAssessment.create({
    title: "Lifting operations",
    status: "APPROVED",
    project: fixture.project._id,
    site: fixture.site._id,
    owner: creatorId,
    createdBy: creatorId,
    hazards: [
      {
        hazard: "Load drop",
        likelihood: 3,
        severity: 4,
        inherentLevel: "HIGH",
        residualLikelihood: 2,
        residualSeverity: 3,
        residualLevel: "MEDIUM",
      },
    ],
  });

  await TrainingSession.create({
    course: courseId,
    project: fixture.project._id,
    site: fixture.site._id,
    topic: "Manual handling",
    trainerName: "External trainer",
    scheduledDate: new Date("2026-01-12T08:00:00.000Z"),
    durationMinutes: 60,
    status: "COMPLETED",
    createdBy: creatorId,
    participants: [
      participant("EMPLOYEE", employeeId, {
        attendance: "ATTENDED",
        completed: true,
        certificateNumber: "CERT-1",
      }),
      participant("CONTRACTOR", contractorPersonId),
    ],
  });

  await ToolboxTalk.create({
    project: fixture.project._id,
    site: fixture.site._id,
    topic: "Working at height",
    facilitatorName: "Site supervisor",
    scheduledDate: new Date("2026-01-14T07:00:00.000Z"),
    durationMinutes: 15,
    status: "COMPLETED",
    createdBy: creatorId,
    participants: [
      participant("EMPLOYEE", employeeId, {
        attendance: "ATTENDED",
        acknowledged: true,
      }),
      participant("CONTRACTOR", contractorPersonId),
    ],
  });
}

async function seedReports() {
  const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
  const supervisor = await signInAsIkoshUser({
    ikoshRole: "SUPERVISOR",
    assignedSites: [],
  });
  const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

  const siteA = await createSite("REPA");
  const siteB = await createSite("REPB");

  sequence += 1;
  const course = await TrainingCourse.create({
    code: `REPORT-COURSE-${sequence}`,
    title: "Manual handling",
    category: "INDUCTION",
  });

  await seedSite(
    siteA,
    manager.user._id,
    employee.user._id,
    employee.user._id,
    course._id,
    "2026-01-10T09:00:00.000Z",
  );
  await seedSite(
    siteB,
    manager.user._id,
    employee.user._id,
    employee.user._id,
    course._id,
    "2026-01-10T09:00:00.000Z",
    "2026-01-16T15:30:00.000Z",
  );

  // The supervisor is assigned only to site A.
  supervisor.user.assignedSites = [new Types.ObjectId(String(siteA.site._id))];
  await supervisor.user.save();

  return { manager, supervisor, employee, siteA, siteB };
}

function getReport(authorization: string, query: Record<string, string> = {}) {
  return request(app)
    .get("/api/hse/reports")
    .query(query)
    .set("Authorization", authorization);
}

describe("HSE reports", () => {
  it("rejects roles without report access", async () => {
    const { employee } = await seedReports();

    const response = await getReport(employee.authorization);

    expect(response.status).toBe(403);
  });

  it("aggregates every register for HSE management", async () => {
    const { manager } = await seedReports();

    const response = await getReport(manager.authorization);

    expect(response.status).toBe(200);
    const report = response.body.data;

    expect(report.incidents).toMatchObject({
      total: 4,
      incidents: 2,
      nearMisses: 2,
      unclassified: 2,
    });
    expect(report.incidents.byStatus).toMatchObject({
      REPORTED: 2,
      CLOSED: 2,
    });
    expect(report.incidents.byCategory).toEqual([
      { category: "FIRST_AID_CASE", count: 2 },
    ]);

    expect(report.inspections.total).toBe(2);
    expect(report.inspections.findingsTotal).toBe(4);
    expect(report.inspections.findingsBySeverity).toMatchObject({
      LOW: 2,
      HIGH: 2,
    });

    expect(report.audits.total).toBe(2);
    expect(report.audits.findingsTotal).toBe(2);
    expect(report.audits.checklistByResult).toMatchObject({
      COMPLIANT: 2,
      NON_COMPLIANT: 2,
    });

    expect(report.permits.total).toBe(2);
    expect(report.correctiveActions.total).toBe(2);
    expect(report.correctiveActions.overdue).toBe(2);

    expect(report.riskAssessments.total).toBe(2);
    expect(report.riskAssessments.hazardsTotal).toBe(2);
    expect(report.riskAssessments.hazardsByResidualLevel.MEDIUM).toBe(2);

    expect(report.training.sessions).toBe(2);
    expect(report.training.attendance).toEqual({
      invited: 2,
      attended: 2,
      absent: 0,
      completed: 2,
      certificatesIssued: 2,
      employees: 2,
      contractors: 2,
    });

    expect(report.toolboxTalks.talks).toBe(2);
    expect(report.toolboxTalks.attendance).toEqual({
      invited: 2,
      attended: 2,
      absent: 0,
      acknowledged: 2,
      employees: 2,
      contractors: 2,
    });
  });

  it("applies the same site boundaries as the registers", async () => {
    const { supervisor, manager, siteA } = await seedReports();

    const response = await getReport(supervisor.authorization);
    expect(response.status).toBe(200);

    const report = response.body.data;
    expect(report.incidents.total).toBe(2);
    expect(report.inspections.total).toBe(1);
    expect(report.audits.total).toBe(1);
    expect(report.permits.total).toBe(1);
    expect(report.correctiveActions.total).toBe(1);
    expect(report.riskAssessments.total).toBe(1);
    expect(report.training.sessions).toBe(1);
    expect(report.toolboxTalks.talks).toBe(1);

    // Register totals for the same viewer must match the report exactly.
    const registers = await Promise.all([
      request(app)
        .get("/api/incidents")
        .set("Authorization", supervisor.authorization),
      request(app)
        .get("/api/inspections")
        .set("Authorization", supervisor.authorization),
      request(app)
        .get("/api/audits")
        .set("Authorization", supervisor.authorization),
      request(app)
        .get("/api/permits")
        .set("Authorization", supervisor.authorization),
      request(app)
        .get("/api/corrective-actions")
        .set("Authorization", supervisor.authorization),
      request(app)
        .get("/api/risk-assessments")
        .set("Authorization", supervisor.authorization),
      request(app)
        .get("/api/training")
        .set("Authorization", supervisor.authorization),
      request(app)
        .get("/api/toolbox-talks")
        .set("Authorization", supervisor.authorization),
    ]);

    expect(registers.map((entry) => entry.status)).toEqual(
      new Array(8).fill(200),
    );
    expect(registers.map((entry) => entry.body.pagination.total)).toEqual([
      report.incidents.total,
      report.inspections.total,
      report.audits.total,
      report.permits.total,
      report.correctiveActions.total,
      report.riskAssessments.total,
      report.training.sessions,
      report.toolboxTalks.talks,
    ]);

    // A site-level filter narrows the same boundary rather than widening it.
    const filtered = await getReport(manager.authorization, {
      siteId: String(siteA.site._id),
    });
    expect(filtered.body.data.incidents.total).toBe(2);
    expect(filtered.body.data.inspections.total).toBe(1);
  });

  it("rejects sites outside the viewer's assignment", async () => {
    const { supervisor, siteB } = await seedReports();

    const response = await getReport(supervisor.authorization, {
      siteId: String(siteB.site._id),
    });

    expect(response.status).toBe(404);
  });

  it("scopes reports by project", async () => {
    const { manager, supervisor, siteA, siteB } = await seedReports();

    const projectA = await getReport(manager.authorization, {
      projectId: String(siteA.project._id),
    });
    expect(projectA.status).toBe(200);
    expect(projectA.body.data.incidents.total).toBe(2);

    const projectB = await getReport(manager.authorization, {
      projectId: String(siteB.project._id),
    });
    expect(projectB.body.data.incidents.total).toBe(2);

    const supervisorOtherProject = await getReport(supervisor.authorization, {
      projectId: String(siteB.project._id),
    });
    expect(supervisorOtherProject.status).toBe(404);
  });

  it("limits project-level records to users with all-site access", async () => {
    const { manager, supervisor, siteA } = await seedReports();

    await Inspection.create({
      title: "Project-level HSE inspection",
      type: "ROUTINE",
      status: "COMPLETED",
      project: siteA.project._id,
      site: null,
      inspector: supervisor.user._id,
      scheduledFor: new Date("2026-01-22T09:00:00.000Z"),
      createdBy: supervisor.user._id,
    });

    const managerReport = await getReport(manager.authorization, {
      projectId: String(siteA.project._id),
    });

    const supervisorReport = await getReport(supervisor.authorization, {
      projectId: String(siteA.project._id),
    });

    expect(managerReport.status).toBe(200);
    expect(managerReport.body.data.inspections.total).toBe(2);

    expect(supervisorReport.status).toBe(200);
    expect(supervisorReport.body.data.inspections.total).toBe(1);
  });

  it("filters by date and treats a date-only end value as inclusive", async () => {
    const { manager } = await seedReports();

    const response = await getReport(manager.authorization, {
      from: "2026-01-20",
      to: "2026-01-20",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.incidents.total).toBe(1);
    expect(response.body.data.incidents.nearMisses).toBe(1);
  });

  it("rejects an inverted date range", async () => {
    const { manager } = await seedReports();

    const response = await getReport(manager.authorization, {
      from: "2026-02-01",
      to: "2026-01-01",
    });

    expect(response.status).toBe(400);
  });
});
