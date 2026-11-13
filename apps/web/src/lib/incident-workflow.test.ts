import { describe, expect, it } from "vitest";
import {
  incidentDetailHref,
  incidentRegisterHref,
  incidentReportHref,
  INCIDENT_STATUS_TRANSITIONS,
  isIncidentStatusTerminal,
  nextIncidentStatuses,
} from "./incident-workflow";

describe("incident status transitions", () => {
  it("mirrors the forward-only server map", () => {
    expect(INCIDENT_STATUS_TRANSITIONS).toEqual({
      REPORTED: ["TRIAGED"],
      TRIAGED: ["CLOSED"],
      CLOSED: [],
    });
  });

  it("offers only the next workflow stage", () => {
    expect(nextIncidentStatuses("REPORTED")).toEqual(["TRIAGED"]);
    expect(nextIncidentStatuses("TRIAGED")).toEqual(["CLOSED"]);
    expect(nextIncidentStatuses("CLOSED")).toEqual([]);
  });

  it("treats CLOSED as terminal", () => {
    expect(isIncidentStatusTerminal("REPORTED")).toBe(false);
    expect(isIncidentStatusTerminal("TRIAGED")).toBe(false);
    expect(isIncidentStatusTerminal("CLOSED")).toBe(true);
  });
});

describe("incident route helpers", () => {
  it("keeps incidents and near misses on separate registers", () => {
    expect(incidentRegisterHref("INCIDENT")).toBe("/incidents");
    expect(incidentRegisterHref("NEAR_MISS")).toBe("/near-misses");
    expect(incidentReportHref("INCIDENT")).toBe("/incidents/new");
    expect(incidentReportHref("NEAR_MISS")).toBe("/near-misses/new");
  });

  it("builds type-aware detail links", () => {
    expect(incidentDetailHref("INCIDENT", "abc")).toBe("/incidents/abc");
    expect(incidentDetailHref("NEAR_MISS", "abc")).toBe("/near-misses/abc");
  });
});
