import { describe, expect, it } from "vitest";
import {
  buildPpeSearchParams,
  formatPpeItemName,
  hasActivePpeFilters,
  isRestockableCondition,
  parsePpeFilters,
  PPE_CATEGORY_LABELS,
  PPE_CONDITION_LABELS,
  PPE_STATUS_LABELS,
  PPE_UNIT_LABELS,
  ppeStockLabel,
} from "./ppe";

describe("PPE labels", () => {
  it("covers every catalogue and lifecycle value", () => {
    expect(Object.keys(PPE_CATEGORY_LABELS)).toHaveLength(10);
    expect(Object.keys(PPE_UNIT_LABELS)).toEqual(["EACH", "PAIR", "SET", "BOX"]);
    expect(Object.keys(PPE_CONDITION_LABELS)).toEqual([
      "NEW",
      "GOOD",
      "FAIR",
      "POOR",
      "DAMAGED",
    ]);
    expect(Object.keys(PPE_STATUS_LABELS)).toEqual([
      "ISSUED",
      "RETURNED",
      "REPLACED",
      "LOST",
    ]);
  });

  it("formats item labels with optional size", () => {
    expect(
      formatPpeItemName({ code: "HELMET", name: "Safety helmet", size: "M" }),
    ).toBe("HELMET · Safety helmet (M)");
    expect(
      formatPpeItemName({ code: null, name: null, size: null }),
    ).toBe("PPE item");
  });
});

describe("PPE stock helpers", () => {
  it("only allows serviceable conditions back into stock", () => {
    expect(isRestockableCondition("NEW")).toBe(true);
    expect(isRestockableCondition("GOOD")).toBe(true);
    expect(isRestockableCondition("FAIR")).toBe(true);
    expect(isRestockableCondition("POOR")).toBe(false);
    expect(isRestockableCondition("DAMAGED")).toBe(false);
  });

  it("prioritises out-of-stock over low stock", () => {
    expect(
      ppeStockLabel({
        isOutOfStock: true,
        isLowStock: false,
        quantityOnHand: 0,
        minimumQuantity: 5,
      }),
    ).toBe("Out of stock");
    expect(
      ppeStockLabel({
        isOutOfStock: false,
        isLowStock: true,
        quantityOnHand: 2,
        minimumQuantity: 5,
      }),
    ).toBe("Low stock · 2 left (minimum 5)");
    expect(
      ppeStockLabel({
        isOutOfStock: false,
        isLowStock: false,
        quantityOnHand: 9,
        minimumQuantity: 5,
      }),
    ).toBe("In stock");
  });
});

describe("PPE issuance filters", () => {
  it("round-trips valid filters", () => {
    const params = buildPpeSearchParams({
      q: "helmet",
      status: "ISSUED",
      kind: "CONTRACTOR",
      projectId: "p1",
      siteId: "s1",
      from: "2026-01-01",
      to: "2026-01-31",
      page: 2,
      limit: 50,
    });

    expect(parsePpeFilters(params)).toEqual({
      q: "helmet",
      status: "ISSUED",
      kind: "CONTRACTOR",
      projectId: "p1",
      siteId: "s1",
      from: "2026-01-01",
      to: "2026-01-31",
      page: 2,
      limit: 50,
    });
  });

  it("drops invalid enums and clamps paging", () => {
    const filters = parsePpeFilters(
      new URLSearchParams({
        status: "UNKNOWN",
        kind: "ROBOT",
        page: "-1",
        limit: "1000",
      }),
    );

    expect(filters.status).toBe("");
    expect(filters.kind).toBe("");
    expect(filters.page).toBe(1);
    expect(filters.limit).toBe(100);
  });

  it("detects active filters", () => {
    expect(hasActivePpeFilters(parsePpeFilters(new URLSearchParams()))).toBe(
      false,
    );
    expect(
      hasActivePpeFilters(parsePpeFilters(new URLSearchParams("kind=EMPLOYEE"))),
    ).toBe(true);
  });
});
