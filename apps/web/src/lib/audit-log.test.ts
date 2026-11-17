import { describe, expect, it } from "vitest";
import {
  AUDIT_LOG_DEFAULT_LIMIT,
  buildAuditLogSearchParams,
  EMPTY_AUDIT_LOG_QUERY,
  hasActiveAuditLogFilters,
  isValidObjectId,
} from "./audit-log";

describe("audit log query", () => {
  it("omits empty filters and always sends the limit", () => {
    const params = buildAuditLogSearchParams(EMPTY_AUDIT_LOG_QUERY);

    expect(params.get("entityType")).toBeNull();
    expect(params.get("entityId")).toBeNull();
    expect(params.get("action")).toBeNull();
    expect(params.get("limit")).toBe(String(AUDIT_LOG_DEFAULT_LIMIT));
  });

  it("sends trimmed exact-match filters", () => {
    const params = buildAuditLogSearchParams({
      entityType: " CorrectiveAction ",
      entityId: "507f1f77bcf86cd799439011",
      action: " corrective_action.updated ",
      limit: 25,
    });

    expect(params.get("entityType")).toBe("CorrectiveAction");
    expect(params.get("entityId")).toBe("507f1f77bcf86cd799439011");
    expect(params.get("action")).toBe("corrective_action.updated");
    expect(params.get("limit")).toBe("25");
  });

  it("drops an invalid entity id instead of sending a bad request", () => {
    const params = buildAuditLogSearchParams({
      ...EMPTY_AUDIT_LOG_QUERY,
      entityId: "not-an-id",
    });

    expect(params.get("entityId")).toBeNull();
  });

  it("detects active filters excluding the limit", () => {
    expect(hasActiveAuditLogFilters(EMPTY_AUDIT_LOG_QUERY)).toBe(false);
    expect(
      hasActiveAuditLogFilters({
        ...EMPTY_AUDIT_LOG_QUERY,
        limit: 100,
      }),
    ).toBe(false);
    expect(
      hasActiveAuditLogFilters({
        ...EMPTY_AUDIT_LOG_QUERY,
        action: "incident.created",
      }),
    ).toBe(true);
  });

  it("validates Mongo object ids", () => {
    expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
    expect(isValidObjectId("507F1F77BCF86CD799439011")).toBe(true);
    expect(isValidObjectId("507f1f77bcf86cd79943901")).toBe(false);
    expect(isValidObjectId("zzzzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });
});
