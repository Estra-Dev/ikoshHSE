import { describe, expect, it } from "vitest";
import {
  buildPermitOperationalRecordPayload,
  canRecordPermitOperationalRecord,
  MAX_OPERATIONAL_RECORD_ATTACHMENTS,
  MAX_OPERATIONAL_RECORD_NOTES_LENGTH,
  PERMIT_OPERATIONAL_RECORD_TYPE_LABELS,
  PERMIT_OPERATIONAL_RECORD_WRITABLE_STATUSES,
  permitOperationalRecordLabel,
  sortPermitOperationalRecords,
  validatePermitOperationalRecordDraft,
} from "./permit-operational-records";
import type { PermitStatus } from "./api/types";

describe("permit operational record payload", () => {
  it("contains only the type and trimmed notes when no attachments are supplied", () => {
    const payload = buildPermitOperationalRecordPayload({
      type: "MONITORING_CHECK",
      notes: "  Area checked; controls in place.  ",
    });

    expect(Object.keys(payload).sort()).toEqual(["notes", "type"]);
    expect(payload).toEqual({
      type: "MONITORING_CHECK",
      notes: "Area checked; controls in place.",
    });
  });

  it("adds only deduplicated attachment ids when supplied", () => {
    const payload = buildPermitOperationalRecordPayload({
      type: "REVALIDATION",
      notes: "Revalidated after shift handover.",
      attachmentIds: ["b", "a", "b", "  a  ", ""],
    });

    expect(Object.keys(payload).sort()).toEqual([
      "attachmentIds",
      "notes",
      "type",
    ]);
    expect(payload.attachmentIds).toEqual(["b", "a"]);
  });

  it("does not include client actor, timestamp or status fields", () => {
    const payload = buildPermitOperationalRecordPayload({
      type: "MONITORING_CHECK",
      notes: "Checked.",
      // @ts-expect-error deliberately unsupported client-supplied fields
      recordedBy: "forged",
      recordedAt: "2020-01-01T00:00:00.000Z",
      status: "CLOSED",
    });

    expect(Object.keys(payload).sort()).toEqual(["notes", "type"]);
  });
});

describe("permit operational record validation", () => {
  it("requires non-empty notes", () => {
    expect(
      validatePermitOperationalRecordDraft({
        type: "MONITORING_CHECK",
        notes: "   ",
      }),
    ).toMatch(/notes/i);
  });

  it("rejects notes beyond the server limit", () => {
    expect(
      validatePermitOperationalRecordDraft({
        type: "MONITORING_CHECK",
        notes: "a".repeat(MAX_OPERATIONAL_RECORD_NOTES_LENGTH + 1),
      }),
    ).toMatch(/2000/);
  });

  it("rejects more than the server attachment limit", () => {
    expect(
      validatePermitOperationalRecordDraft({
        type: "REVALIDATION",
        notes: "Valid notes.",
        attachmentIds: Array.from(
          { length: MAX_OPERATIONAL_RECORD_ATTACHMENTS + 1 },
          (_, index) => `attachment-${index}`,
        ),
      }),
    ).toMatch(/20/);
  });

  it("accepts a valid draft", () => {
    expect(
      validatePermitOperationalRecordDraft({
        type: "REVALIDATION",
        notes: "Valid notes.",
        attachmentIds: ["attachment-1"],
      }),
    ).toBeNull();
  });
});

describe("permit operational record labels and sorting", () => {
  it("preserves the two exact event types", () => {
    expect(PERMIT_OPERATIONAL_RECORD_TYPE_LABELS).toEqual({
      MONITORING_CHECK: "Monitoring check",
      REVALIDATION: "Revalidation",
    });
    expect(permitOperationalRecordLabel("MONITORING_CHECK")).toBe(
      "Monitoring check",
    );
    expect(permitOperationalRecordLabel("REVALIDATION")).toBe("Revalidation");
  });

  it("sorts newest first and breaks timestamp ties by descending id", () => {
    const records = [
      { id: "a", recordedAt: "2026-01-01T10:00:00.000Z" },
      { id: "c", recordedAt: "2026-01-02T10:00:00.000Z" },
      { id: "b", recordedAt: "2026-01-01T10:00:00.000Z" },
    ];

    expect(sortPermitOperationalRecords(records).map((record) => record.id)).toEqual(
      ["c", "b", "a"],
    );
  });
});

describe("permit operational record status gate", () => {
  it("allows only approved, active and suspended permits", () => {
    expect(PERMIT_OPERATIONAL_RECORD_WRITABLE_STATUSES).toEqual([
      "APPROVED",
      "ACTIVE",
      "SUSPENDED",
    ]);

    const allowed: PermitStatus[] = ["APPROVED", "ACTIVE", "SUSPENDED"];
    const blocked: PermitStatus[] = [
      "DRAFT",
      "SUBMITTED",
      "CLOSED",
      "REJECTED",
      "CANCELLED",
    ];

    for (const status of allowed) {
      expect(canRecordPermitOperationalRecord("HSE_OFFICER", status)).toBe(true);
    }

    for (const status of blocked) {
      expect(canRecordPermitOperationalRecord("HSE_OFFICER", status)).toBe(
        false,
      );
    }
  });

  it("requires an operating role", () => {
    expect(canRecordPermitOperationalRecord("ADMIN", "ACTIVE")).toBe(true);
    expect(canRecordPermitOperationalRecord("SUPERVISOR", "ACTIVE")).toBe(true);
    expect(canRecordPermitOperationalRecord(undefined, "ACTIVE")).toBe(false);
  });
});
