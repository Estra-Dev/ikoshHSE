import { describe, expect, it } from "vitest";
import type { IncidentSummary } from "./api/types";
import {
  buildCreateIncidentInput,
  buildUpdateIncidentInput,
  fromDateTimeLocalValue,
  incidentToFormValues,
  toDateTimeLocalValue,
  validateIncidentForm,
  type IncidentFormValues,
} from "./incident-form";

const SITE_ID = "507f1f77bcf86cd799439011";
const OCCURRED_AT = "2026-01-15T09:30:00.000Z";

const VALID_VALUES: IncidentFormValues = {
  siteId: SITE_ID,
  type: "INCIDENT",
  title: "Unsafe scaffolding",
  description: "Scaffold boards were missing on level 2.",
  occurredAt: toDateTimeLocalValue(OCCURRED_AT),
  location: "Level 2",
  immediateActions: "Area cordoned off.",
};

function incident(): IncidentSummary {
  return {
    id: "507f1f77bcf86cd799439012",
    site: { id: SITE_ID },
    reportedBy: { id: "507f1f77bcf86cd799439013" },
    type: "NEAR_MISS",
    title: "Falling object",
    description: "A bolt fell from the rack.",
    occurredAt: OCCURRED_AT,
    location: null,
    immediateActions: null,
    category: null,
    status: "REPORTED",
    classifiedBy: null,
    classifiedAt: null,
    statusUpdatedBy: null,
    statusUpdatedAt: null,
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  };
}

describe("validateIncidentForm", () => {
  it("requires a site, title, description and occurrence time", () => {
    const errors = validateIncidentForm(
      {
        siteId: "",
        type: "INCIDENT",
        title: " ",
        description: "",
        occurredAt: "",
        location: "",
        immediateActions: "",
      },
      { requireSite: true },
    );

    expect(errors.siteId).toBeDefined();
    expect(errors.title).toBeDefined();
    expect(errors.description).toBeDefined();
    expect(errors.occurredAt).toBeDefined();
  });

  it("does not require a site when editing an existing report", () => {
    const errors = validateIncidentForm(VALID_VALUES, { requireSite: false });

    expect(errors).toEqual({});
  });

  it("enforces the server field limits", () => {
    const errors = validateIncidentForm(
      {
        ...VALID_VALUES,
        title: "x".repeat(161),
        description: "x".repeat(5001),
        location: "x".repeat(201),
        immediateActions: "x".repeat(2001),
      },
      { requireSite: true },
    );

    expect(errors.title).toBeDefined();
    expect(errors.description).toBeDefined();
    expect(errors.location).toBeDefined();
    expect(errors.immediateActions).toBeDefined();
  });
});

describe("buildCreateIncidentInput", () => {
  it("trims values and includes populated optional fields", () => {
    expect(
      buildCreateIncidentInput({
        ...VALID_VALUES,
        title: "  Unsafe scaffolding  ",
        location: "  Level 2 ",
      }),
    ).toEqual({
      siteId: SITE_ID,
      type: "INCIDENT",
      title: "Unsafe scaffolding",
      description: "Scaffold boards were missing on level 2.",
      occurredAt: fromDateTimeLocalValue(VALID_VALUES.occurredAt),
      location: "Level 2",
      immediateActions: "Area cordoned off.",
    });
  });

  it("omits blank optional fields instead of sending empty strings", () => {
    const input = buildCreateIncidentInput({
      ...VALID_VALUES,
      location: " ",
      immediateActions: "",
    });

    expect(input).not.toHaveProperty("location");
    expect(input).not.toHaveProperty("immediateActions");
  });
});

describe("buildUpdateIncidentInput", () => {
  it("never sends the immutable site or management fields", () => {
    const input = buildUpdateIncidentInput({
      ...VALID_VALUES,
      type: "NEAR_MISS",
    });

    expect(input).not.toHaveProperty("siteId");
    expect(input).not.toHaveProperty("category");
    expect(input).not.toHaveProperty("status");
    expect(input.type).toBe("NEAR_MISS");
  });

  it("omits cleared optional fields so the stored value stays unchanged", () => {
    const input = buildUpdateIncidentInput({
      ...VALID_VALUES,
      location: "",
      immediateActions: "   ",
    });

    expect(input).not.toHaveProperty("location");
    expect(input).not.toHaveProperty("immediateActions");
  });
});

describe("date-time helpers", () => {
  it("round-trips an ISO timestamp through a local input value", () => {
    const localValue = toDateTimeLocalValue(OCCURRED_AT);

    expect(fromDateTimeLocalValue(localValue)).toBe(OCCURRED_AT);
  });

  it("rejects invalid local values", () => {
    expect(fromDateTimeLocalValue("")).toBeNull();
    expect(fromDateTimeLocalValue("not-a-date")).toBeNull();
    expect(toDateTimeLocalValue("not-a-date")).toBe("");
  });

  it("maps an incident into editable form values", () => {
    expect(incidentToFormValues(incident())).toMatchObject({
      siteId: SITE_ID,
      type: "NEAR_MISS",
      title: "Falling object",
      location: "",
      immediateActions: "",
    });
  });
});
