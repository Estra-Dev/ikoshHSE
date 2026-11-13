import { describe, expect, it } from "vitest";
import type { IkoshRole } from "./api/types";
import {
  canEditEmploymentInfo,
  canEditIncidentReport,
  canListInactiveEmployees,
  canManageContractors,
  canManageDepartments,
  canManageIncidentWorkflow,
  canManagePersonnelAccess,
  canManageWorksites,
  canReportIncidents,
  canViewFullProfile,
  isAdmin,
  isManagementRole,
} from "./permissions";

const ALL_ROLES: IkoshRole[] = [
  "EMPLOYEE",
  "SUPERVISOR",
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
];

const MANAGEMENT_ROLES: IkoshRole[] = [
  "SUPERVISOR",
  "HSE_OFFICER",
  "HSE_MANAGER",
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

  it("restricts HSE personnel access management to HSE managers and admins", () => {
    for (const role of ALL_ROLES) {
      expect(canManagePersonnelAccess(role)).toBe(
        role === "HSE_MANAGER" || role === "ADMIN",
      );
    }

    expect(canManagePersonnelAccess(undefined)).toBe(false);
  });

  it("restricts project and site management to HSE managers and admins", () => {
    for (const role of ALL_ROLES) {
      expect(canManageWorksites(role)).toBe(
        role === "HSE_MANAGER" || role === "ADMIN",
      );
    }

    expect(canManageWorksites(undefined)).toBe(false);
  });

  it("restricts contractor management to HSE managers and admins", () => {
    for (const role of ALL_ROLES) {
      expect(canManageContractors(role)).toBe(
        role === "HSE_MANAGER" || role === "ADMIN",
      );
    }

    expect(canManageContractors(undefined)).toBe(false);
  });
});

describe("incident permissions", () => {
  it("lets every known IKOSH role report incidents", () => {
    for (const role of ALL_ROLES) {
      expect(canReportIncidents(role)).toBe(true);
    }

    expect(canReportIncidents(undefined)).toBe(false);
  });

  it("restricts classification and status changes to HSE managers and admins", () => {
    for (const role of ALL_ROLES) {
      expect(canManageIncidentWorkflow(role)).toBe(
        role === "HSE_MANAGER" || role === "ADMIN",
      );
    }

    expect(canManageIncidentWorkflow(undefined)).toBe(false);
  });
});

describe("canEditIncidentReport", () => {
  const viewerId = "507f1f77bcf86cd799439011";
  const ownReport = {
    reportedBy: { id: viewerId },
    status: "REPORTED" as const,
  };

  it("grants HSE management content edits at every status", () => {
    for (const status of ["REPORTED", "TRIAGED", "CLOSED"] as const) {
      for (const role of ["HSE_MANAGER", "ADMIN"] as const) {
        expect(
          canEditIncidentReport(role, viewerId, {
            reportedBy: { id: "another-user" },
            status,
          }),
        ).toBe(true);
      }
    }
  });

  it("lets a reporter edit only their own REPORTED report", () => {
    for (const role of ["EMPLOYEE", "SUPERVISOR", "HSE_OFFICER"] as const) {
      expect(canEditIncidentReport(role, viewerId, ownReport)).toBe(true);
      expect(
        canEditIncidentReport(role, viewerId, {
          ...ownReport,
          status: "TRIAGED",
        }),
      ).toBe(false);
      expect(
        canEditIncidentReport(role, viewerId, {
          reportedBy: { id: "another-user" },
          status: "REPORTED",
        }),
      ).toBe(false);
    }
  });

  it("fails closed without a resolved viewer", () => {
    expect(canEditIncidentReport("EMPLOYEE", undefined, ownReport)).toBe(false);
    expect(canEditIncidentReport(undefined, viewerId, ownReport)).toBe(false);
  });
});
