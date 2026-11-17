import type {
  AttendanceRecordStatus,
  IkoshRole,
  PermitStatus,
} from "./api/types";
import { isAttendanceRecordTerminal } from "./attendance-records";

/**
 * Client-side mirrors of the server-side authorization rules. These only
 * control which UI affordances are visible; the API re-validates every
 * action against the MongoDB employee record.
 */

export function isManagementRole(role: IkoshRole | undefined): boolean {
  return (
    role === "SUPERVISOR" ||
    role === "HSE_OFFICER" ||
    role === "HSE_MANAGER" ||
    role === "ADMIN"
  );
}

export function isHseManagementRole(role: IkoshRole | undefined): boolean {
  return role === "HSE_MANAGER" || role === "ADMIN";
}

/**
 * Server-side management roles mirrored for client-side UI visibility.
 * Used in directory filters and permissions UI.
 */
export const MANAGEMENT_ROLES: readonly IkoshRole[] = [
  "SUPERVISOR",
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
];

export function isAdmin(role: IkoshRole | undefined): boolean {
  return role === "ADMIN";
}

/** Full profiles (employment/administrative information) visibility. */
export function canViewFullProfile(
  viewerRole: IkoshRole | undefined,
  isSelf: boolean,
): boolean {
  return isSelf || isManagementRole(viewerRole);
}

/** Editing employment information, roles and status is admin-only. */
export function canEditEmploymentInfo(role: IkoshRole | undefined): boolean {
  return isAdmin(role);
}

export function canManageDepartments(role: IkoshRole | undefined): boolean {
  return isAdmin(role);
}

/** Inactive employees can only be listed by management roles. */
export function canListInactiveEmployees(
  role: IkoshRole | undefined,
): boolean {
  return isManagementRole(role);
}

/** Every authenticated IKOSH role may file an incident or near-miss report. */
export function canReportIncidents(role: IkoshRole | undefined): boolean {
  return role !== undefined;
}

/**
 * Site access administration is restricted to HSE managers and
 * administrators. The API enforces the same rule.
 */
export function canManagePersonnelAccess(
  role: IkoshRole | undefined,
): boolean {
  return isHseManagementRole(role);
}

/**
 * Projects and sites are HSE reference data: only HSE managers and
 * administrators may create, edit, change status or delete them. The API
 * enforces the same rule.
 */
export function canManageWorksites(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

/**
 * Contractor registers, personnel records and site assignments are managed by
 * HSE managers and administrators. The API enforces the same rule.
 */
export function canManageContractors(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

/** Classification and workflow status changes are HSE manager/admin only. */
export function canManageIncidentWorkflow(
  role: IkoshRole | undefined,
): boolean {
  return isHseManagementRole(role);
}

interface EditableIncident {
  /** Null when the API withholds a colleague's reporter identity. */
  reportedBy: { id: string } | null;
  status: "REPORTED" | "TRIAGED" | "CLOSED";
}

/**
 * Mirrors `PATCH /api/incidents/:id`: HSE management may edit content at any
 * status, while a reporter may only edit their own report before triage.
 */
export function canEditIncidentReport(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  incident: EditableIncident,
): boolean {
  if (canManageIncidentWorkflow(role)) {
    return true;
  }

  return (
    role !== undefined &&
    viewerId !== undefined &&
    incident.reportedBy !== null &&
    incident.reportedBy.id === viewerId &&
    incident.status === "REPORTED"
  );
}

/* -------------------------------------------------------------------------- */
/* Corrective actions (CAPA)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Client mirror of the server capability matrix
 * (`apps/api/src/lib/hse-permissions.ts`). Supervisors can see the register;
 * HSE officers can create and progress; only HSE managers and admins can
 * edit metadata or verify closure.
 */

export function canViewCorrectiveActions(role: IkoshRole | undefined): boolean {
  return isManagementRole(role);
}

export function canCreateCorrectiveActions(
  role: IkoshRole | undefined,
): boolean {
  return (
    role === "HSE_OFFICER" || role === "HSE_MANAGER" || role === "ADMIN"
  );
}

export function canProgressCorrectiveActions(
  role: IkoshRole | undefined,
): boolean {
  return canCreateCorrectiveActions(role);
}

export function canManageCorrectiveActions(
  role: IkoshRole | undefined,
): boolean {
  return isHseManagementRole(role);
}

interface EditableCorrectiveAction {
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "VERIFIED";
  createdBy: { id: string } | null;
  assignedTo: { id: string };
}

/** Metadata edits are management-only and blocked once verified. */
export function canEditCorrectiveAction(
  role: IkoshRole | undefined,
  action: Pick<EditableCorrectiveAction, "status">,
): boolean {
  return canManageCorrectiveActions(role) && action.status !== "VERIFIED";
}

/**
 * Mirrors `PATCH /api/corrective-actions/:id/status`: HSE officers (and above)
 * may progress, but only the assignee or management may act on an action, and
 * only management may verify.
 */
export function canProgressCorrectiveAction(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  action: Pick<EditableCorrectiveAction, "status" | "assignedTo">,
): boolean {
  if (!canProgressCorrectiveActions(role) || action.status === "VERIFIED") {
    return false;
  }

  return (
    canManageCorrectiveActions(role) ||
    (viewerId !== undefined && action.assignedTo.id === viewerId)
  );
}

/** Closure verification is reserved for HSE managers and admins. */
export function canVerifyCorrectiveAction(
  role: IkoshRole | undefined,
  action: Pick<EditableCorrectiveAction, "status">,
): boolean {
  return canManageCorrectiveActions(role) && action.status === "COMPLETED";
}

/**
 * Mirrors the server's narrower upload rule: management, the creator or the
 * assignee may add evidence, and verified actions accept no new evidence.
 */
export function canUploadCorrectiveActionEvidence(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  action: Pick<EditableCorrectiveAction, "status" | "createdBy" | "assignedTo">,
): boolean {
  if (!canViewCorrectiveActions(role) || action.status === "VERIFIED") {
    return false;
  }

  if (canManageCorrectiveActions(role)) {
    return true;
  }

  return (
    viewerId !== undefined &&
    (action.createdBy?.id === viewerId || action.assignedTo.id === viewerId)
  );
}

/* -------------------------------------------------------------------------- */
/* Inspections                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Client mirror of the inspection capability matrix
 * (`apps/api/src/lib/hse-permissions.ts`). Supervisors can read the register;
 * HSE officers can schedule and conduct; only HSE managers and admins may edit
 * metadata, reassign or cancel.
 */

export function canViewInspections(role: IkoshRole | undefined): boolean {
  return isManagementRole(role);
}

export function canCreateInspections(role: IkoshRole | undefined): boolean {
  return (
    role === "HSE_OFFICER" || role === "HSE_MANAGER" || role === "ADMIN"
  );
}

export function canConductInspections(role: IkoshRole | undefined): boolean {
  return canCreateInspections(role);
}

export function canManageInspections(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

interface EditableInspection {
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  inspector: { id: string };
  createdBy: { id: string } | null;
}

/** Metadata edits are management-only and blocked once terminal. */
export function canEditInspection(
  role: IkoshRole | undefined,
  inspection: Pick<EditableInspection, "status">,
): boolean {
  return (
    canManageInspections(role) &&
    (inspection.status === "SCHEDULED" || inspection.status === "IN_PROGRESS")
  );
}

/**
 * Mirrors `PATCH /api/inspections/:id/status`: the assigned inspector or HSE
 * management may move an inspection forward, but only management may cancel.
 * `nextStatuses` are filtered so the UI never offers an illegal transition.
 */
export function canProgressInspection(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  inspection: Pick<EditableInspection, "status" | "inspector">,
  nextStatus: Exclude<EditableInspection["status"], "SCHEDULED">,
): boolean {
  if (!canConductInspections(role) || isInspectionStatusTerminal(inspection)) {
    return false;
  }

  if (nextStatus === "CANCELLED") {
    return canManageInspections(role);
  }

  return (
    canManageInspections(role) ||
    (viewerId !== undefined && inspection.inspector.id === viewerId)
  );
}

/** Findings may be recorded by the inspector or management while open. */
export function canRecordInspectionFindings(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  inspection: Pick<EditableInspection, "status" | "inspector">,
): boolean {
  return (
    canConductInspections(role) &&
    !isInspectionStatusTerminal(inspection) &&
    (canManageInspections(role) ||
      (viewerId !== undefined && inspection.inspector.id === viewerId))
  );
}

/**
 * Corrective actions may be raised while an inspection is open or completed;
 * cancellation is the only state that closes the inspection to new follow-up.
 */
export function canRaiseInspectionCorrectiveAction(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  inspection: Pick<EditableInspection, "status" | "inspector">,
): boolean {
  return (
    canConductInspections(role) &&
    inspection.status !== "CANCELLED" &&
    (canManageInspections(role) ||
      (viewerId !== undefined && inspection.inspector.id === viewerId))
  );
}

/**
 * Mirrors the server's narrower upload rule: management, the creator or the
 * inspector may add evidence, and cancelled inspections accept no new files.
 */
export function canUploadInspectionEvidence(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  inspection: Pick<EditableInspection, "status" | "inspector" | "createdBy">,
): boolean {
  if (!canViewInspections(role) || inspection.status === "CANCELLED") {
    return false;
  }

  if (canManageInspections(role)) {
    return true;
  }

  return (
    viewerId !== undefined &&
    (inspection.inspector.id === viewerId ||
      inspection.createdBy?.id === viewerId)
  );
}

function isInspectionStatusTerminal(
  inspection: Pick<EditableInspection, "status">,
): boolean {
  return (
    inspection.status === "COMPLETED" || inspection.status === "CANCELLED"
  );
}

/* -------------------------------------------------------------------------- */
/* Risk assessments                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Client mirror of the risk capability matrix. Supervisors read the register;
 * HSE officers can author and submit drafts; only HSE managers and admins can
 * approve, return to draft or archive.
 */

export function canViewRiskAssessments(role: IkoshRole | undefined): boolean {
  return isManagementRole(role);
}

export function canCreateRiskAssessments(role: IkoshRole | undefined): boolean {
  return (
    role === "HSE_OFFICER" || role === "HSE_MANAGER" || role === "ADMIN"
  );
}

export function canEditRiskAssessments(role: IkoshRole | undefined): boolean {
  return canCreateRiskAssessments(role);
}

export function canManageRiskAssessments(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

interface EditableRiskAssessment {
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
  owner: { id: string } | null;
  createdBy: { id: string } | null;
}

/** Content edits are draft-only and limited to the owner, creator or management. */
export function canEditRiskAssessment(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  assessment: Pick<EditableRiskAssessment, "status" | "owner" | "createdBy">,
): boolean {
  if (assessment.status !== "DRAFT" || !canEditRiskAssessments(role)) {
    return false;
  }

  return (
    canManageRiskAssessments(role) ||
    (viewerId !== undefined &&
      (assessment.owner?.id === viewerId ||
        assessment.createdBy?.id === viewerId))
  );
}

/** Submitting for review is the same author action as editing a draft. */
export function canSubmitRiskAssessment(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  assessment: Pick<EditableRiskAssessment, "status" | "owner" | "createdBy">,
): boolean {
  return canEditRiskAssessment(role, viewerId, assessment);
}

/** Approving, returning to draft and archiving are management actions. */
export function canManageRiskAssessment(role: IkoshRole | undefined): boolean {
  return canManageRiskAssessments(role);
}

/* -------------------------------------------------------------------------- */
/* HSE audits                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Client mirror of the audit capability matrix. Supervisors read the register;
 * HSE officers can schedule and conduct audits; only HSE managers and admins
 * may edit metadata, reassign auditors or cancel.
 */

export function canViewAudits(role: IkoshRole | undefined): boolean {
  return isManagementRole(role);
}

export function canCreateAudits(role: IkoshRole | undefined): boolean {
  return (
    role === "HSE_OFFICER" || role === "HSE_MANAGER" || role === "ADMIN"
  );
}

export function canConductAudits(role: IkoshRole | undefined): boolean {
  return canCreateAudits(role);
}

export function canManageAudits(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

interface EditableAudit {
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  auditors: { id: string }[];
  createdBy: { id: string } | null;
}

function isAuditAuditor(
  viewerId: string | undefined,
  audit: Pick<EditableAudit, "auditors">,
): boolean {
  return (
    viewerId !== undefined &&
    audit.auditors.some((auditor) => auditor.id === viewerId)
  );
}

/** Metadata edits are management-only and blocked once terminal. */
export function canEditAudit(
  role: IkoshRole | undefined,
  audit: Pick<EditableAudit, "status">,
): boolean {
  return (
    canManageAudits(role) &&
    (audit.status === "PLANNED" || audit.status === "IN_PROGRESS")
  );
}

/**
 * Mirrors `PATCH /api/audits/:id/status`: assigned auditors or HSE management
 * may move an audit forward, but only management may cancel. `nextStatus` is
 * supplied so the UI never offers an illegal transition.
 */
export function canProgressAudit(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  audit: Pick<EditableAudit, "status" | "auditors">,
  nextStatus: Exclude<EditableAudit["status"], "PLANNED">,
): boolean {
  if (audit.status === "COMPLETED" || audit.status === "CANCELLED") {
    return false;
  }

  if (!canConductAudits(role)) {
    return false;
  }

  if (nextStatus === "CANCELLED") {
    return canManageAudits(role);
  }

  return canManageAudits(role) || isAuditAuditor(viewerId, audit);
}

/** Checklist results and findings may be recorded by assigned auditors while open. */
export function canConductAudit(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  audit: Pick<EditableAudit, "status" | "auditors">,
): boolean {
  return (
    canConductAudits(role) &&
    audit.status !== "COMPLETED" &&
    audit.status !== "CANCELLED" &&
    (canManageAudits(role) || isAuditAuditor(viewerId, audit))
  );
}

/** Corrective actions may be raised by the same people who conduct the audit. */
export function canRaiseAuditCorrectiveAction(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  audit: Pick<EditableAudit, "status" | "auditors">,
): boolean {
  return canConductAudit(role, viewerId, audit);
}

/**
 * Mirrors the server's narrower upload rule: management, the creator or an
 * assigned auditor may add evidence, and completed or cancelled audits accept
 * no new files.
 */
export function canUploadAuditEvidence(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  audit: Pick<EditableAudit, "status" | "auditors" | "createdBy">,
): boolean {
  if (
    !canViewAudits(role) ||
    audit.status === "COMPLETED" ||
    audit.status === "CANCELLED"
  ) {
    return false;
  }

  if (canManageAudits(role)) {
    return true;
  }

  return (
    viewerId !== undefined &&
    (audit.createdBy?.id === viewerId || isAuditAuditor(viewerId, audit))
  );
}

/** Audit log access mirrors the server's HSE_MANAGER + ADMIN rule. */
export function canViewAuditLog(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

/* -------------------------------------------------------------------------- */
/* Permits to work                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Client mirror of the permit capability matrix. Supervisors and HSE officers
 * can raise and operate permits; only HSE managers and admins can approve,
 * reject or cancel an approved permit.
 */

export function canViewPermits(role: IkoshRole | undefined): boolean {
  return isManagementRole(role);
}

export function canCreatePermits(role: IkoshRole | undefined): boolean {
  return isManagementRole(role);
}

export function canOperatePermits(role: IkoshRole | undefined): boolean {
  return isManagementRole(role);
}

export function canManagePermits(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

export function canApprovePermits(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

interface EditablePermit {
  status: PermitStatus;
  site: { id: string };
  responsiblePerson: { id: string } | null;
  createdBy: { id: string } | null;
  submittedBy: { id: string } | null;
}

function isPermitCreatorOrResponsible(
  viewerId: string | undefined,
  permit: Pick<EditablePermit, "responsiblePerson" | "createdBy">,
): boolean {
  return (
    viewerId !== undefined &&
    (permit.responsiblePerson?.id === viewerId ||
      permit.createdBy?.id === viewerId)
  );
}

/** Content edits are draft-only and limited to the authors or management. */
export function canEditPermit(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  permit: Pick<
    EditablePermit,
    "status" | "responsiblePerson" | "createdBy"
  >,
): boolean {
  if (!canCreatePermits(role) || permit.status !== "DRAFT") {
    return false;
  }

  return (
    canManagePermits(role) ||
    isPermitCreatorOrResponsible(viewerId, permit)
  );
}

/** Submitting is the same author action as editing a draft. */
export function canSubmitPermit(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  permit: Pick<
    EditablePermit,
    "status" | "responsiblePerson" | "createdBy"
  >,
): boolean {
  return canEditPermit(role, viewerId, permit);
}

/** Approval and rejection are management actions with self-approval blocked. */
export function canApprovePermit(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  permit: Pick<
    EditablePermit,
    "status" | "responsiblePerson" | "createdBy" | "submittedBy"
  >,
): boolean {
  if (!canApprovePermits(role) || permit.status !== "SUBMITTED") {
    return false;
  }

  return (
    viewerId !== undefined &&
    permit.createdBy?.id !== viewerId &&
    permit.responsiblePerson?.id !== viewerId &&
    permit.submittedBy?.id !== viewerId
  );
}

/** Activation is limited to the responsible person or HSE management. */
export function canActivatePermit(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  permit: Pick<EditablePermit, "status" | "responsiblePerson">,
): boolean {
  if (!canOperatePermits(role) || permit.status !== "APPROVED") {
    return false;
  }

  return (
    canManagePermits(role) ||
    (viewerId !== undefined && permit.responsiblePerson?.id === viewerId)
  );
}

/** Resuming a suspended permit follows the same rule as activation. */
export function canResumePermit(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  permit: Pick<EditablePermit, "status" | "responsiblePerson">,
): boolean {
  if (!canOperatePermits(role) || permit.status !== "SUSPENDED") {
    return false;
  }

  return (
    canManagePermits(role) ||
    (viewerId !== undefined && permit.responsiblePerson?.id === viewerId)
  );
}

/**
 * Suspension may be requested by the responsible person, an HSE officer with
 * access to the permit's site, or HSE management.
 */
export function canSuspendPermit(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  permit: Pick<EditablePermit, "status" | "site" | "responsiblePerson">,
  assignedSites: readonly string[],
): boolean {
  if (!canOperatePermits(role) || permit.status !== "ACTIVE") {
    return false;
  }

  if (canManagePermits(role)) {
    return true;
  }

  if (viewerId !== undefined && permit.responsiblePerson?.id === viewerId) {
    return true;
  }

  return role === "HSE_OFFICER" && assignedSites.includes(permit.site.id);
}

/** Closure is allowed from ACTIVE or SUSPENDED, including after expiry. */
export function canClosePermit(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  permit: Pick<EditablePermit, "status" | "responsiblePerson">,
): boolean {
  if (
    !canOperatePermits(role) ||
    (permit.status !== "ACTIVE" && permit.status !== "SUSPENDED")
  ) {
    return false;
  }

  return (
    canManagePermits(role) ||
    (viewerId !== undefined && permit.responsiblePerson?.id === viewerId)
  );
}

/** Cancellation is author-level until approval, then management-only. */
export function canCancelPermit(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  permit: Pick<
    EditablePermit,
    "status" | "responsiblePerson" | "createdBy"
  >,
): boolean {
  if (canManagePermits(role)) {
    return (
      permit.status === "DRAFT" ||
      permit.status === "SUBMITTED" ||
      permit.status === "APPROVED"
    );
  }

  if (
    !canCreatePermits(role) ||
    (permit.status !== "DRAFT" && permit.status !== "SUBMITTED")
  ) {
    return false;
  }

  return isPermitCreatorOrResponsible(viewerId, permit);
}

/**
 * Evidence uploads follow the permit and are narrower than read visibility:
 * management, the creator or the responsible person may attach files, and
 * terminal permits accept none.
 */
export function canUploadPermitEvidence(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  permit: Pick<
    EditablePermit,
    "status" | "responsiblePerson" | "createdBy"
  >,
): boolean {
  if (!canViewPermits(role)) {
    return false;
  }

  if (
    permit.status === "CLOSED" ||
    permit.status === "REJECTED" ||
    permit.status === "CANCELLED"
  ) {
    return false;
  }

  return (
    canManagePermits(role) || isPermitCreatorOrResponsible(viewerId, permit)
  );
}

/* -------------------------------------------------------------------------- */
/* HSE training                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Client mirror of the training capability matrix. Supervisors read the
 * register; HSE officers schedule and record attendance; only HSE managers and
 * admins manage the course catalogue and any session.
 */

export function canViewTraining(role: IkoshRole | undefined): boolean {
  return isManagementRole(role);
}

export function canCreateTraining(role: IkoshRole | undefined): boolean {
  return (
    role === "HSE_OFFICER" || role === "HSE_MANAGER" || role === "ADMIN"
  );
}

export function canManageTraining(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

interface EditableTrainingSession {
  status: AttendanceRecordStatus;
  createdBy: { id: string } | null;
}

/**
 * Content and attendance are editable only while the session is scheduled, by
 * the author or HSE management. Terminal sessions are immutable.
 */
export function canEditTrainingSession(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  session: Pick<EditableTrainingSession, "status" | "createdBy">,
): boolean {
  if (!canCreateTraining(role) || session.status !== "SCHEDULED") {
    return false;
  }

  return (
    canManageTraining(role) ||
    (viewerId !== undefined && session.createdBy?.id === viewerId)
  );
}

export function canCompleteTrainingSession(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  session: Pick<EditableTrainingSession, "status" | "createdBy">,
): boolean {
  return canEditTrainingSession(role, viewerId, session);
}

export function canCancelTrainingSession(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  session: Pick<EditableTrainingSession, "status" | "createdBy">,
): boolean {
  return canEditTrainingSession(role, viewerId, session);
}

/**
 * Evidence uploads follow the session and are narrower than read visibility:
 * management or the author may attach files, and terminal sessions accept none.
 */
export function canUploadTrainingEvidence(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  session: Pick<EditableTrainingSession, "status" | "createdBy">,
): boolean {
  if (!canViewTraining(role) || isAttendanceRecordTerminal(session.status)) {
    return false;
  }

  return (
    canManageTraining(role) ||
    (viewerId !== undefined && session.createdBy?.id === viewerId)
  );
}

/* -------------------------------------------------------------------------- */
/* Toolbox talks                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Client mirror of the toolbox talk capability matrix. Supervisors run talks
 * and may edit the ones they author; HSE officers schedule talks; only HSE
 * managers and admins manage any talk.
 */

export function canViewToolboxTalks(role: IkoshRole | undefined): boolean {
  return isManagementRole(role);
}

export function canCreateToolboxTalks(role: IkoshRole | undefined): boolean {
  return isManagementRole(role);
}

export function canManageToolboxTalks(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

interface EditableToolboxTalk {
  status: AttendanceRecordStatus;
  createdBy: { id: string } | null;
}

/**
 * Content and attendance are editable only while the talk is scheduled, by the
 * author or HSE management. Terminal talks are immutable.
 */
export function canEditToolboxTalk(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  talk: Pick<EditableToolboxTalk, "status" | "createdBy">,
): boolean {
  if (!canCreateToolboxTalks(role) || talk.status !== "SCHEDULED") {
    return false;
  }

  return (
    canManageToolboxTalks(role) ||
    (viewerId !== undefined && talk.createdBy?.id === viewerId)
  );
}

export function canCompleteToolboxTalk(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  talk: Pick<EditableToolboxTalk, "status" | "createdBy">,
): boolean {
  return canEditToolboxTalk(role, viewerId, talk);
}

export function canCancelToolboxTalk(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  talk: Pick<EditableToolboxTalk, "status" | "createdBy">,
): boolean {
  return canEditToolboxTalk(role, viewerId, talk);
}

/**
 * Evidence uploads follow the talk and are narrower than read visibility:
 * management or the author may attach files, and terminal talks accept none.
 */
export function canUploadToolboxTalkEvidence(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  talk: Pick<EditableToolboxTalk, "status" | "createdBy">,
): boolean {
  if (!canViewToolboxTalks(role) || isAttendanceRecordTerminal(talk.status)) {
    return false;
  }

  return (
    canManageToolboxTalks(role) ||
    (viewerId !== undefined && talk.createdBy?.id === viewerId)
  );
}
