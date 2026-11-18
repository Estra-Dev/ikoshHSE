import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Permit } from "../src/models/Permit.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import {
  activePermitPolicyVersion,
  configurePermitReadiness,
  evaluatePermitReadiness,
  getActivePermitReadinessPolicy,
  type PermitReadinessPolicy,
} from "../src/lib/permit-readiness.js";
import { signInAsIkoshUser } from "./helpers.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let sequence = 0;

const TEST_POLICY_VERSION = 42;

const TEST_POLICY: PermitReadinessPolicy = {
  version: TEST_POLICY_VERSION,
  source: {
    documentId: "TEST-DOC-001",
    revision: "T1",
    dated: "2026-11-18",
    status: "APPROVED",
  },
  approvedForActivation: true,
  requirements: [],
  gates: { approve: [], activate: [], resume: [] },
};

const TEST_REGISTRY = new Map<number, PermitReadinessPolicy>([
  [TEST_POLICY.version, TEST_POLICY],
]);

afterEach(() => {
  configurePermitReadiness();
});

async function createSite() {
  sequence += 1;

  const project = await Project.create({
    name: `Readiness Project ${sequence}`,
    code: `RDY${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `Readiness Site ${sequence}`,
    code: `RSITE${sequence}`,
    status: "ACTIVE",
  });

  return { project, site };
}

function permitBody(
  projectId: unknown,
  siteId: unknown,
  responsiblePersonId: unknown,
) {
  const now = Date.now();

  return {
    workDescription: "Confined space inspection of the process vessel",
    workType: "CONFINED_SPACE_ENTRY",
    projectId: String(projectId),
    siteId: String(siteId),
    location: "Process area, vessel V-204",
    validFrom: new Date(now - HOUR).toISOString(),
    validTo: new Date(now + DAY).toISOString(),
    responsiblePersonId: String(responsiblePersonId),
    workersInvolved: ["Ade Worker — entrant", "Bola Helper — standby"],
    requiredPrecautions: ["PPE", "GAS_TESTING"],
    hazards: [
      {
        hazard: "Oxygen-deficient atmosphere",
        controlMeasures: "Gas testing before entry and continuous monitoring",
      },
    ],
  };
}

function createPermit(authorization: string, body: Record<string, unknown>) {
  return request(app)
    .post("/api/permits")
    .set("Authorization", authorization)
    .send(body);
}

async function createPermitFixture() {
  const { project, site } = await createSite();
  const creator = await signInAsIkoshUser({
    ikoshRole: "HSE_OFFICER",
    assignedSites: [site._id],
  });
  const responsible = await signInAsIkoshUser({
    ikoshRole: "SUPERVISOR",
    assignedSites: [site._id],
  });
  const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

  const created = await createPermit(
    creator.authorization,
    permitBody(project._id, site._id, responsible.user._id),
  );

  expect(created.status).toBe(201);

  return {
    creator,
    responsible,
    manager,
    permitId: created.body.permit.id as string,
  };
}

describe("permit readiness registry", () => {
  it("keeps production dormant and refuses to activate the draft policy", () => {
    configurePermitReadiness();

    expect(activePermitPolicyVersion()).toBeNull();
    expect(getActivePermitReadinessPolicy()).toBeNull();

    // Version 1 is the A03 working draft.
    expect(() => configurePermitReadiness({ activeVersion: 1 })).toThrow(
      /not approved for activation/,
    );
    expect(() => configurePermitReadiness({ activeVersion: 999 })).toThrow(
      /unknown permit readiness policy/,
    );
  });

  it("refuses activation unless the source is approved and flagged", () => {
    const draftWithFlag: PermitReadinessPolicy = {
      ...TEST_POLICY,
      source: { ...TEST_POLICY.source, status: "DRAFT" },
    };
    const approvedWithoutFlag: PermitReadinessPolicy = {
      ...TEST_POLICY,
      approvedForActivation: false,
    };

    expect(() =>
      configurePermitReadiness({
        registry: new Map([[draftWithFlag.version, draftWithFlag]]),
        activeVersion: draftWithFlag.version,
      }),
    ).toThrow(/not approved for activation/);

    expect(() =>
      configurePermitReadiness({
        registry: new Map([[approvedWithoutFlag.version, approvedWithoutFlag]]),
        activeVersion: approvedWithoutFlag.version,
      }),
    ).toThrow(/not approved for activation/);

    configurePermitReadiness({
      registry: TEST_REGISTRY,
      activeVersion: TEST_POLICY_VERSION,
    });

    expect(activePermitPolicyVersion()).toBe(TEST_POLICY_VERSION);
  });

  it("rejects policies that gate on undeclared requirements", () => {
    const invalid: PermitReadinessPolicy = {
      ...TEST_POLICY,
      requirements: [{ id: "risk_assessment", label: "Approved JHA" }],
      gates: {
        approve: ["risk_assessment"],
        activate: ["isolation_evidence"],
        resume: [],
      },
    };

    expect(() =>
      configurePermitReadiness({
        registry: new Map([[invalid.version, invalid]]),
      }),
    ).toThrow(/unknown requirement "isolation_evidence"/);
  });
});

describe("evaluatePermitReadiness", () => {
  const policy: PermitReadinessPolicy = {
    version: 7,
    source: {
      documentId: "TEST-DOC-001",
      revision: "T1",
      dated: "2026-11-18",
      status: "APPROVED",
    },
    approvedForActivation: true,
    requirements: [
      { id: "risk_assessment", label: "Approved risk assessment" },
      { id: "isolation_evidence", label: "Isolation evidence" },
    ],
    gates: {
      approve: ["risk_assessment"],
      activate: ["risk_assessment", "isolation_evidence"],
      resume: [],
    },
  };

  it("never invents requirements for grandfathered permits", () => {
    expect(
      evaluatePermitReadiness({ policyVersion: null }, policy, {}, "approve"),
    ).toEqual({
      policyVersion: null,
      applicable: false,
      transition: "approve",
      unmet: [],
    });

    expect(
      evaluatePermitReadiness({}, policy, {}, "activate").applicable,
    ).toBe(false);
  });

  it("stays inert without a matching policy", () => {
    expect(
      evaluatePermitReadiness({ policyVersion: 7 }, null, {}, "approve"),
    ).toMatchObject({ applicable: false, unmet: [] });
    expect(
      evaluatePermitReadiness({ policyVersion: 7 }, undefined, {}, "approve"),
    ).toMatchObject({ applicable: false, unmet: [] });
    expect(
      evaluatePermitReadiness({ policyVersion: 6 }, policy, {}, "approve"),
    ).toMatchObject({ applicable: false, unmet: [] });
  });

  it("applies only the requirements the policy gates for a transition", () => {
    const approve = evaluatePermitReadiness(
      { policyVersion: 7 },
      policy,
      {},
      "approve",
    );
    expect(approve.applicable).toBe(true);
    expect(approve.unmet.map((requirement) => requirement.id)).toEqual([
      "risk_assessment",
    ]);

    const activate = evaluatePermitReadiness(
      { policyVersion: 7 },
      policy,
      { risk_assessment: true },
      "activate",
    );
    expect(activate.unmet.map((requirement) => requirement.id)).toEqual([
      "isolation_evidence",
    ]);

    const resume = evaluatePermitReadiness(
      { policyVersion: 7 },
      policy,
      {},
      "resume",
    );
    expect(resume.applicable).toBe(true);
    expect(resume.unmet).toEqual([]);
  });

  it("treats only an explicit true fact as satisfied", () => {
    const evaluate = (facts: Record<string, boolean | undefined>) =>
      evaluatePermitReadiness(
        { policyVersion: 7 },
        policy,
        facts,
        "activate",
      );

    expect(evaluate({ risk_assessment: true, isolation_evidence: true }).unmet)
      .toEqual([]);
    expect(evaluate({ risk_assessment: true, isolation_evidence: false }).unmet)
      .toHaveLength(1);
    expect(evaluate({}).unmet).toHaveLength(2);
  });
});

describe("permit policyVersion", () => {
  it("stamps the active version at creation only and is immutable afterwards", async () => {
    configurePermitReadiness({
      registry: TEST_REGISTRY,
      activeVersion: TEST_POLICY_VERSION,
    });

    const { creator, permitId } = await createPermitFixture();

    const detail = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization);

    expect(detail.body.permit.policyVersion).toBe(TEST_POLICY_VERSION);

    // Clients cannot set or change the server-controlled value.
    const forged = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization)
      .send({ policyVersion: 99 });
    expect(forged.status).toBe(400);

    const edited = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization)
      .send({ location: "Process area, vessel V-205" });
    expect(edited.status).toBe(200);
    expect(edited.body.permit.policyVersion).toBe(TEST_POLICY_VERSION);

    // Model-level protection: a loaded permit cannot be re-stamped.
    const stored = await Permit.findById(permitId);

    expect(stored).not.toBeNull();
    stored.policyVersion = 99;
    await stored.save().catch(() => undefined);

    // Bulk update paths honour the same immutability.
    await Permit.updateOne({ _id: permitId }, { $set: { policyVersion: 99 } });
    await Permit.findByIdAndUpdate(permitId, { $set: { policyVersion: 99 } });

    const reloaded = await Permit.findById(permitId).lean();
    expect(reloaded?.policyVersion).toBe(TEST_POLICY_VERSION);

    const audit = await AuditLog.findOne({
      entityType: "Permit",
      action: "permit.created",
      entityId: permitId,
    }).lean();

    expect(audit?.after).toMatchObject({
      policyVersion: TEST_POLICY_VERSION,
    });
    expect(JSON.stringify(audit?.after)).not.toContain(
      "Confined space inspection",
    );
  });

  it("grandfathers permits created while no policy is active", async () => {
    configurePermitReadiness();

    const { creator, manager, permitId } = await createPermitFixture();

    const created = await request(app)
      .get(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization);
    expect(created.body.permit.policyVersion).toBeNull();

    const edited = await request(app)
      .patch(`/api/permits/${permitId}`)
      .set("Authorization", creator.authorization)
      .send({ location: "Process area, vessel V-206" });
    expect(edited.status).toBe(200);
    expect(edited.body.permit.policyVersion).toBeNull();

    const submitted = await request(app)
      .patch(`/api/permits/${permitId}/status`)
      .set("Authorization", creator.authorization)
      .send({ status: "SUBMITTED" });
    expect(submitted.status).toBe(200);

    const approved = await request(app)
      .patch(`/api/permits/${permitId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "APPROVED" });
    expect(approved.status).toBe(200);
    expect(approved.body.permit).toMatchObject({
      status: "APPROVED",
      policyVersion: null,
    });
  });
});
