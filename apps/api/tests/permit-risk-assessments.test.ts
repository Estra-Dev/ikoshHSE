import request from "supertest";
import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Permit } from "../src/models/Permit.js";
import { Project } from "../src/models/Project.js";
import { RiskAssessment } from "../src/models/RiskAssessment.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let sequence = 0;

async function createSite(status = "ACTIVE") {
  sequence += 1;

  const project = await Project.create({
    name: `Permit Risk Project ${sequence}`,
    code: `PRISK${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Permit Risk Site ${sequence}`,
    code: `PRSITE${sequence}`,
    status,
  });

  return { project, site };
}

function riskHazard() {
  return {
    hazard: "Work at height",
    consequences: "Fall from height",
    existingControls: "Guardrails",
    likelihood: 3,
    severity: 4,
    inherentLevel: "HIGH",
    residualLikelihood: 2,
    residualSeverity: 3,
    residualLevel: "MEDIUM",
    additionalControls: "Harness",
  };
}

async function createAssessment(input: {
  id?: Types.ObjectId;
  projectId: unknown;
  siteId?: unknown;
  ownerId: unknown;
  status?: string;
  supersededBy?: unknown;
  title?: string;
  revision?: number;
}) {
  sequence += 1;

  return RiskAssessment.create({
    ...(input.id ? { _id: input.id } : {}),
    title: input.title ?? `Linked risk assessment ${sequence}`,
    status: input.status ?? "APPROVED",
    project: input.projectId,
    site: input.siteId ?? null,
    owner: input.ownerId,
    createdBy: input.ownerId,
    revision: input.revision ?? 1,
    hazards: [riskHazard()],
    ...(input.supersededBy !== undefined
      ? { supersededBy: input.supersededBy }
      : {}),
  });
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
    workersInvolved: ["Ade Worker — welder"],
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

async function createWorkspace() {
  const { project, site } = await createSite();
  const otherSite = await Site.create({
    project: project._id,
    name: `Other Permit Risk Site ${sequence}`,
    code: `OPRSITE${sequence}`,
  });
  const officer = await signInAsIkoshUser({
    ikoshRole: "HSE_OFFICER",
    assignedSites: [site._id],
  });
  const responsible = await signInAsIkoshUser({
    ikoshRole: "SUPERVISOR",
    assignedSites: [site._id],
  });

  return { project, site, otherSite, officer, responsible };
}

describe("permit risk assessment links", () => {
  it("links approved assessments on create and serializes only safe fields", async () => {
    const { project, site, officer, responsible } = await createWorkspace();

    const first = await createAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
      title: "Tank farm hot work assessment",
      revision: 3,
    });
    const second = await createAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: officer.user._id,
      title: "Fire watch assessment",
    });

    const created = await createPermit(
      officer.authorization,
      permitBody(project._id, site._id, responsible.user._id, {
        // Duplicates are deduplicated before the limit is applied.
        riskAssessmentIds: [
          String(first._id),
          String(second._id),
          String(first._id),
        ],
      }),
    );

    expect(created.status).toBe(201);
    expect(created.body.permit.linkedRiskAssessments).toHaveLength(2);
    expect(created.body.permit.linkedRiskAssessments[0]).toMatchObject({
      id: String(first._id),
      title: "Tank farm hot work assessment",
      revision: 3,
      status: "APPROVED",
      isCurrent: true,
      project: { id: String(project._id), name: project.name },
      site: { id: String(site._id), name: site.name, code: site.code },
      owner: { id: String(responsible.user._id) },
    });
    expect(created.body.permit.linkedRiskAssessments[1]).toMatchObject({
      id: String(second._id),
      title: "Fire watch assessment",
      revision: 1,
      isCurrent: true,
    });

    const permitId = created.body.permit.id as string;
    const detail = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", officer.authorization);

    expect(detail.status).toBe(200);
    expect(
      detail.body.permit.linkedRiskAssessments.map(
        (assessment: { id: string }) => assessment.id,
      ),
    ).toEqual([String(first._id), String(second._id)]);

    // The list endpoint must not expand linked assessments.
    const list = await request(app)
      .get("/api/permits")
      .set("Authorization", officer.authorization);
    const listed = list.body.permits.find(
      (permit: { id: string }) => permit.id === permitId,
    );

    expect(listed.linkedRiskAssessments).toEqual([]);

    const audit = await AuditLog.findOne({
      entityType: "Permit",
      action: "permit.created",
    }).lean();

    expect(audit?.after).toMatchObject({
      linkedRiskAssessmentIds: [String(first._id), String(second._id)],
    });
    const snapshot = JSON.stringify(audit?.after);
    expect(snapshot).not.toContain("Tank farm hot work assessment");
    expect(snapshot).not.toContain("Fire watch assessment");
  });

  it("updates links, deduplicates before counting and never truncates", async () => {
    const { project, site, otherSite, officer, responsible } =
      await createWorkspace();

    const first = await createAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
    });
    const second = await createAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
    });

    const created = await createPermit(
      officer.authorization,
      permitBody(project._id, site._id, responsible.user._id),
    );
    const permitId = created.body.permit.id as string;

    const linked = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", officer.authorization)
      .send({
        riskAssessmentIds: [
          String(first._id),
          String(first._id),
          String(second._id),
          String(second._id),
        ],
      });

    expect(linked.status).toBe(200);
    expect(
      linked.body.permit.linkedRiskAssessments.map(
        (assessment: { id: string }) => assessment.id,
      ),
    ).toEqual([String(first._id), String(second._id)]);

    // Eleven distinct IDs exceed the limit and must fail rather than truncate.
    const tooMany = Array.from({ length: 11 }, () =>
      String(new Types.ObjectId()),
    );
    const rejected = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", officer.authorization)
      .send({ riskAssessmentIds: tooMany });

    expect(rejected.status).toBe(400);

    // The same ID repeated eleven times is still one unique link and succeeds.
    const repeated = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", officer.authorization)
      .send({
        riskAssessmentIds: Array.from({ length: 11 }, () =>
          String(first._id),
        ),
      });

    expect(repeated.status).toBe(200);
    expect(repeated.body.permit.linkedRiskAssessments).toHaveLength(1);
    expect(repeated.body.permit.linkedRiskAssessments[0].id).toBe(
      String(first._id),
    );

    // A newly added link on update is still checked against the exact site.
    const wrongSite = await createAssessment({
      projectId: project._id,
      siteId: otherSite._id,
      ownerId: responsible.user._id,
    });
    const wrongSiteUpdate = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", officer.authorization)
      .send({ riskAssessmentIds: [String(wrongSite._id)] });

    expect(wrongSiteUpdate.status).toBe(409);
  });

  it("deduplicates case variants of the same ObjectId before counting", async () => {
    const { project, site, officer, responsible } = await createWorkspace();
    const canonicalId = "abcdefabcdefabcdefabcdef";
    const lower = canonicalId;
    const upper = canonicalId.toUpperCase();

    const assessment = await createAssessment({
      id: new Types.ObjectId(canonicalId),
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
    });

    expect(String(assessment._id)).toBe(lower);
    expect(upper).not.toBe(lower);

    const created = await createPermit(
      officer.authorization,
      permitBody(project._id, site._id, responsible.user._id, {
        riskAssessmentIds: [lower, upper],
      }),
    );

    expect(created.status).toBe(201);
    expect(created.body.permit.linkedRiskAssessments).toHaveLength(1);
    expect(created.body.permit.linkedRiskAssessments[0].id).toBe(lower);

    const permitId = created.body.permit.id as string;
    const storedAfterCreate = await Permit.findById(permitId).lean();

    expect(storedAfterCreate?.riskAssessments.map(String)).toEqual([lower]);

    const updated = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", officer.authorization)
      .send({ riskAssessmentIds: [upper, lower, upper] });

    expect(updated.status).toBe(200);
    expect(updated.body.permit.linkedRiskAssessments).toHaveLength(1);
    expect(updated.body.permit.linkedRiskAssessments[0].id).toBe(lower);

    const storedAfterUpdate = await Permit.findById(permitId).lean();

    expect(storedAfterUpdate?.riskAssessments.map(String)).toEqual([lower]);
  });

  it("rejects missing, unapproved, superseded and mismatched assessments", async () => {
    const { project, site, otherSite, officer, responsible } =
      await createWorkspace();
    const { project: otherProject, site: otherProjectSite } =
      await createSite();

    const draft = await createAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
      status: "DRAFT",
    });
    const inReview = await createAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
      status: "IN_REVIEW",
    });
    const archived = await createAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
      status: "ARCHIVED",
    });
    const superseded = await createAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
      supersededBy: new Types.ObjectId(),
    });
    const otherSiteAssessment = await createAssessment({
      projectId: project._id,
      siteId: otherSite._id,
      ownerId: responsible.user._id,
    });
    const noSiteAssessment = await createAssessment({
      projectId: project._id,
      ownerId: responsible.user._id,
    });
    const otherProjectAssessment = await createAssessment({
      projectId: otherProject._id,
      siteId: otherProjectSite._id,
      ownerId: responsible.user._id,
    });

    const invalidIds = [
      {
        label: "missing",
        id: String(new Types.ObjectId()),
      },
      { label: "draft", id: String(draft._id) },
      { label: "in review", id: String(inReview._id) },
      { label: "archived", id: String(archived._id) },
      { label: "superseded", id: String(superseded._id) },
      { label: "other site", id: String(otherSiteAssessment._id) },
      { label: "no site", id: String(noSiteAssessment._id) },
      { label: "other project", id: String(otherProjectAssessment._id) },
    ];

    for (const invalid of invalidIds) {
      const response = await createPermit(
        officer.authorization,
        permitBody(project._id, site._id, responsible.user._id, {
          riskAssessmentIds: [invalid.id],
        }),
      );

      expect(response.status, invalid.label).toBe(409);
    }
  });

  it("keeps superseded links as historical references", async () => {
    const { project, site, officer, responsible } = await createWorkspace();

    const assessment = await createAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
      title: "Historic scaffold assessment",
    });

    const created = await createPermit(
      officer.authorization,
      permitBody(project._id, site._id, responsible.user._id, {
        riskAssessmentIds: [String(assessment._id)],
      }),
    );
    const permitId = created.body.permit.id as string;

    await RiskAssessment.updateOne(
      { _id: assessment._id },
      {
        $set: {
          supersededBy: new Types.ObjectId(),
          supersededAt: new Date(),
        },
      },
    );

    const detail = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", officer.authorization);

    expect(detail.status).toBe(200);
    expect(detail.body.permit.linkedRiskAssessments).toHaveLength(1);
    expect(detail.body.permit.linkedRiskAssessments[0]).toMatchObject({
      id: String(assessment._id),
      title: "Historic scaffold assessment",
      status: "APPROVED",
      // Derived from status + supersededBy, not a stored isCurrent field.
      isCurrent: false,
    });

    // Editing unrelated content must not drop the historical link.
    const updated = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", officer.authorization)
      .send({ workDescription: "Updated hot work scope" });

    expect(updated.status).toBe(200);
    expect(updated.body.permit.linkedRiskAssessments).toHaveLength(1);
    expect(updated.body.permit.linkedRiskAssessments[0].isCurrent).toBe(false);

    // Sending the same existing ID back is also allowed after supersession.
    const resaved = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", officer.authorization)
      .send({ riskAssessmentIds: [String(assessment._id)] });

    expect(resaved.status).toBe(200);
    expect(resaved.body.permit.linkedRiskAssessments[0].isCurrent).toBe(false);

    // A superseded assessment cannot be newly linked to another permit.
    const rejected = await createPermit(
      officer.authorization,
      permitBody(project._id, site._id, responsible.user._id, {
        riskAssessmentIds: [String(assessment._id)],
      }),
    );

    expect(rejected.status).toBe(409);
  });

  it("expands linked assessments on status responses", async () => {
    const { project, site, officer, responsible } = await createWorkspace();

    const assessment = await createAssessment({
      projectId: project._id,
      siteId: site._id,
      ownerId: responsible.user._id,
      title: "Status response assessment",
    });

    const created = await createPermit(
      officer.authorization,
      permitBody(project._id, site._id, responsible.user._id, {
        riskAssessmentIds: [String(assessment._id)],
      }),
    );
    const permitId = created.body.permit.id as string;

    const submitted = await request(app)
      .patch(`/api/permits/${permitId}/status`)
      .set("Authorization", officer.authorization)
      .send({ status: "SUBMITTED" });

    expect(submitted.status).toBe(200);
    expect(submitted.body.permit.linkedRiskAssessments).toHaveLength(1);
    expect(submitted.body.permit.linkedRiskAssessments[0]).toMatchObject({
      id: String(assessment._id),
      title: "Status response assessment",
      isCurrent: true,
    });
  });
});
