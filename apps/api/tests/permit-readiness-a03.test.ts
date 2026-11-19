import { afterEach, describe, expect, it } from "vitest";
import {
  A03_CANDIDATE_POLICY,
  A03_CANDIDATE_VERSION,
  A03_DECISION_IDS,
  A03_OPEN_DECISIONS,
  A03_REQUIREMENT_MAPPINGS,
  activePermitPolicyVersion,
  a03RequirementsBlockedBy,
  configurePermitReadiness,
  evaluatePermitReadiness,
  getActivePermitReadinessPolicy,
  getPermitReadinessPolicy,
} from "../src/lib/permit-readiness.js";

afterEach(() => {
  configurePermitReadiness();
});

describe("A03 readiness candidate", () => {
  it("is registered as a draft candidate and cannot be activated", () => {
    configurePermitReadiness();

    expect(activePermitPolicyVersion()).toBeNull();
    expect(getActivePermitReadinessPolicy()).toBeNull();

    const candidate = getPermitReadinessPolicy(A03_CANDIDATE_VERSION);

    expect(candidate).toBe(A03_CANDIDATE_POLICY);
    expect(candidate).toMatchObject({
      version: 2,
      source: {
        documentId: "IKNL-QHSE-DOPR-002",
        revision: "A03",
        dated: "2026-10-28",
        status: "DRAFT",
      },
      approvedForActivation: false,
    });
    expect(candidate?.requirements).toHaveLength(
      A03_REQUIREMENT_MAPPINGS.length,
    );
    expect(candidate?.gates).toEqual({
      approve: [],
      activate: [],
      resume: [],
    });

    expect(() =>
      configurePermitReadiness({ activeVersion: A03_CANDIDATE_VERSION }),
    ).toThrow(/not approved for activation/);
  });

  it("defines one unique mapping for every candidate requirement", () => {
    const ids = A03_REQUIREMENT_MAPPINGS.map((mapping) => mapping.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(A03_CANDIDATE_POLICY.requirements).toEqual(
      A03_REQUIREMENT_MAPPINGS.map(({ id, label }) => ({ id, label })),
    );

    for (const mapping of A03_REQUIREMENT_MAPPINGS) {
      expect(mapping.label.trim().length).toBeGreaterThan(0);
      expect(mapping.a03Reference.trim().length).toBeGreaterThan(0);
      expect(
        mapping.existingFacts.length + mapping.futureFactSources.length,
      ).toBeGreaterThan(0);

      for (const decisionId of mapping.blockedBy) {
        expect(A03_DECISION_IDS).toContain(decisionId);
      }

      if (mapping.enforcement === "BLOCKED") {
        expect(mapping.blockedBy.length).toBeGreaterThan(0);
      }
    }
  });

  it("maps existing Permit facts and identified future sources", () => {
    const byId = new Map(
      A03_REQUIREMENT_MAPPINGS.map((mapping) => [mapping.id, mapping]),
    );

    expect(byId.get("scope_and_permit_type")?.existingFacts).toEqual(
      expect.arrayContaining([
        "workDescription",
        "workType",
        "validFrom",
        "validTo",
      ]),
    );
    expect(byId.get("current_risk_assessment")?.existingFacts).toContain(
      "riskAssessments",
    );
    expect(byId.get("independent_approval")?.existingFacts).toContain(
      "canApprovePermit",
    );
    expect(byId.get("closeout_and_handback")?.existingFacts).toContain(
      "closureChecks",
    );
    expect(byId.get("records_attributable")?.existingFacts).toEqual(
      expect.arrayContaining(["createdBy", "approvedBy", "closedBy"]),
    );

    expect(byId.get("worksite_verification")?.futureFactSources.length)
      .toBeGreaterThan(0);
    expect(byId.get("worker_briefing")?.futureFactSources.length)
      .toBeGreaterThan(0);
    expect(byId.get("revalidation_before_restart")?.futureFactSources.length)
      .toBeGreaterThan(0);
  });

  it("records unresolved decisions instead of inventing rules", () => {
    const decisions = new Map(
      A03_OPEN_DECISIONS.map((decision) => [decision.id, decision]),
    );

    for (const decisionId of [
      "authority_limits",
      "retrospective_cutoff",
      "client_requirements_source",
      "competence_medical_source",
      "stop_work_authority",
    ] as const) {
      expect(decisions.get(decisionId)?.scope).toBe("ENFORCEMENT");
      expect(decisions.get(decisionId)?.detail.trim().length)
        .toBeGreaterThan(0);
    }

    expect(a03RequirementsBlockedBy("authority_limits")).toContain(
      "authorized_issuer",
    );
    expect(a03RequirementsBlockedBy("retrospective_cutoff")).toContain(
      "no_retrospective_permit",
    );
    expect(a03RequirementsBlockedBy("client_requirements_source")).toContain(
      "client_requirements",
    );
    expect(a03RequirementsBlockedBy("competence_medical_source")).toContain(
      "personnel_competence",
    );
    expect(a03RequirementsBlockedBy("stop_work_authority")).toContain(
      "stop_work_authority",
    );

    for (const decision of A03_OPEN_DECISIONS.filter(
      (candidate) => candidate.scope === "ENFORCEMENT",
    )) {
      expect(a03RequirementsBlockedBy(decision.id).length).toBeGreaterThan(0);
    }

    expect(decisions.get("existing_permit_transition")?.scope).toBe("ROLLOUT");
    expect(decisions.get("evidence_retention")?.scope).toBe("ROLLOUT");
  });

  it("preserves M5 grandfathering and leaves the candidate ungated", () => {
    expect(
      evaluatePermitReadiness(
        { policyVersion: null },
        A03_CANDIDATE_POLICY,
        {},
        "approve",
      ),
    ).toEqual({
      policyVersion: null,
      applicable: false,
      transition: "approve",
      unmet: [],
    });

    expect(
      evaluatePermitReadiness(
        { policyVersion: 999 },
        A03_CANDIDATE_POLICY,
        {},
        "activate",
      ),
    ).toMatchObject({ applicable: false, unmet: [] });

    for (const transition of ["approve", "activate", "resume"] as const) {
      expect(
        evaluatePermitReadiness(
          { policyVersion: A03_CANDIDATE_VERSION },
          A03_CANDIDATE_POLICY,
          {},
          transition,
        ),
      ).toMatchObject({ applicable: true, transition, unmet: [] });
    }

    // Without a transition every requirement is listed, but no route uses this
    // mode and every gate remains empty.
    const allRequirements = evaluatePermitReadiness(
      { policyVersion: A03_CANDIDATE_VERSION },
      A03_CANDIDATE_POLICY,
      {},
    );

    expect(allRequirements.unmet).toHaveLength(
      A03_REQUIREMENT_MAPPINGS.length,
    );

    const satisfied = Object.fromEntries(
      A03_REQUIREMENT_MAPPINGS.map((mapping) => [mapping.id, true]),
    );

    expect(
      evaluatePermitReadiness(
        { policyVersion: A03_CANDIDATE_VERSION },
        A03_CANDIDATE_POLICY,
        satisfied,
      ).unmet,
    ).toEqual([]);
  });

  it("keeps the original version 1 working draft unchanged", () => {
    const workingDraft = getPermitReadinessPolicy(1);

    expect(workingDraft).toMatchObject({
      version: 1,
      approvedForActivation: false,
      source: { status: "DRAFT" },
    });
    expect(workingDraft?.requirements).toEqual([]);
    expect(() => configurePermitReadiness({ activeVersion: 1 })).toThrow(
      /not approved for activation/,
    );
  });
});
