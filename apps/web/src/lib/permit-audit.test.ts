import { describe, expect, it } from "vitest";
import {
  PERMIT_AUDIT_ACTIVITY_LIMIT,
  permitAuditActionLabel,
  summarizePermitAuditEntry,
  type PermitAuditEntryLike,
} from "./permit-audit";

function entry(
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): PermitAuditEntryLike {
  return {
    action,
    actor: { id: "507f1f77bcf86cd799439011" },
    createdAt: "2026-01-01T10:00:00.000Z",
    before,
    after,
  };
}

describe("permit audit action labels", () => {
  it("labels every permit audit action", () => {
    expect(permitAuditActionLabel("permit.created")).toBe("Created");
    expect(permitAuditActionLabel("permit.updated")).toBe("Updated");
    expect(permitAuditActionLabel("permit.status_changed")).toBe(
      "Status changed",
    );
    expect(permitAuditActionLabel("permit.readiness_recorded")).toBe(
      "Readiness recorded",
    );
    expect(permitAuditActionLabel("permit.monitoring_check_recorded")).toBe(
      "Monitoring check recorded",
    );
    expect(permitAuditActionLabel("permit.revalidation_recorded")).toBe(
      "Revalidation recorded",
    );
  });

  it("falls back to a readable label for unknown actions", () => {
    expect(permitAuditActionLabel("permit.mystery_event")).toBe("Mystery event");
  });

  it("uses a bounded audit limit", () => {
    expect(PERMIT_AUDIT_ACTIVITY_LIMIT).toBe(50);
  });
});

describe("permit audit summaries", () => {
  it("shows only the status transition for a status change", () => {
    const summary = summarizePermitAuditEntry(
      entry(
        "permit.status_changed",
        { status: "ACTIVE", workDescription: "confidential work" },
        {
          status: "SUSPENDED",
          notes: "confidential reason",
          workType: "HOT_WORK",
        },
      ),
    );

    expect(summary.changes).toEqual([
      { key: "status", label: "Status", before: "Active", after: "Suspended" },
    ]);
  });

  it("never renders operational notes, filenames or unknown keys", () => {
    const summary = summarizePermitAuditEntry(
      entry("permit.monitoring_check_recorded", null, {
        recordId: "507f1f77bcf86cd799439012",
        permitId: "507f1f77bcf86cd799439013",
        projectId: "507f1f77bcf86cd799439014",
        siteId: "507f1f77bcf86cd799439015",
        type: "MONITORING_CHECK",
        attachmentCount: 2,
        notes: "Confidential free text",
        originalFilename: "secret.pdf",
      }),
    );

    expect(summary.changes.map((change) => change.key)).toEqual([
      "recordId",
      "permitId",
      "projectId",
      "siteId",
      "type",
      "attachmentCount",
    ]);
    expect(summary.changes.find((change) => change.key === "type")?.after).toBe(
      "Monitoring check",
    );
    expect(JSON.stringify(summary)).not.toContain("Confidential");
    expect(JSON.stringify(summary)).not.toContain("secret.pdf");
  });

  it("summarises readiness counts without attestation text", () => {
    const summary = summarizePermitAuditEntry(
      entry("permit.readiness_recorded", null, {
        personnelCount: 2,
        equipmentCount: 1,
        isolationCount: 0,
        gasTestCount: 3,
        worksiteVerificationHistoryCount: 1,
        attestationCount: 1,
        attestations: [{ note: "private declaration" }],
        notes: "private note",
      }),
    );

    expect(summary.changes.map((change) => change.key)).toEqual([
      "personnelCount",
      "equipmentCount",
      "isolationCount",
      "gasTestCount",
      "worksiteVerificationHistoryCount",
      "attestationCount",
    ]);
    expect(JSON.stringify(summary)).not.toContain("private");
    expect(JSON.stringify(summary)).not.toContain("attestations");
  });

  it("formats timestamps and drops non-scalar snapshot values", () => {
    const summary = summarizePermitAuditEntry(
      entry("permit.created", null, {
        status: "DRAFT",
        validTo: "2026-01-05T09:00:00.000Z",
        closureChecks: { workAreaSecured: true },
      }),
    );

    expect(summary.changes.map((change) => change.key)).toEqual([
      "status",
      "validTo",
    ]);
    expect(summary.changes[1]?.after).toMatch(/UTC/);
  });

  it("returns no snapshot fields for unknown actions", () => {
    const summary = summarizePermitAuditEntry(
      entry("permit.mystery_event", { status: "DRAFT" }, { status: "ACTIVE" }),
    );

    expect(summary.changes).toEqual([]);
    expect(summary.actionLabel).toBe("Mystery event");
  });
});
