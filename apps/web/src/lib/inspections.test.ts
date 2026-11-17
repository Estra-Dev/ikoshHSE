import { describe, expect, it } from "vitest";
import {
  buildInspectionFilterSearchParams,
  compareInspectionSeverity,
  EMPTY_INSPECTION_FILTERS,
  hasActiveInspectionFilters,
  inspectionDetailHref,
  INSPECTION_PAGE_SIZE,
  isInspectionOpen,
  isInspectionOverdue,
  isInspectionTerminal,
  nextInspectionStatuses,
  parseInspectionFilters,
} from "./inspections";

describe("inspection filters", () => {
  it("falls back safely for malformed URL values", () => {
    const filters = parseInspectionFilters(
      new URLSearchParams({
        q: "  ",
        status: "UNKNOWN",
        type: "SOMETHING",
        siteId: "not-an-id",
        inspectorId: "nope",
        page: "-3",
        limit: "9999",
      }),
    );

    expect(filters).toEqual(EMPTY_INSPECTION_FILTERS);
  });

  it("parses valid filters and omits defaults from the URL", () => {
    const filters = parseInspectionFilters(
      new URLSearchParams({
        q: "scaffold",
        status: "IN_PROGRESS",
        type: "FOCUSED",
        siteId: "507f1f77bcf86cd799439011",
        inspectorId: "507f1f77bcf86cd799439012",
        page: "3",
        limit: "50",
      }),
    );

    expect(filters).toEqual({
      q: "scaffold",
      status: "IN_PROGRESS",
      type: "FOCUSED",
      siteId: "507f1f77bcf86cd799439011",
      inspectorId: "507f1f77bcf86cd799439012",
      page: 3,
      limit: 50,
    });

    const params = buildInspectionFilterSearchParams(EMPTY_INSPECTION_FILTERS);

    expect(params.toString()).toBe("");
  });

  it("truncates oversized search text", () => {
    const filters = parseInspectionFilters(
      new URLSearchParams({ q: "a".repeat(500) }),
    );

    expect(filters.q).toHaveLength(200);
  });

  it("detects whether any filter is active apart from paging", () => {
    expect(hasActiveInspectionFilters(EMPTY_INSPECTION_FILTERS)).toBe(false);
    expect(
      hasActiveInspectionFilters({
        ...EMPTY_INSPECTION_FILTERS,
        page: 4,
      }),
    ).toBe(false);

    for (const active of [
      { q: "scaffold" },
      { status: "SCHEDULED" as const },
      { type: "ROUTINE" as const },
      { siteId: "507f1f77bcf86cd799439011" },
      { inspectorId: "507f1f77bcf86cd799439012" },
    ]) {
      expect(
        hasActiveInspectionFilters({
          ...EMPTY_INSPECTION_FILTERS,
          ...active,
        }),
      ).toBe(true);
    }
  });
});

describe("inspection workflow", () => {
  it("mirrors the forward-only transitions", () => {
    expect(nextInspectionStatuses("SCHEDULED")).toEqual([
      "IN_PROGRESS",
      "CANCELLED",
    ]);
    expect(nextInspectionStatuses("IN_PROGRESS")).toEqual([
      "COMPLETED",
      "CANCELLED",
    ]);
    expect(nextInspectionStatuses("COMPLETED")).toEqual([]);
    expect(nextInspectionStatuses("CANCELLED")).toEqual([]);

    expect(isInspectionTerminal("COMPLETED")).toBe(true);
    expect(isInspectionTerminal("CANCELLED")).toBe(true);
    expect(isInspectionTerminal("SCHEDULED")).toBe(false);
    expect(isInspectionOpen("SCHEDULED")).toBe(true);
    expect(isInspectionOpen("IN_PROGRESS")).toBe(true);
    expect(isInspectionOpen("COMPLETED")).toBe(false);
  });

  it("flags overdue scheduled and in-progress inspections only", () => {
    const past = "2020-01-01T00:00:00.000Z";
    const future = "2999-01-01T00:00:00.000Z";

    for (const status of ["SCHEDULED", "IN_PROGRESS"] as const) {
      expect(isInspectionOverdue({ scheduledFor: past, status })).toBe(true);
      expect(isInspectionOverdue({ scheduledFor: future, status })).toBe(false);
    }

    for (const status of ["COMPLETED", "CANCELLED"] as const) {
      expect(isInspectionOverdue({ scheduledFor: past, status })).toBe(false);
    }
  });

  it("orders severities from most to least serious", () => {
    expect(compareInspectionSeverity("CRITICAL", "LOW")).toBeLessThan(0);
    expect(compareInspectionSeverity("LOW", "CRITICAL")).toBeGreaterThan(0);
    expect(compareInspectionSeverity("HIGH", "HIGH")).toBe(0);
  });

  it("builds the canonical detail route", () => {
    expect(inspectionDetailHref("507f1f77bcf86cd799439011")).toBe(
      "/inspections/507f1f77bcf86cd799439011",
    );
  });

  it("uses a 20-row default page size", () => {
    expect(INSPECTION_PAGE_SIZE).toBe(20);
  });
});
