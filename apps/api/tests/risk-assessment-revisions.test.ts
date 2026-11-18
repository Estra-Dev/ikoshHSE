import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Incident } from "../src/models/Incident.js";
import { Project } from "../src/models/Project.js";
import { RiskAssessment } from "../src/models/RiskAssessment.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

let sequence = 0;

async function createSite() {
  sequence += 1;

  const project = await Project.create({
    name: `Revision Project ${sequence}`,
    code: `REV${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Revision Site ${sequence}`,
    code: `RSITE${sequence}`,
  });

  return { project, site };
}

function hazard(overrides: Record<string, unknown> = {}) {
  return {
    hazard: "Work at height",
    consequences: "Fall from scaffold level 3",
    existingControls: "Guardrails and toe boards",
    likelihood: 3,
    severity: 4,
    residualLikelihood: 2,
    residualSeverity: 3,
    additionalControls: "Harness anchor points",
    ...overrides,
  };
}

function assessmentBody(
  projectId: unknown,
  ownerId: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    title: "Scaffold erection risk assessment",
    description: "Assessment for the north elevation scaffold.",
    projectId: String(projectId),
    ownerId: String(ownerId),
    reviewDate: new Date("2026-06-01T00:00:00.000Z").toISOString(),
    hazards: [hazard()],
    ...overrides,
  };
}

function createAssessment(
  authorization: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post("/api/risk-assessments")
    .set("Authorization", authorization)
    .send(body);
}

function updateStatus(
  authorization: string,
  assessmentId: string,
  status: string,
) {
  return request(app)
    .patch(`/api/risk-assessments/${assessmentId}/status`)
    .set("Authorization", authorization)
    .send({ status });
}

function createRevision(
  authorization: string,
  assessmentId: string,
  body: Record<string, unknown> = {
    reviewTrigger: "CHANGED_CONDITIONS",
  },
) {
  return request(app)
    .post(`/api/risk-assessments/${assessmentId}/revisions`)
    .set("Authorization", authorization)
    .send(body);
}

async function approvedAssessment(
  officerAuthorization: string,
  managerAuthorization: string,
  projectId: unknown,
  ownerId: unknown,
  siteId: unknown,
  overrides: Record<string, unknown> = {},
) {
  const created = await createAssessment(officerAuthorization, {
    ...assessmentBody(projectId, ownerId),
    siteId: String(siteId),
    ...overrides,
  });

  const assessmentId = created.body.riskAssessment.id;

  await updateStatus(officerAuthorization, assessmentId, "IN_REVIEW");
  const approved = await updateStatus(
    managerAuthorization,
    assessmentId,
    "APPROVED",
  );

  return approved.body.riskAssessment;
}

describe("risk assessment revisions API", () => {
  it("clones the current approved assessment with fresh step and hazard ids", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const firstStepId = "64c000000000000000000001";

    const source = await approvedAssessment(
      officer.authorization,
      manager.authorization,
      project._id,
      officer.user._id,
      site._id,
      {
        taskSteps: [
          { id: firstStepId, description: "Erect scaffold" },
          { description: "Inspect scaffold" },
        ],
        hazards: [
          hazard({ taskStepId: firstStepId }),
          hazard({ hazard: "Dropped tools", taskStepId: null }),
        ],
      },
    );

    const revisionResponse = await createRevision(
      officer.authorization,
      source.id,
      {
        reviewTrigger: "CHANGED_CONDITIONS",
        reviewDate: "2026-12-01T00:00:00.000Z",
      },
    );

    expect(revisionResponse.status).toBe(201);
    const revision = revisionResponse.body.riskAssessment;

    expect(revision).toMatchObject({
      status: "DRAFT",
      revision: 2,
      lineageId: source.id,
      supersedes: source.id,
      supersededBy: null,
      supersededAt: null,
      reviewTrigger: "CHANGED_CONDITIONS",
      reviewTriggerIncident: null,
      isCurrent: false,
      isSuperseded: false,
    });
    expect(revision.title).toBe(source.title);
    expect(revision.reviewDate).toBe("2026-12-01T00:00:00.000Z");
    expect(revision.taskSteps).toHaveLength(2);
    expect(revision.hazards).toHaveLength(2);
    // Cloning deliberately allocates fresh ids so treatment actions on older
    // revisions keep pointing at their own hazard lines.
    expect(revision.taskSteps[0].id).not.toBe(firstStepId);
    expect(revision.hazards[0].id).not.toBe(source.hazards[0].id);
    expect(revision.hazards[0].taskStepId).toBe(revision.taskSteps[0].id);
    expect(revision.hazards[1].taskStepId).toBeNull();

    const sourceAfter = await request(app)
      .get(`/api/risk-assessments/${source.id}`)
      .set("Authorization", officer.authorization);

    expect(sourceAfter.body.riskAssessment).toMatchObject({
      status: "APPROVED",
      isCurrent: true,
      isSuperseded: false,
      supersededBy: null,
    });

    const history = await request(app)
      .get(`/api/risk-assessments/${source.id}/revisions`)
      .set("Authorization", officer.authorization);

    expect(history.status).toBe(200);
    expect(
      history.body.riskAssessments.map(
        (item: { id: string; revision: number }) => [item.id, item.revision],
      ),
    ).toEqual([
      [source.id, 1],
      [revision.id, 2],
    ]);

    const audit = await AuditLog.findOne({
      entityType: "RiskAssessment",
      action: "risk_assessment.revision_created",
    }).lean();

    expect(audit?.after).toMatchObject({
      status: "DRAFT",
      revision: 2,
      lineageId: source.id,
      supersedes: source.id,
      reviewTrigger: "CHANGED_CONDITIONS",
    });
    expect(JSON.stringify(audit?.after)).not.toContain("Work at height");

    const draftRevision = await createRevision(
      officer.authorization,
      revision.id,
    );

    expect(draftRevision.status).toBe(409);
  });

  it("rejects revisions from archived sources and mismatched incidents", async () => {
    const { project, site } = await createSite();
    const other = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const archivedSource = await approvedAssessment(
      officer.authorization,
      manager.authorization,
      project._id,
      officer.user._id,
      site._id,
    );

    await updateStatus(
      manager.authorization,
      archivedSource.id,
      "ARCHIVED",
    );

    const archivedRevision = await createRevision(
      officer.authorization,
      archivedSource.id,
    );

    expect(archivedRevision.status).toBe(409);

    const source = await approvedAssessment(
      officer.authorization,
      manager.authorization,
      project._id,
      officer.user._id,
      site._id,
    );
    const otherIncident = await Incident.create({
      site: other.site._id,
      reportedBy: manager.user._id,
      type: "INCIDENT",
      title: "Fall from height",
      description: "A worker fell from a scaffold lift.",
      occurredAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    const mismatch = await createRevision(
      officer.authorization,
      source.id,
      {
        reviewTrigger: "INCIDENT",
        incidentId: String(otherIncident._id),
      },
    );

    expect(mismatch.status).toBe(409);

    const matchingIncident = await Incident.create({
      site: site._id,
      reportedBy: manager.user._id,
      type: "NEAR_MISS",
      title: "Dropped tool near miss",
      description: "A tool fell inside the exclusion zone.",
      occurredAt: new Date("2026-03-02T00:00:00.000Z"),
    });

    const matched = await createRevision(
      officer.authorization,
      source.id,
      {
        reviewTrigger: "INCIDENT",
        incidentId: String(matchingIncident._id),
      },
    );

    expect(matched.status).toBe(201);
    expect(matched.body.riskAssessment.reviewTriggerIncident).toMatchObject({
      id: String(matchingIncident._id),
      title: "Dropped tool near miss",
    });
  });

  it("supersedes the source atomically and preserves the approved record", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const source = await approvedAssessment(
      officer.authorization,
      manager.authorization,
      project._id,
      officer.user._id,
      site._id,
    );
    const created = await createRevision(officer.authorization, source.id);
    const revision = created.body.riskAssessment;

    await updateStatus(officer.authorization, revision.id, "IN_REVIEW");

    const approved = await updateStatus(
      manager.authorization,
      revision.id,
      "APPROVED",
    );

    expect(approved.status).toBe(200);
    expect(approved.body.riskAssessment).toMatchObject({
      status: "APPROVED",
      isCurrent: true,
      isSuperseded: false,
      supersededBy: null,
    });

    const sourceAfter = await request(app)
      .get(`/api/risk-assessments/${source.id}`)
      .set("Authorization", manager.authorization);

    expect(sourceAfter.body.riskAssessment).toMatchObject({
      status: "APPROVED",
      isCurrent: false,
      isSuperseded: true,
      supersededBy: revision.id,
    });
    expect(sourceAfter.body.riskAssessment.supersededAt).toEqual(
      expect.any(String),
    );

    const immutable = await request(app)
      .patch(`/api/risk-assessments/${source.id}`)
      .set("Authorization", manager.authorization)
      .send({ title: "Rewrite the superseded record" });

    expect(immutable.status).toBe(409);

    const audit = await AuditLog.findOne({
      entityType: "RiskAssessment",
      action: "risk_assessment.superseded",
    }).lean();

    expect(String(audit?.entityId)).toBe(source.id);
    expect(audit?.after).toMatchObject({
      supersededBy: revision.id,
      status: "APPROVED",
    });
  });

  it("lets only one of two competing revisions supersede the source", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const source = await approvedAssessment(
      officer.authorization,
      manager.authorization,
      project._id,
      officer.user._id,
      site._id,
    );

    const first = (
      await createRevision(officer.authorization, source.id)
    ).body.riskAssessment;
    const second = (
      await createRevision(officer.authorization, source.id)
    ).body.riskAssessment;

    await updateStatus(officer.authorization, first.id, "IN_REVIEW");
    await updateStatus(officer.authorization, second.id, "IN_REVIEW");

    const [firstApproval, secondApproval] = await Promise.all([
      updateStatus(manager.authorization, first.id, "APPROVED"),
      updateStatus(manager.authorization, second.id, "APPROVED"),
    ]);

    expect(
      [firstApproval.status, secondApproval.status].sort((left, right) => left - right),
    ).toEqual([200, 409]);

    const sourceDocument = await RiskAssessment.findById(source.id).lean();
    const revisions = await RiskAssessment.find({
      _id: { $in: [first.id, second.id] },
    }).lean();

    expect(sourceDocument).toMatchObject({
      status: "APPROVED",
      supersededBy: expect.anything(),
    });
    expect(
      revisions.filter(
        (item) => item.status === "APPROVED" && item.supersededBy === null,
      ),
    ).toHaveLength(1);
    expect(
      revisions.filter(
        (item) =>
          String(item._id) === String(sourceDocument?.supersededBy),
      ),
    ).toHaveLength(1);
  });

  it("denies revision creation to read-only roles", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const supervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });

    const source = await approvedAssessment(
      officer.authorization,
      manager.authorization,
      project._id,
      officer.user._id,
      site._id,
    );

    const response = await createRevision(supervisor.authorization, source.id);

    expect(response.status).toBe(403);
  });
});
