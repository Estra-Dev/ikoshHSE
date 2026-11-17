import { describe, expect, it } from "vitest";
import type { IkoshRole } from "./api/types";
import {
  canEditEmploymentInfo,
  canEditIncidentReport,
  canListInactiveEmployees,
  canManageContractors,
  canManageCorrectiveActions,
  canManageDepartments,
  canManageIncidentWorkflow,
  canManagePersonnelAccess,
  canManageWorksites,
  canCreateCorrectiveActions,
  canConductInspections,
  canCreateInspections,
  canEditInspection,
  canManageInspections,
  canProgressInspection,
  canRaiseInspectionCorrectiveAction,
  canRecordInspectionFindings,
  canUploadInspectionEvidence,
  canViewInspections,
  canCreateRiskAssessments,
  canEditRiskAssessment,
  canEditRiskAssessments,
  canManageRiskAssessment,
  canManageRiskAssessments,
  canSubmitRiskAssessment,
  canViewRiskAssessments,
  canConductAudit,
  canConductAudits,
  canCreateAudits,
  canEditAudit,
  canManageAudits,
  canProgressAudit,
  canRaiseAuditCorrectiveAction,
  canUploadAuditEvidence,
  canViewAudits,
  canProgressCorrectiveAction,
  canProgressCorrectiveActions,
  canReportIncidents,
  canActivatePermit,
  canApprovePermit,
  canApprovePermits,
  canCancelPermit,
  canClosePermit,
  canCreatePermits,
  canEditPermit,
  canManagePermits,
  canOperatePermits,
  canResumePermit,
  canSubmitPermit,
  canSuspendPermit,
  canUploadPermitEvidence,
  canViewPermits,
  canUploadCorrectiveActionEvidence,
  canVerifyCorrectiveAction,
  canViewAuditLog,
  canViewCorrectiveActions,
  canEditCorrectiveAction,
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

describe("corrective action permissions", () => {
  const viewerId = "507f1f77bcf86cd799439011";
  const assigneeId = "507f1f77bcf86cd799439012";

  it("restricts register visibility to HSE staff", () => {
    expect(canViewCorrectiveActions("EMPLOYEE")).toBe(false);
    expect(canViewCorrectiveActions(undefined)).toBe(false);

    for (const role of MANAGEMENT_ROLES) {
      expect(canViewCorrectiveActions(role)).toBe(true);
    }
  });

  it("lets HSE officers and above create and progress actions", () => {
    for (const role of ALL_ROLES) {
      const expected =
        role === "HSE_OFFICER" || role === "HSE_MANAGER" || role === "ADMIN";

      expect(canCreateCorrectiveActions(role)).toBe(expected);
      expect(canProgressCorrectiveActions(role)).toBe(expected);
    }

    expect(canCreateCorrectiveActions(undefined)).toBe(false);
    expect(canProgressCorrectiveActions(undefined)).toBe(false);
  });

  it("reserves metadata edits and verification for HSE management", () => {
    for (const role of ALL_ROLES) {
      const expected = role === "HSE_MANAGER" || role === "ADMIN";

      expect(canManageCorrectiveActions(role)).toBe(expected);
      expect(canVerifyCorrectiveAction(role, { status: "COMPLETED" })).toBe(
        expected,
      );
      expect(canEditCorrectiveAction(role, { status: "OPEN" })).toBe(expected);
    }

    expect(canEditCorrectiveAction("ADMIN", { status: "VERIFIED" })).toBe(
      false,
    );
    expect(canVerifyCorrectiveAction("ADMIN", { status: "OPEN" })).toBe(false);
  });

  it("lets only the assignee or management progress an action", () => {
    const action = {
      status: "IN_PROGRESS" as const,
      assignedTo: { id: assigneeId },
    };

    expect(canProgressCorrectiveAction("HSE_OFFICER", assigneeId, action)).toBe(
      true,
    );
    expect(
      canProgressCorrectiveAction("HSE_OFFICER", viewerId, action),
    ).toBe(false);
    expect(canProgressCorrectiveAction("HSE_MANAGER", viewerId, action)).toBe(
      true,
    );
    expect(canProgressCorrectiveAction("SUPERVISOR", assigneeId, action)).toBe(
      false,
    );
    expect(
      canProgressCorrectiveAction("HSE_OFFICER", assigneeId, {
        status: "VERIFIED",
        assignedTo: { id: assigneeId },
      }),
    ).toBe(false);
  });

  it("mirrors the narrower evidence upload rule", () => {
    const action = {
      status: "OPEN" as const,
      createdBy: { id: viewerId },
      assignedTo: { id: assigneeId },
    };

    expect(canUploadCorrectiveActionEvidence("HSE_MANAGER", viewerId, action)).toBe(
      true,
    );
    expect(canUploadCorrectiveActionEvidence("HSE_OFFICER", viewerId, action)).toBe(
      true,
    );
    expect(
      canUploadCorrectiveActionEvidence("HSE_OFFICER", assigneeId, action),
    ).toBe(true);
    expect(
      canUploadCorrectiveActionEvidence(
        "HSE_OFFICER",
        "507f1f77bcf86cd799439013",
        action,
      ),
    ).toBe(false);
    expect(canUploadCorrectiveActionEvidence("EMPLOYEE", viewerId, action)).toBe(
      false,
    );
    expect(
      canUploadCorrectiveActionEvidence("HSE_MANAGER", viewerId, {
        ...action,
        status: "VERIFIED",
      }),
    ).toBe(false);
  });

  it("restricts audit log access to HSE managers and admins", () => {
    for (const role of ALL_ROLES) {
      expect(canViewAuditLog(role)).toBe(
        role === "HSE_MANAGER" || role === "ADMIN",
      );
    }

    expect(canViewAuditLog(undefined)).toBe(false);
  });
});

describe("inspection permissions", () => {
  const inspectorId = "507f1f77bcf86cd799439011";
  const otherId = "507f1f77bcf86cd799439012";
  const creatorId = "507f1f77bcf86cd799439013";

  const openInspection = {
    status: "SCHEDULED" as const,
    inspector: { id: inspectorId },
    createdBy: { id: creatorId },
  };

  it("restricts register visibility to HSE staff", () => {
    expect(canViewInspections("EMPLOYEE")).toBe(false);
    expect(canViewInspections(undefined)).toBe(false);

    for (const role of MANAGEMENT_ROLES) {
      expect(canViewInspections(role)).toBe(true);
    }
  });

  it("lets HSE officers and above schedule and conduct inspections", () => {
    for (const role of ALL_ROLES) {
      const expected =
        role === "HSE_OFFICER" || role === "HSE_MANAGER" || role === "ADMIN";

      expect(canCreateInspections(role)).toBe(expected);
      expect(canConductInspections(role)).toBe(expected);
    }

    expect(canCreateInspections(undefined)).toBe(false);
    expect(canConductInspections(undefined)).toBe(false);
  });

  it("reserves metadata edits and cancellation for HSE management", () => {
    for (const role of ALL_ROLES) {
      const expected = role === "HSE_MANAGER" || role === "ADMIN";

      expect(canManageInspections(role)).toBe(expected);
      expect(canEditInspection(role, { status: "SCHEDULED" })).toBe(expected);
      expect(canProgressInspection(role, otherId, openInspection, "CANCELLED")).toBe(
        expected,
      );
    }

    expect(canEditInspection("ADMIN", { status: "COMPLETED" })).toBe(false);
    expect(canEditInspection("ADMIN", { status: "CANCELLED" })).toBe(false);
  });

  it("lets only the inspector or management progress an inspection", () => {
    expect(
      canProgressInspection("HSE_OFFICER", inspectorId, openInspection, "IN_PROGRESS"),
    ).toBe(true);
    expect(
      canProgressInspection("HSE_OFFICER", otherId, openInspection, "IN_PROGRESS"),
    ).toBe(false);
    expect(
      canProgressInspection("HSE_MANAGER", otherId, openInspection, "IN_PROGRESS"),
    ).toBe(true);
    expect(
      canProgressInspection("SUPERVISOR", inspectorId, openInspection, "IN_PROGRESS"),
    ).toBe(false);
    expect(
      canProgressInspection("ADMIN", inspectorId, {
        ...openInspection,
        status: "COMPLETED",
      }, "IN_PROGRESS"),
    ).toBe(false);
  });

  it("lets the inspector or management record findings while open", () => {
    expect(
      canRecordInspectionFindings("HSE_OFFICER", inspectorId, openInspection),
    ).toBe(true);
    expect(
      canRecordInspectionFindings("HSE_OFFICER", otherId, openInspection),
    ).toBe(false);
    expect(
      canRecordInspectionFindings("HSE_MANAGER", otherId, openInspection),
    ).toBe(true);
    expect(
      canRecordInspectionFindings("HSE_OFFICER", inspectorId, {
        ...openInspection,
        status: "COMPLETED",
      }),
    ).toBe(false);
  });

  it("allows CAPA follow-up while open or completed, but not cancelled", () => {
    for (const status of ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] as const) {
      expect(
        canRaiseInspectionCorrectiveAction("HSE_OFFICER", inspectorId, {
          ...openInspection,
          status,
        }),
      ).toBe(true);
    }

    expect(
      canRaiseInspectionCorrectiveAction("HSE_OFFICER", inspectorId, {
        ...openInspection,
        status: "CANCELLED",
      }),
    ).toBe(false);
    expect(
      canRaiseInspectionCorrectiveAction("HSE_OFFICER", otherId, openInspection),
    ).toBe(false);
  });

  it("mirrors the narrower evidence upload rule", () => {
    expect(
      canUploadInspectionEvidence("HSE_MANAGER", otherId, openInspection),
    ).toBe(true);
    expect(
      canUploadInspectionEvidence("HSE_OFFICER", inspectorId, openInspection),
    ).toBe(true);
    expect(
      canUploadInspectionEvidence("HSE_OFFICER", creatorId, openInspection),
    ).toBe(true);
    expect(
      canUploadInspectionEvidence("HSE_OFFICER", otherId, openInspection),
    ).toBe(false);
    expect(
      canUploadInspectionEvidence("EMPLOYEE", creatorId, openInspection),
    ).toBe(false);
    expect(
      canUploadInspectionEvidence("HSE_MANAGER", creatorId, {
        ...openInspection,
        status: "CANCELLED",
      }),
    ).toBe(false);
  });
});

describe("risk assessment permissions", () => {
  const ownerId = "507f1f77bcf86cd799439021";
  const creatorId = "507f1f77bcf86cd799439022";
  const otherId = "507f1f77bcf86cd799439023";

  const draft = {
    status: "DRAFT" as const,
    owner: { id: ownerId },
    createdBy: { id: creatorId },
  };

  it("restricts register visibility to HSE staff", () => {
    expect(canViewRiskAssessments("EMPLOYEE")).toBe(false);
    expect(canViewRiskAssessments(undefined)).toBe(false);

    for (const role of MANAGEMENT_ROLES) {
      expect(canViewRiskAssessments(role)).toBe(true);
    }
  });

  it("lets HSE officers and above author drafts", () => {
    for (const role of ALL_ROLES) {
      const expected =
        role === "HSE_OFFICER" || role === "HSE_MANAGER" || role === "ADMIN";

      expect(canCreateRiskAssessments(role)).toBe(expected);
      expect(canEditRiskAssessments(role)).toBe(expected);
    }

    expect(canCreateRiskAssessments(undefined)).toBe(false);
  });

  it("reserves approval, return and archiving for HSE management", () => {
    for (const role of ALL_ROLES) {
      const expected = role === "HSE_MANAGER" || role === "ADMIN";

      expect(canManageRiskAssessments(role)).toBe(expected);
      expect(canManageRiskAssessment(role)).toBe(expected);
    }

    expect(canManageRiskAssessments(undefined)).toBe(false);
  });

  it("limits draft edits and submission to the owner, creator or management", () => {
    expect(canEditRiskAssessment("HSE_OFFICER", ownerId, draft)).toBe(true);
    expect(canEditRiskAssessment("HSE_OFFICER", creatorId, draft)).toBe(true);
    expect(canEditRiskAssessment("HSE_OFFICER", otherId, draft)).toBe(false);
    expect(canEditRiskAssessment("HSE_MANAGER", otherId, draft)).toBe(true);
    expect(canEditRiskAssessment("SUPERVISOR", ownerId, draft)).toBe(false);
    expect(canEditRiskAssessment(undefined, ownerId, draft)).toBe(false);

    expect(canSubmitRiskAssessment("HSE_OFFICER", ownerId, draft)).toBe(true);
    expect(canSubmitRiskAssessment("HSE_OFFICER", otherId, draft)).toBe(false);
  });

  it("blocks edits once the assessment leaves draft", () => {
    for (const status of ["IN_REVIEW", "APPROVED", "ARCHIVED"] as const) {
      expect(
        canEditRiskAssessment("HSE_MANAGER", ownerId, {
          ...draft,
          status,
        }),
      ).toBe(false);
      expect(
        canSubmitRiskAssessment("HSE_MANAGER", ownerId, {
          ...draft,
          status,
        }),
      ).toBe(false);
    }
  });
});

describe("HSE audit permissions", () => {
  const auditorId = "507f1f77bcf86cd799439031";
  const otherId = "507f1f77bcf86cd799439032";
  const creatorId = "507f1f77bcf86cd799439033";

  const planned = {
    status: "PLANNED" as const,
    auditors: [{ id: auditorId }],
    createdBy: { id: creatorId },
  };

  it("restricts register visibility to HSE staff", () => {
    expect(canViewAudits("EMPLOYEE")).toBe(false);
    expect(canViewAudits(undefined)).toBe(false);

    for (const role of MANAGEMENT_ROLES) {
      expect(canViewAudits(role)).toBe(true);
    }
  });

  it("lets HSE officers and above schedule and conduct audits", () => {
    for (const role of ALL_ROLES) {
      const expected =
        role === "HSE_OFFICER" || role === "HSE_MANAGER" || role === "ADMIN";

      expect(canCreateAudits(role)).toBe(expected);
      expect(canConductAudits(role)).toBe(expected);
    }

    expect(canCreateAudits(undefined)).toBe(false);
    expect(canConductAudits(undefined)).toBe(false);
  });

  it("reserves metadata edits and cancellation for HSE management", () => {
    for (const role of ALL_ROLES) {
      const expected = role === "HSE_MANAGER" || role === "ADMIN";

      expect(canManageAudits(role)).toBe(expected);
      expect(canEditAudit(role, { status: "PLANNED" })).toBe(expected);
      expect(canProgressAudit(role, otherId, planned, "CANCELLED")).toBe(
        expected,
      );
    }

    expect(canEditAudit("ADMIN", { status: "COMPLETED" })).toBe(false);
    expect(canEditAudit("ADMIN", { status: "CANCELLED" })).toBe(false);
  });

  it("lets only an assigned auditor or management progress an audit", () => {
    expect(
      canProgressAudit("HSE_OFFICER", auditorId, planned, "IN_PROGRESS"),
    ).toBe(true);
    expect(
      canProgressAudit("HSE_OFFICER", otherId, planned, "IN_PROGRESS"),
    ).toBe(false);
    expect(
      canProgressAudit("HSE_MANAGER", otherId, planned, "IN_PROGRESS"),
    ).toBe(true);
    expect(
      canProgressAudit("SUPERVISOR", auditorId, planned, "IN_PROGRESS"),
    ).toBe(false);
    expect(
      canProgressAudit("ADMIN", auditorId, {
        ...planned,
        status: "COMPLETED",
      }, "IN_PROGRESS"),
    ).toBe(false);
  });

  it("limits checklist and findings to assigned auditors while open", () => {
    expect(canConductAudit("HSE_OFFICER", auditorId, planned)).toBe(true);
    expect(canConductAudit("HSE_OFFICER", otherId, planned)).toBe(false);
    expect(canConductAudit("HSE_MANAGER", otherId, planned)).toBe(true);
    expect(
      canConductAudit("HSE_OFFICER", auditorId, {
        ...planned,
        status: "COMPLETED",
      }),
    ).toBe(false);
    expect(
      canRaiseAuditCorrectiveAction("HSE_OFFICER", auditorId, planned),
    ).toBe(true);
    expect(
      canRaiseAuditCorrectiveAction("HSE_OFFICER", otherId, planned),
    ).toBe(false);
    expect(
      canRaiseAuditCorrectiveAction("HSE_OFFICER", auditorId, {
        ...planned,
        status: "CANCELLED",
      }),
    ).toBe(false);
  });

  it("mirrors the narrower evidence upload rule", () => {
    expect(canUploadAuditEvidence("HSE_MANAGER", otherId, planned)).toBe(true);
    expect(canUploadAuditEvidence("HSE_OFFICER", auditorId, planned)).toBe(
      true,
    );
    expect(canUploadAuditEvidence("HSE_OFFICER", creatorId, planned)).toBe(
      true,
    );
    expect(canUploadAuditEvidence("HSE_OFFICER", otherId, planned)).toBe(false);
    expect(canUploadAuditEvidence("EMPLOYEE", creatorId, planned)).toBe(false);
    expect(
      canUploadAuditEvidence("HSE_MANAGER", creatorId, {
        ...planned,
        status: "COMPLETED",
      }),
    ).toBe(false);
    expect(
      canUploadAuditEvidence("HSE_MANAGER", creatorId, {
        ...planned,
        status: "CANCELLED",
      }),
    ).toBe(false);
  });
});

describe("permit permissions", () => {
  const siteId = "507f1f77bcf86cd799439031";
  const creatorId = "507f1f77bcf86cd799439032";
  const responsibleId = "507f1f77bcf86cd799439033";
  const otherId = "507f1f77bcf86cd799439034";

  const draft = {
    status: "DRAFT" as const,
    site: { id: siteId },
    responsiblePerson: { id: responsibleId },
    createdBy: { id: creatorId },
    submittedBy: null,
  };

  const submitted = { ...draft, status: "SUBMITTED" as const };

  it("mirrors the capability matrix", () => {
    for (const role of ALL_ROLES) {
      const isHseStaff = MANAGEMENT_ROLES.includes(role);
      const isManagement = role === "HSE_MANAGER" || role === "ADMIN";

      expect(canViewPermits(role)).toBe(isHseStaff);
      expect(canCreatePermits(role)).toBe(isHseStaff);
      expect(canOperatePermits(role)).toBe(isHseStaff);
      expect(canManagePermits(role)).toBe(isManagement);
      expect(canApprovePermits(role)).toBe(isManagement);
    }

    for (const can of [
      canViewPermits,
      canCreatePermits,
      canOperatePermits,
      canManagePermits,
      canApprovePermits,
    ]) {
      expect(can(undefined)).toBe(false);
    }
  });

  it("lets creators, responsible people and management edit drafts only", () => {
    expect(canEditPermit("HSE_OFFICER", creatorId, draft)).toBe(true);
    expect(canEditPermit("SUPERVISOR", responsibleId, draft)).toBe(true);
    expect(canEditPermit("HSE_MANAGER", otherId, draft)).toBe(true);
    expect(canEditPermit("SUPERVISOR", otherId, draft)).toBe(false);
    expect(canEditPermit("EMPLOYEE", creatorId, draft)).toBe(false);
    expect(canEditPermit("HSE_MANAGER", creatorId, submitted)).toBe(false);

    expect(canSubmitPermit("HSE_OFFICER", creatorId, draft)).toBe(true);
    expect(canSubmitPermit("HSE_OFFICER", otherId, draft)).toBe(false);
  });

  it("blocks self-approval and non-management approval", () => {
    expect(canApprovePermit("HSE_MANAGER", otherId, submitted)).toBe(true);
    expect(canApprovePermit("ADMIN", otherId, submitted)).toBe(true);

    expect(canApprovePermit("HSE_MANAGER", creatorId, submitted)).toBe(false);
    expect(
      canApprovePermit("HSE_MANAGER", responsibleId, submitted),
    ).toBe(false);
    expect(
      canApprovePermit("HSE_MANAGER", otherId, {
        ...submitted,
        submittedBy: { id: otherId },
      }),
    ).toBe(false);
    expect(canApprovePermit("HSE_OFFICER", otherId, submitted)).toBe(false);
    expect(canApprovePermit("HSE_MANAGER", otherId, draft)).toBe(false);
  });

  it("limits activation and resumption to responsible people or management", () => {
    const approved = { ...draft, status: "APPROVED" as const };
    const suspended = { ...draft, status: "SUSPENDED" as const };

    expect(canActivatePermit("SUPERVISOR", responsibleId, approved)).toBe(true);
    expect(canActivatePermit("HSE_MANAGER", otherId, approved)).toBe(true);
    expect(canActivatePermit("HSE_OFFICER", otherId, approved)).toBe(false);
    expect(canActivatePermit("SUPERVISOR", otherId, approved)).toBe(false);

    expect(canResumePermit("SUPERVISOR", responsibleId, suspended)).toBe(true);
    expect(canResumePermit("ADMIN", otherId, suspended)).toBe(true);
    expect(canResumePermit("HSE_OFFICER", otherId, suspended)).toBe(false);
    expect(canResumePermit("SUPERVISOR", responsibleId, approved)).toBe(false);
  });

  it("lets the responsible person or a site HSE officer suspend active work", () => {
    const active = { ...draft, status: "ACTIVE" as const };

    expect(canSuspendPermit("SUPERVISOR", responsibleId, active, [])).toBe(
      true,
    );
    expect(canSuspendPermit("HSE_OFFICER", otherId, active, [siteId])).toBe(
      true,
    );
    expect(canSuspendPermit("HSE_OFFICER", otherId, active, [])).toBe(false);
    expect(canSuspendPermit("HSE_MANAGER", otherId, active, [])).toBe(true);
    expect(canSuspendPermit("ADMIN", otherId, active, [])).toBe(true);
    expect(canSuspendPermit("EMPLOYEE", responsibleId, active, [siteId])).toBe(
      false,
    );
    expect(canSuspendPermit("HSE_MANAGER", otherId, submitted, [])).toBe(false);
  });

  it("allows closure from active or suspended regardless of validity", () => {
    expect(
      canClosePermit("SUPERVISOR", responsibleId, {
        status: "ACTIVE",
        responsiblePerson: { id: responsibleId },
      }),
    ).toBe(true);
    expect(
      canClosePermit("HSE_MANAGER", otherId, {
        status: "SUSPENDED",
        responsiblePerson: { id: responsibleId },
      }),
    ).toBe(true);
    expect(
      canClosePermit("HSE_OFFICER", otherId, {
        status: "ACTIVE",
        responsiblePerson: { id: responsibleId },
      }),
    ).toBe(false);
    expect(
      canClosePermit("HSE_MANAGER", otherId, {
        status: "APPROVED",
        responsiblePerson: { id: responsibleId },
      }),
    ).toBe(false);
  });

  it("applies cancellation rules by status and role", () => {
    expect(canCancelPermit("HSE_OFFICER", creatorId, draft)).toBe(true);
    expect(canCancelPermit("SUPERVISOR", responsibleId, submitted)).toBe(true);
    expect(canCancelPermit("HSE_OFFICER", otherId, submitted)).toBe(false);

    const approved = { ...draft, status: "APPROVED" as const };

    expect(canCancelPermit("HSE_OFFICER", creatorId, approved)).toBe(false);
    expect(canCancelPermit("HSE_MANAGER", otherId, approved)).toBe(true);

    const active = { ...draft, status: "ACTIVE" as const };

    expect(canCancelPermit("HSE_MANAGER", otherId, active)).toBe(false);
  });

  it("restricts evidence uploads to authors, management and live permits", () => {
    expect(canUploadPermitEvidence("HSE_OFFICER", creatorId, draft)).toBe(true);
    expect(canUploadPermitEvidence("SUPERVISOR", responsibleId, draft)).toBe(
      true,
    );
    expect(canUploadPermitEvidence("HSE_MANAGER", otherId, draft)).toBe(true);
    expect(canUploadPermitEvidence("HSE_OFFICER", otherId, draft)).toBe(false);
    expect(canUploadPermitEvidence("EMPLOYEE", creatorId, draft)).toBe(false);

    for (const status of ["CLOSED", "REJECTED", "CANCELLED"] as const) {
      expect(
        canUploadPermitEvidence("HSE_MANAGER", otherId, {
          ...draft,
          status,
        }),
      ).toBe(false);
    }
  });
});
