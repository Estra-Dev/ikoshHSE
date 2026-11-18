import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { CorrectiveAction } from "../src/models/CorrectiveAction.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

let sequence = 0;

async function createSite() {
  sequence += 1;

  const project = await Project.create({
    name: `Treatment Project ${sequence}`,
    code: `TRT${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Treatment Site ${sequence}`,
    code: `TSITE${sequence}`,
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

function dueInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function createAssessment(
  authorization: string,
  projectId: unknown,
  ownerId: unknown,
  siteId: unknown,
) {
  return request(app)
    .post("/api/risk-assessments")
    .set("Authorization", authorization)
    .send({
      title: "Scaffold erection risk assessment",
      description: "Assessment for the north elevation scaffold.",
      projectId: String(projectId),
      siteId: String(siteId),
      ownerId: String(ownerId),
      hazards: [
        hazard(),
        hazard({
          hazard: "Manual handling of scaffold tubes",
          consequences: "Musculoskeletal injury",
        }),
      ],
    });
}

function raiseTreatment(
  authorization: string,
  assessmentId: string,
  hazardId: string,
  assignedTo: unknown,
  overrides: Record<string, unknown> = {},
) {
  return request(app)
    .post(
      `/api/risk-assessments/${assessmentId}/hazards/${hazardId}/treatment-action`,
    )
    .set("Authorization", authorization)
    .send({
      description: "Fit a temporary edge protection system",
      assignedTo: String(assignedTo),
      dueDate: dueInDays(7),
      ...overrides,
    });
}

describe("risk assessment treatment actions API", () => {
  it("raises multiple actions per hazard with derived project and site", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const supervisor = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });

    const created = await createAssessment(
      officer.authorization,
      project._id,
      officer.user._id,
      site._id,
    );
    const assessment = created.body.riskAssessment;
    const hazardId = assessment.hazards[0].id;

    const first = await raiseTreatment(
      officer.authorization,
      assessment.id,
      hazardId,
      supervisor.user._id,
    );
    const second = await raiseTreatment(
      officer.authorization,
      assessment.id,
      hazardId,
      supervisor.user._id,
      { description: "Add a rescue plan for harness work" },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.correctiveAction).toMatchObject({
      source: "RISK_ASSESSMENT",
      project: { id: String(project._id) },
      site: { id: String(site._id) },
      assignedTo: { id: String(supervisor.user._id) },
      status: "OPEN",
      riskAssessment: {
        id: assessment.id,
        title: assessment.title,
        status: "DRAFT",
        revision: 1,
      },
      riskAssessmentHazardId: hazardId,
    });

    const byAssessment = await request(app)
      .get(`/api/corrective-actions?riskAssessmentId=${assessment.id}`)
      .set("Authorization", officer.authorization);
    const byHazard = await request(app)
      .get(
        `/api/corrective-actions?riskAssessmentId=${assessment.id}&hazardId=${hazardId}`,
      )
      .set("Authorization", officer.authorization);

    expect(byAssessment.status).toBe(200);
    expect(byAssessment.body.correctiveActions).toHaveLength(2);
    expect(byHazard.body.correctiveActions).toHaveLength(2);
    expect(
      byAssessment.body.correctiveActions.every(
        (action: { riskAssessmentHazardId: string }) =>
          action.riskAssessmentHazardId === hazardId,
      ),
    ).toBe(true);

    const audit = await AuditLog.findOne({
      entityType: "CorrectiveAction",
      action: "corrective_action.created",
      entityId: first.body.correctiveAction.id,
    }).lean();

    expect(audit?.after).toMatchObject({
      source: "RISK_ASSESSMENT",
      riskAssessment: assessment.id,
      riskAssessmentHazardId: hazardId,
    });
    // Free-text action descriptions never reach the audit log.
    expect(JSON.stringify(audit?.after)).not.toContain(
      "temporary edge protection",
    );

    const linkedAudit = await AuditLog.findOne({
      entityType: "RiskAssessment",
      action: "risk_assessment.treatment_action_raised",
      entityId: assessment.id,
      "after.correctiveActionId": first.body.correctiveAction.id,
    }).lean();

    expect(linkedAudit?.after).toMatchObject({
      hazardId,
      correctiveActionId: first.body.correctiveAction.id,
    });
  });

  it("rejects a hazard that does not belong to the assessment", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const first = await createAssessment(
      officer.authorization,
      project._id,
      officer.user._id,
      site._id,
    );
    const second = await createAssessment(
      officer.authorization,
      project._id,
      officer.user._id,
      site._id,
    );

    const response = await raiseTreatment(
      officer.authorization,
      first.body.riskAssessment.id,
      second.body.riskAssessment.hazards[0].id,
      officer.user._id,
    );

    expect(response.status).toBe(404);
    expect(await CorrectiveAction.countDocuments({})).toBe(0);
  });

  it("rejects forged provenance and generic source creation", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });

    const created = await createAssessment(
      officer.authorization,
      project._id,
      officer.user._id,
      site._id,
    );
    const assessment = created.body.riskAssessment;

    const forgedProject = await raiseTreatment(
      officer.authorization,
      assessment.id,
      assessment.hazards[0].id,
      officer.user._id,
      { projectId: String(project._id) },
    );
    const generic = await request(app)
      .post("/api/corrective-actions")
      .set("Authorization", officer.authorization)
      .send({
        description: "Pretend this came from a hazard",
        source: "RISK_ASSESSMENT",
        projectId: String(project._id),
        assignedTo: String(officer.user._id),
        dueDate: dueInDays(7),
      });

    expect(forgedProject.status).toBe(400);
    expect(generic.status).toBe(400);
    expect(await CorrectiveAction.countDocuments({})).toBe(0);
  });

  it("blocks treatment actions on archived assessments", async () => {
    const { project, site } = await createSite();
    const officer = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await createAssessment(
      officer.authorization,
      project._id,
      officer.user._id,
      site._id,
    );
    const assessment = created.body.riskAssessment;

    await request(app)
      .patch(`/api/risk-assessments/${assessment.id}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "ARCHIVED" });

    const response = await raiseTreatment(
      officer.authorization,
      assessment.id,
      assessment.hazards[0].id,
      officer.user._id,
    );

    expect(response.status).toBe(409);
    expect(await CorrectiveAction.countDocuments({})).toBe(0);
  });
});
