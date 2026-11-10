import { describe, expect, it } from "vitest";
import type { IkoshRole } from "./api/types";
import {
  canEditEmploymentInfo,
  canListInactiveEmployees,
  canManageDepartments,
  canViewFullProfile,
  isAdmin,
  isManagementRole,
} from "./permissions";

const ALL_ROLES: IkoshRole[] = [
  "EMPLOYEE",
  "SUPERVISOR",
  "HSE_OFFICER",
  "ADMIN",
];

const MANAGEMENT_ROLES: IkoshRole[] = [
  "SUPERVISOR",
  "HSE_OFFICER",
  "ADMIN",
];

describe("role helpers", () => {
  it("treats SUPERVISOR, HSE_OFFICER and ADMIN as management roles", () => {
    expect(isManagementRole("EMPLOYEE")).toBe(false);
    expect(isManagementRole(undefined)).toBe(false);

    for (const role of MANAGEMENT_ROLES) {
      expect(isManagementRole(role)).toBe(true);
    }
  });

  it("recognizes only ADMIN as an administrator", () => {
    for (const role of ALL_ROLES) {
      expect(isAdmin(role)).toBe(role === "ADMIN");
    }

    expect(isAdmin(undefined)).toBe(false);
  });
});

describe("canViewFullProfile", () => {
  it("grants ordinary employees only their own full profile", () => {
    expect(canViewFullProfile("EMPLOYEE", false)).toBe(false);
    expect(canViewFullProfile("EMPLOYEE", true)).toBe(true);
  });

  it("grants management roles every full profile", () => {
    for (const role of MANAGEMENT_ROLES) {
      expect(canViewFullProfile(role, false)).toBe(true);
      expect(canViewFullProfile(role, true)).toBe(true);
    }
  });

  it("fails closed without a role unless viewing self", () => {
    expect(canViewFullProfile(undefined, false)).toBe(false);
    expect(canViewFullProfile(undefined, true)).toBe(true);
  });
});

describe("admin-only capabilities", () => {
  it("restricts employment edits, department management and inactive listing", () => {
    for (const role of ALL_ROLES) {
      const expected = role === "ADMIN";

      expect(canEditEmploymentInfo(role)).toBe(expected);
      expect(canManageDepartments(role)).toBe(expected);
    }

    // Listing inactive employees is available to all management roles.
    for (const role of MANAGEMENT_ROLES) {
      expect(canListInactiveEmployees(role)).toBe(true);
    }

    expect(canListInactiveEmployees("EMPLOYEE")).toBe(false);
    expect(canListInactiveEmployees(undefined)).toBe(false);
  });
});
