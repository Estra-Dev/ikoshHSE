import { describe, expect, it } from "vitest";
import {
  buildCorrectiveActionFilterSearchParams,
  CORRECTIVE_ACTION_PAGE_SIZE,
  correctiveActionDetailHref,
  hasActiveCorrectiveActionFilters,
  isCorrectiveActionOverdue,
  isCorrectiveActionTerminal,
  nextCorrectiveActionStatuses,
  parseCorrectiveActionFilters,
  EMPTY_CORRECTIVE_ACTION_FILTERS,
} from "./corrective-actions";

describe("corrective action filters", () => {
  it("falls back safely for malformed URL values", () => {
    const filters = parseCorrectiveActionFilters(
      new URLSearchParams({
        siteId: "not-an-id",
        status: "UNKNOWN",
        source: "SOMETHING",
        overdue: "yes",
        page: "-3",
        limit: "9999",
      }),
    );

    expect(filters).toEqual({
      siteId: "",
      status: "",
      source: "",
      overdue: false,
      page: 1,
      limit: CORRECTIVE_ACTION_PAGE_SIZE,
    });
  });

  it("parses valid filters and omits defaults from the URL", () => {
    const filters = parseCorrectiveActionFilters(
      new URLSearchParams({
        siteId: "507f1f77bcf86cd799439011",
        status: "IN_PROGRESS",
        source: "INCIDENT",
        overdue: "true",
        page: "3",
        limit: "50",
      }),
    );

    expect(filters).toEqual({
      siteId: "507f1f77bcf86cd799439011",
      status: "IN_PROGRESS",
      source: "INCIDENT",
      overdue: true,
      page: 3,
      limit: 50,
    });

    const params = buildCorrectiveActionFilterSearchParams(
      EMPTY_CORRECTIVE_ACTION_FILTERS,
    );

    expect(params.toString()).toBe("");
  });

  it("detects whether any filter is active apart from paging", () => {
    expect(
      hasActiveCorrectiveActionFilters(EMPTY_CORRECTIVE_ACTION_FILTERS),
    ).toBe(false);
    expect(
      hasActiveCorrectiveActionFilters({
        ...EMPTY_CORRECTIVE_ACTION_FILTERS,
        page: 4,
      }),
    ).toBe(false);
    expect(
      hasActiveCorrectiveActionFilters({
        ...EMPTY_CORRECTIVE_ACTION_FILTERS,
        overdue: true,
      }),
    ).toBe(true);
  });
});

describe("corrective action workflow", () => {
  it("mirrors the forward-only transitions", () => {
    expect(nextCorrectiveActionStatuses("OPEN")).toEqual(["IN_PROGRESS"]);
    expect(nextCorrectiveActionStatuses("IN_PROGRESS")).toEqual(["COMPLETED"]);
    expect(nextCorrectiveActionStatuses("COMPLETED")).toEqual(["VERIFIED"]);
    expect(nextCorrectiveActionStatuses("VERIFIED")).toEqual([]);
    expect(isCorrectiveActionTerminal("VERIFIED")).toBe(true);
    expect(isCorrectiveActionTerminal("COMPLETED")).toBe(false);
  });

  it("flags overdue open and in-progress actions only", () => {
    const past = "2020-01-01T00:00:00.000Z";
    const future = "2999-01-01T00:00:00.000Z";

    expect(isCorrectiveActionOverdue({ dueDate: past, status: "OPEN" })).toBe(
      true,
    );
    expect(
      isCorrectiveActionOverdue({ dueDate: past, status: "IN_PROGRESS" }),
    ).toBe(true);
    expect(
      isCorrectiveActionOverdue({ dueDate: past, status: "COMPLETED" }),
    ).toBe(false);
    expect(
      isCorrectiveActionOverdue({ dueDate: past, status: "VERIFIED" }),
    ).toBe(false);
    expect(
      isCorrectiveActionOverdue({ dueDate: future, status: "OPEN" }),
    ).toBe(false);
  });

  it("builds the canonical detail route", () => {
    expect(correctiveActionDetailHref("507f1f77bcf86cd799439011")).toBe(
      "/corrective-actions/507f1f77bcf86cd799439011",
    );
  });
});
