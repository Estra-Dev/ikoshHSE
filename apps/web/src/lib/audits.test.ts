import { describe, expect, it } from "vitest";
import {
  AUDIT_PAGE_SIZE,
  auditChecklistProgress,
  auditDetailHref,
  buildAuditFilterSearchParams,
  EMPTY_AUDIT_FILTERS,
  hasActiveAuditFilters,
  isAuditChecklistResult,
  isAuditOpen,
  isAuditOverdue,
  isAuditTerminal,
  nextAuditStatuses,
  parseAuditFilters,
  type AuditFilterState,
} from "./audits";

const SITE_ID = "507f1f77bcf86cd799439011";
const AUDITOR_ID = "507f1f77bcf86cd799439012";

describe("parseAuditFilters", () => {
  it("returns the default state for an empty query string", () => {
    expect(parseAuditFilters(new URLSearchParams())).toEqual(
      EMPTY_AUDIT_FILTERS,
    );
  });

  it("falls back safely for malformed values", () => {
    const parsed = parseAuditFilters(
      new URLSearchParams({
        status: "OPEN",
        type: "AUDIT",
        siteId: "not-an-object-id",
        auditorId: "also-bad",
        page: "0",
        limit: "500",
      }),
    );

    expect(parsed).toEqual(EMPTY_AUDIT_FILTERS);
  });

  it("round-trips a fully populated filter state", () => {
    const filters: AuditFilterState = {
      q: "permit",
      status: "IN_PROGRESS",
      type: "SUPPLIER",
      siteId: SITE_ID,
      auditorId: AUDITOR_ID,
      page: 3,
      limit: 50,
    };

    const params = buildAuditFilterSearchParams(filters);

    expect(parseAuditFilters(params)).toEqual(filters);
  });

  it("omits defaults from the URL", () => {
    expect(
      buildAuditFilterSearchParams(EMPTY_AUDIT_FILTERS).toString(),
    ).toBe("");
  });

  it("detects active filters but ignores paging", () => {
    expect(
      hasActiveAuditFilters({ ...EMPTY_AUDIT_FILTERS, page: 4 }),
    ).toBe(false);
    expect(
      hasActiveAuditFilters({ ...EMPTY_AUDIT_FILTERS, status: "PLANNED" }),
    ).toBe(true);
    expect(
      hasActiveAuditFilters({ ...EMPTY_AUDIT_FILTERS, auditorId: AUDITOR_ID }),
    ).toBe(true);
  });

  it("caps the page size", () => {
    const parsed = parseAuditFilters(
      new URLSearchParams({ limit: "1000" }),
    );

    expect(parsed.limit).toBe(AUDIT_PAGE_SIZE);
  });
});

describe("audit workflow", () => {
  it("mirrors the server transitions", () => {
    expect(nextAuditStatuses("PLANNED")).toEqual([
      "IN_PROGRESS",
      "CANCELLED",
    ]);
    expect(nextAuditStatuses("IN_PROGRESS")).toEqual([
      "COMPLETED",
      "CANCELLED",
    ]);
    expect(nextAuditStatuses("COMPLETED")).toEqual([]);
    expect(nextAuditStatuses("CANCELLED")).toEqual([]);
  });

  it("treats completed and cancelled as terminal", () => {
    expect(isAuditTerminal("COMPLETED")).toBe(true);
    expect(isAuditTerminal("CANCELLED")).toBe(true);
    expect(isAuditTerminal("PLANNED")).toBe(false);
  });

  it("treats planned and in-progress as open", () => {
    expect(isAuditOpen("PLANNED")).toBe(true);
    expect(isAuditOpen("IN_PROGRESS")).toBe(true);
    expect(isAuditOpen("COMPLETED")).toBe(false);
    expect(isAuditOpen("CANCELLED")).toBe(false);
  });

  it("builds the canonical detail route", () => {
    expect(auditDetailHref("abc")).toBe("/audits/abc");
  });
});

describe("audit checklist helpers", () => {
  it("counts assessed and outcome totals", () => {
    expect(
      auditChecklistProgress([
        { result: "PENDING" },
        { result: "COMPLIANT" },
        { result: "NON_COMPLIANT" },
        { result: "NOT_APPLICABLE" },
      ]),
    ).toEqual({
      total: 4,
      assessed: 3,
      compliant: 1,
      nonCompliant: 1,
      notApplicable: 1,
    });

    expect(auditChecklistProgress([])).toEqual({
      total: 0,
      assessed: 0,
      compliant: 0,
      nonCompliant: 0,
      notApplicable: 0,
    });
  });

  it("recognizes only known checklist results", () => {
    expect(isAuditChecklistResult("COMPLIANT")).toBe(true);
    expect(isAuditChecklistResult("PENDING")).toBe(true);
    expect(isAuditChecklistResult("PASSED")).toBe(false);
    expect(isAuditChecklistResult(undefined)).toBe(false);
  });
});

describe("isAuditOverdue", () => {
  const now = Date.parse("2026-05-01T12:00:00.000Z");

  it("flags open audits whose scheduled date has passed", () => {
    expect(
      isAuditOverdue(
        { status: "PLANNED", scheduledFor: "2026-04-30T12:00:00.000Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isAuditOverdue(
        { status: "IN_PROGRESS", scheduledFor: "2026-04-30T12:00:00.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("never flags terminal or future audits", () => {
    expect(
      isAuditOverdue(
        { status: "COMPLETED", scheduledFor: "2026-04-30T12:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isAuditOverdue(
        { status: "PLANNED", scheduledFor: "2026-06-01T12:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });
});
