import { describe, expect, it } from "vitest";
import {
  canRecordPermitReadiness,
  canViewPermitReadiness,
  isPermitReadinessRequirementSatisfied,
  PERMIT_READINESS_DRAFT_PREVIEW_NOTICE,
  PERMIT_READINESS_EVALUATION_STATES,
  PERMIT_READINESS_STATE_LABELS,
  permitReadinessStateLabel,
  summarizePermitReadiness,
} from "./permit-readiness";

const DRAFT_PERMIT = {
  status: "DRAFT" as const,
  responsiblePerson: { id: "responsible" },
  createdBy: { id: "creator" },
};

describe("permit readiness evaluation semantics", () => {
  it("mirrors the five server states", () => {
    expect(PERMIT_READINESS_EVALUATION_STATES).toEqual([
      "AUTOMATIC",
      "RECORDED",
      "BLOCKED",
      "NOT_APPLICABLE",
      "OUTSTANDING",
    ]);
  });

  it("treats only AUTOMATIC and RECORDED as satisfied", () => {
    expect(isPermitReadinessRequirementSatisfied("AUTOMATIC")).toBe(true);
    expect(isPermitReadinessRequirementSatisfied("RECORDED")).toBe(true);
    expect(isPermitReadinessRequirementSatisfied("BLOCKED")).toBe(false);
    expect(isPermitReadinessRequirementSatisfied("OUTSTANDING")).toBe(false);
    expect(isPermitReadinessRequirementSatisfied("NOT_APPLICABLE")).toBe(false);
  });

  it("labels every state without changing its meaning", () => {
    expect(PERMIT_READINESS_STATE_LABELS).toEqual({
      AUTOMATIC: "Automatic",
      RECORDED: "Recorded",
      BLOCKED: "Blocked",
      NOT_APPLICABLE: "Not applicable",
      OUTSTANDING: "Outstanding",
    });
    expect(permitReadinessStateLabel("NOT_APPLICABLE")).toBe("Not applicable");
  });

  it("summarises requirement counts with the same satisfied rule", () => {
    const summary = summarizePermitReadiness([
      { state: "AUTOMATIC" },
      { state: "RECORDED" },
      { state: "OUTSTANDING" },
      { state: "BLOCKED" },
      { state: "NOT_APPLICABLE" },
    ]);

    expect(summary).toEqual({
      total: 5,
      satisfied: 2,
      outstanding: 1,
      blocked: 1,
      notApplicable: 1,
    });
  });
});

describe("permit readiness notice", () => {
  it("uses the exact informational notice", () => {
    expect(PERMIT_READINESS_DRAFT_PREVIEW_NOTICE).toBe(
      "A03 DRAFT PREVIEW — informational only; it does not approve, activate, resume, or block a permit.",
    );
  });
});

describe("permit readiness permissions", () => {
  it("allows capture only on drafts for authors or HSE management", () => {
    expect(canRecordPermitReadiness("SUPERVISOR", "creator", DRAFT_PERMIT)).toBe(
      true,
    );
    expect(
      canRecordPermitReadiness("SUPERVISOR", "responsible", DRAFT_PERMIT),
    ).toBe(true);
    expect(canRecordPermitReadiness("SUPERVISOR", "someone-else", DRAFT_PERMIT)).toBe(
      false,
    );
    expect(canRecordPermitReadiness("HSE_MANAGER", "someone-else", DRAFT_PERMIT)).toBe(
      true,
    );
    expect(
      canRecordPermitReadiness("HSE_MANAGER", "someone-else", {
        ...DRAFT_PERMIT,
        status: "SUBMITTED",
      }),
    ).toBe(false);
    expect(canRecordPermitReadiness(undefined, "creator", DRAFT_PERMIT)).toBe(
      false,
    );
  });

  it("allows the preview for the same roles that can view permits", () => {
    expect(canViewPermitReadiness("SUPERVISOR")).toBe(true);
    expect(canViewPermitReadiness("HSE_OFFICER")).toBe(true);
    expect(canViewPermitReadiness(undefined)).toBe(false);
  });
});
