import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { HttpError } from "../src/lib/http-error.js";
import {
  HSE_CAPABILITIES,
  hasHsePermission,
  type HseCapability,
} from "../src/lib/hse-permissions.js";
import { IKOSH_ROLES, type IkoshRole } from "../src/lib/ikosh-constants.js";
import {
  assertSiteAccess,
  isSiteAssigned,
  siteScopeFilter,
} from "../src/lib/site-access.js";

const EXPECTED: Record<IkoshRole, readonly HseCapability[]> = {
  EMPLOYEE: ["reportIncident"],
  SUPERVISOR: ["reportIncident", "viewCorrectiveActions"],
  HSE_OFFICER: [
    "reportIncident",
    "viewCorrectiveActions",
    "createCorrectiveActions",
    "progressCorrectiveActions",
  ],
  HSE_MANAGER: [
    "reportIncident",
    "viewAllSites",
    "manageHseRecords",
    "classifyIncidents",
    "progressIncidentStatus",
    "viewCorrectiveActions",
    "createCorrectiveActions",
    "manageCorrectiveActions",
    "progressCorrectiveActions",
    "viewAuditLog",
  ],
  ADMIN: HSE_CAPABILITIES,
};

describe("HSE role matrix", () => {
  it.each(IKOSH_ROLES)("enforces the matrix for %s", (role) => {
    for (const capability of HSE_CAPABILITIES) {
      expect(hasHsePermission(role, capability)).toBe(
        EXPECTED[role].includes(capability),
      );
    }
  });

  it("fails closed for roles that are not IKOSH roles", () => {
    expect(hasHsePermission("SUPER_ADMIN", "manageHseRecords")).toBe(false);
    expect(hasHsePermission("HSE_MANAGER", "manageEmployees")).toBe(false);
  });
});

describe("site access", () => {
  const siteA = new Types.ObjectId();
  const siteB = new Types.ObjectId();

  it("allows HSE management to see all sites", () => {
    expect(
      siteScopeFilter({ ikoshRole: "ADMIN", assignedSites: [] }),
    ).toEqual({});
    expect(
      siteScopeFilter({ ikoshRole: "HSE_MANAGER", assignedSites: [siteA] }),
    ).toEqual({});
  });

  it("scopes non-management users to assigned sites", () => {
    expect(
      siteScopeFilter({ ikoshRole: "EMPLOYEE", assignedSites: [siteA, siteB] }),
    ).toEqual({ _id: { $in: [siteA, siteB] } });

    expect(
      siteScopeFilter(
        { ikoshRole: "HSE_OFFICER", assignedSites: [siteA] },
        "site",
      ),
    ).toEqual({ site: { $in: [siteA] } });
  });

  it("matches no records when assignments are empty", () => {
    expect(
      siteScopeFilter({ ikoshRole: "EMPLOYEE", assignedSites: [] }),
    ).toEqual({ _id: { $in: [] } });
  });

  it("checks assignment and hides inaccessible sites", () => {
    const employee = { ikoshRole: "EMPLOYEE", assignedSites: [siteA] };

    expect(isSiteAssigned(employee, siteA)).toBe(true);
    expect(isSiteAssigned(employee, siteB)).toBe(false);
    expect(
      isSiteAssigned({ ikoshRole: "HSE_MANAGER", assignedSites: [] }, siteB),
    ).toBe(true);

    expect(() => assertSiteAccess(employee, siteA)).not.toThrow();

    let captured: unknown;
    try {
      assertSiteAccess(employee, siteB);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(HttpError);
    expect((captured as HttpError).status).toBe(404);
  });
});
