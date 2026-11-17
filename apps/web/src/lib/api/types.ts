/**
 * Shared DTO types mirroring the IKOSH API serializers. Keep in sync with
 * `apps/api/src/serializers/*`.
 */

export const IKOSH_ROLES = [
  "EMPLOYEE",
  "SUPERVISOR",
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
] as const;

export type IkoshRole = (typeof IKOSH_ROLES)[number];

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** Management roles may view sensitive employment information. */
export const MANAGEMENT_ROLES: readonly IkoshRole[] = [
  "SUPERVISOR",
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
];

export interface DepartmentRef {
  id: string;
  name: string;
}

export interface EmployeeManagerSummary {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
}

/** Basic profile information, visible to every active employee. */
export interface EmployeeBasic {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  location: string | null;
  jobTitle: string | null;
  department: DepartmentRef | null;
}

/**
 * Full profile including sensitive employment and administrative
 * information: own profile, or management roles only.
 */
export interface EmployeeFull extends EmployeeBasic {
  employeeId: string | null;
  employmentType: EmploymentType | null;
  hireDate: string | null;
  manager: EmployeeManagerSummary | null;
  ikoshRole: IkoshRole;
  isActive: boolean;
  emailVerified: boolean;
  /** Sites the employee is assigned to (site-level access control). */
  assignedSites: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DirectoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface EmployeeDirectoryResponse {
  employees: EmployeeDirectoryEntry[];
  pagination: DirectoryPagination;
}

/**
 * HSE personnel view returned by the directory for HSE managers. Adds the
 * HSE-relevant access fields and never includes HR employment information.
 */
export interface HsePersonnel extends EmployeeBasic {
  ikoshRole: IkoshRole;
  isActive: boolean;
  assignedSites: string[];
}

export type EmployeeDirectoryEntry = EmployeeBasic | HsePersonnel;

export interface DepartmentHeadSummary {
  id: string;
  firstName: string;
  lastName: string;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  code: string;
  description: string;
  head: DepartmentHeadSummary | null;
  memberCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentsResponse {
  departments: DepartmentSummary[];
}

export interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/* -------------------------------------------------------------------------- */
/* HSE operations                                                             */
/* -------------------------------------------------------------------------- */

export const INCIDENT_TYPES = ["INCIDENT", "NEAR_MISS"] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_STATUSES = ["REPORTED", "TRIAGED", "CLOSED"] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Site- and role-scoped HSE dashboard aggregates. */
export interface HseDashboardScope {
  projectId: string | null;
  siteId: string | null;
  from: string | null;
  to: string | null;
}

export interface HseDashboardTotals {
  projects: number;
  sites: number;
  contractors: number;
  contractorPersonnel: number;
  attachments: number;
  incidents: number;
  nearMisses: number;
}

export interface HseTrendPoint {
  date: string;
  count: number;
}

export interface HseCategoryCount {
  category: string;
  count: number;
}

export interface HseDashboardIncidents {
  total: number;
  nearMisses: number;
  byStatus: Record<IncidentStatus, number>;
  byCategory: HseCategoryCount[];
  unclassified: number;
  trend: HseTrendPoint[];
}

export interface HseDashboard {
  scope: HseDashboardScope;
  totals: HseDashboardTotals;
  incidents: HseDashboardIncidents;
  lastUpdated: string;
}

export interface HseDashboardResponse {
  success: boolean;
  data: HseDashboard;
}

/** Incident serialization exposes related records as identifiers only. */
export interface IncidentSummary {
  id: string;
  site: { id: string };
  /** Null when the API withholds a colleague's reporter identity. */
  reportedBy: { id: string } | null;
  type: IncidentType;
  title: string;
  description: string;
  occurredAt: string;
  location: string | null;
  immediateActions: string | null;
  category: string | null;
  status: IncidentStatus;
  classifiedBy: { id: string } | null;
  classifiedAt: string | null;
  statusUpdatedBy: { id: string } | null;
  statusUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentsResponse {
  success: boolean;
  incidents: IncidentSummary[];
  pagination: ApiPagination;
}

export interface IncidentResponse {
  success: boolean;
  incident: IncidentSummary;
}

/**
 * Reporters submit observational facts only. `type` and optional detail
 * fields are omitted when blank so the API never receives empty strings.
 */
export interface CreateIncidentInput {
  siteId: string;
  type?: IncidentType;
  title: string;
  description: string;
  occurredAt: string;
  location?: string;
  immediateActions?: string;
}

/**
 * Content updates. `siteId`, `category` and `status` are deliberately absent:
 * the site is immutable and classification/status have dedicated endpoints.
 */
export interface UpdateIncidentInput {
  type?: IncidentType;
  title?: string;
  description?: string;
  occurredAt?: string;
  location?: string;
  immediateActions?: string;
}

export interface ClassifyIncidentInput {
  category: string;
}

export interface UpdateIncidentStatusInput {
  status: IncidentStatus;
}

/** Attachment metadata mirroring the API serializer. */
export interface AttachmentSummary {
  id: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  checksum: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  uploadedBy: { id: string };
  createdAt: string;
}

export interface AttachmentsResponse {
  success: boolean;
  attachments: AttachmentSummary[];
  pagination: ApiPagination;
}

export interface AttachmentResponse {
  success: boolean;
  attachment: AttachmentSummary;
}

/** Read-only HSE reference data sourced from the API constants. */
export interface HseReferenceData {
  incidentCategories: string[];
  incidentTypes: IncidentType[];
  incidentStatuses: IncidentStatus[];
  injuredBodyParts: string[];
  permitToWorkTypes: string[];
  wasteTypes: string[];
  projectStatuses: string[];
  siteStatuses: string[];
}

export interface HseReferenceResponse {
  success: boolean;
  data: HseReferenceData;
}

export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
  description: string;
  client: string | null;
  location: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsResponse {
  success: boolean;
  projects: ProjectSummary[];
  pagination: ApiPagination;
}

export interface ProjectResponse {
  success: boolean;
  project: ProjectSummary;
}

export interface SiteSummary {
  id: string;
  project: { id: string; name: string | null };
  name: string;
  code: string;
  location: string | null;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SitesResponse {
  success: boolean;
  sites: SiteSummary[];
  pagination: ApiPagination;
}

export interface SiteResponse {
  success: boolean;
  site: SiteSummary;
}

/* -------------------------------------------------------------------------- */
/* Contractors                                                                */
/* -------------------------------------------------------------------------- */

export interface ContractorSummary {
  id: string;
  name: string;
  registrationNumber: string | null;
  trade: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  projects: { id: string }[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractorsResponse {
  success: boolean;
  contractors: ContractorSummary[];
  pagination: ApiPagination;
}

export interface ContractorResponse {
  success: boolean;
  contractor: ContractorSummary;
}

export interface ContractorInput {
  name: string;
  registrationNumber?: string;
  trade?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  projects?: string[];
  isActive?: boolean;
}

export interface ContractorPersonnelSiteRef {
  id: string;
  name: string | null;
}

export interface ContractorPersonnelSummary {
  id: string;
  contractor: { id: string };
  firstName: string;
  lastName: string;
  personnelId: string | null;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  /** Legacy single-site reference, kept until the backend backfill is verified. */
  site: { id: string } | null;
  activeSites: ContractorPersonnelSiteRef[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractorPersonnelListResponse {
  success: boolean;
  personnel: ContractorPersonnelSummary[];
  pagination: ApiPagination;
}

export interface ContractorPersonnelResponse {
  success: boolean;
  personnel: ContractorPersonnelSummary;
}

export interface ContractorPersonnelInput {
  contractorId: string;
  firstName: string;
  lastName: string;
  personnelId?: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
}

export interface ContractorPersonnelAssignmentUser {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ContractorPersonnelSiteAssignmentSummary {
  id: string;
  personnel: { id: string };
  contractor: { id: string };
  site: { id: string; name: string | null; code: string | null };
  assignedAt: string;
  assignedBy: ContractorPersonnelAssignmentUser | null;
  endedAt: string | null;
  endedBy: ContractorPersonnelAssignmentUser | null;
  isActive: boolean;
}

export interface ContractorPersonnelDetailResponse {
  success: boolean;
  personnel: ContractorPersonnelSummary;
  activeAssignments: ContractorPersonnelSiteAssignmentSummary[];
  assignmentHistory: ContractorPersonnelSiteAssignmentSummary[];
}

export interface ContractorPersonnelAssignmentResponse {
  success: boolean;
  assignment: ContractorPersonnelSiteAssignmentSummary;
}

/* -------------------------------------------------------------------------- */
/* Corrective actions (CAPA)                                                  */
/* -------------------------------------------------------------------------- */

export const CORRECTIVE_ACTION_SOURCES = [
  "INCIDENT",
  "NEAR_MISS",
  "HSE_OBSERVATION",
  "INSPECTION",
  "HSE_AUDIT",
  "OTHER",
] as const;

export type CorrectiveActionSource = (typeof CORRECTIVE_ACTION_SOURCES)[number];

export const CORRECTIVE_ACTION_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "VERIFIED",
] as const;

export type CorrectiveActionStatus = (typeof CORRECTIVE_ACTION_STATUSES)[number];

export interface CorrectiveActionUserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface CorrectiveActionIncidentRef {
  id: string;
  type: string | null;
  title: string | null;
}

export interface CorrectiveActionInspectionRef {
  id: string;
  title: string | null;
}

export interface CorrectiveActionAuditRef {
  id: string;
  title: string | null;
}

export interface CorrectiveActionProjectRef {
  id: string;
  name: string | null;
}

export interface CorrectiveActionSiteRef {
  id: string;
  name: string | null;
  code: string | null;
}

/** Corrective action mirror of `toCorrectiveActionSummary`. */
export interface CorrectiveActionSummary {
  id: string;
  description: string;
  source: CorrectiveActionSource;
  incident: CorrectiveActionIncidentRef | null;
  inspection: CorrectiveActionInspectionRef | null;
  audit: CorrectiveActionAuditRef | null;
  findingId: string | null;
  auditFindingId: string | null;
  project: CorrectiveActionProjectRef;
  site: CorrectiveActionSiteRef | null;
  assignedTo: CorrectiveActionUserRef;
  dueDate: string;
  status: CorrectiveActionStatus;
  completionNotes: string | null;
  completedAt: string | null;
  completedBy: CorrectiveActionUserRef | null;
  verificationNotes: string | null;
  verifiedAt: string | null;
  verifiedBy: CorrectiveActionUserRef | null;
  createdBy: CorrectiveActionUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface CorrectiveActionsResponse {
  success: boolean;
  correctiveActions: CorrectiveActionSummary[];
  pagination: ApiPagination;
}

export interface CorrectiveActionResponse {
  success: boolean;
  correctiveAction: CorrectiveActionSummary;
}

export interface CorrectiveActionAssignee {
  id: string;
  firstName: string;
  lastName: string;
  ikoshRole: IkoshRole;
}

export interface CorrectiveActionAssigneesResponse {
  success: boolean;
  assignees: CorrectiveActionAssignee[];
}

/**
 * Creation payload. Incident and near-miss sources must send `incidentId`
 * only; project and site are derived by the API from the linked report.
 */
export interface CreateCorrectiveActionInput {
  description: string;
  source: CorrectiveActionSource;
  incidentId?: string;
  projectId?: string;
  siteId?: string;
  assignedTo: string;
  dueDate: string;
}

/** Metadata updates supported by `PATCH /api/corrective-actions/:id`. */
export interface UpdateCorrectiveActionInput {
  description?: string;
  projectId?: string;
  siteId?: string;
  assignedTo?: string;
  dueDate?: string;
}

export interface UpdateCorrectiveActionStatusInput {
  status: CorrectiveActionStatus;
  completionNotes?: string;
  verificationNotes?: string;
}

/* -------------------------------------------------------------------------- */
/* Inspections                                                                */
/* -------------------------------------------------------------------------- */

export const INSPECTION_TYPES = ["ROUTINE", "FOCUSED", "FOLLOW_UP"] as const;

export type InspectionType = (typeof INSPECTION_TYPES)[number];

export const INSPECTION_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type InspectionSeverity = (typeof INSPECTION_SEVERITIES)[number];

export interface InspectionUserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface InspectionProjectRef {
  id: string;
  name: string | null;
}

export interface InspectionSiteRef {
  id: string;
  name: string | null;
  code: string | null;
}

export interface InspectionCorrectiveActionRef {
  id: string;
  description: string | null;
  status: string | null;
}

export interface InspectionFinding {
  id: string;
  description: string;
  severity: InspectionSeverity;
  recommendation: string | null;
  correctiveAction: InspectionCorrectiveActionRef | null;
  createdAt: string;
}

/** Inspection mirror of `toInspectionSummary`. */
export interface InspectionSummary {
  id: string;
  title: string;
  type: InspectionType;
  status: InspectionStatus;
  project: InspectionProjectRef;
  site: InspectionSiteRef | null;
  inspector: InspectionUserRef;
  scheduledFor: string;
  description: string;
  completionNotes: string | null;
  completedAt: string | null;
  completedBy: InspectionUserRef | null;
  findings: InspectionFinding[];
  createdBy: InspectionUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionsResponse {
  success: boolean;
  inspections: InspectionSummary[];
  pagination: ApiPagination;
}

export interface InspectionResponse {
  success: boolean;
  inspection: InspectionSummary;
}

export interface InspectionAssignee {
  id: string;
  firstName: string;
  lastName: string;
  ikoshRole: IkoshRole;
}

export interface InspectionAssigneesResponse {
  success: boolean;
  assignees: InspectionAssignee[];
}

/** Response for raising a corrective action from an inspection finding. */
export interface InspectionCorrectiveActionResponse extends InspectionResponse {
  correctiveAction: CorrectiveActionSummary;
}

export interface CreateInspectionInput {
  title: string;
  type: InspectionType;
  projectId: string;
  siteId?: string;
  inspectorId: string;
  scheduledFor: string;
  description?: string;
}

/** `siteId: null` clears the site; omitting it leaves the current site. */
export interface UpdateInspectionInput {
  title?: string;
  type?: InspectionType;
  projectId?: string;
  siteId?: string | null;
  inspectorId?: string;
  scheduledFor?: string;
  description?: string;
}

export interface UpdateInspectionStatusInput {
  status: InspectionStatus;
  completionNotes?: string;
}

export interface CreateInspectionFindingInput {
  description: string;
  severity: InspectionSeverity;
  recommendation?: string;
}

export interface LinkInspectionCorrectiveActionInput {
  description?: string;
  assignedTo: string;
  dueDate: string;
}

/* -------------------------------------------------------------------------- */
/* Permits to work                                                            */
/* -------------------------------------------------------------------------- */

export const PERMIT_TO_WORK_TYPES = [
  "HOT_WORK",
  "COLD_WORK",
  "CONFINED_SPACE_ENTRY",
  "WORKING_AT_HEIGHT",
  "ELECTRICAL_WORK",
  "EXCAVATION",
  "LIFTING_OPERATION",
  "ENERGY_ISOLATION",
  "RADIOGRAPHY",
  "PRESSURE_TEST",
  "OTHER",
] as const;

export type PermitWorkType = (typeof PERMIT_TO_WORK_TYPES)[number];

export const PERMIT_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
] as const;

export type PermitStatus = (typeof PERMIT_STATUSES)[number];

export const PERMIT_PRECAUTIONS = [
  "PPE",
  "GAS_TESTING",
  "FIRE_WATCH",
  "BARRICADING",
  "LOCKOUT_TAGOUT",
  "SUPERVISION",
  "VENTILATION",
  "RESCUE_PLAN",
  "EMERGENCY_RESPONSE",
  "TOOLBOX_TALK",
  "OTHER",
] as const;

export type PermitPrecaution = (typeof PERMIT_PRECAUTIONS)[number];

export interface PermitUserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface PermitProjectRef {
  id: string;
  name: string | null;
}

export interface PermitSiteRef {
  id: string;
  name: string | null;
  code: string | null;
}

export interface PermitHazard {
  id: string;
  hazard: string;
  controlMeasures: string;
}

export interface PermitClosureChecks {
  workAreaSecured: boolean;
  personnelAccountedFor: boolean;
  equipmentIsolated: boolean;
  siteHandoverCompleted: boolean;
}

/** Client mirror of `toPermitSummary`. */
export interface PermitSummary {
  id: string;
  workDescription: string;
  workType: PermitWorkType;
  status: PermitStatus;
  project: PermitProjectRef;
  site: PermitSiteRef;
  location: string;
  validFrom: string;
  validTo: string;
  responsiblePerson: PermitUserRef | null;
  workersInvolved: string[];
  requiredPrecautions: PermitPrecaution[];
  hazards: PermitHazard[];
  submittedBy: PermitUserRef | null;
  submittedAt: string | null;
  approvedBy: PermitUserRef | null;
  approvedAt: string | null;
  rejectedBy: PermitUserRef | null;
  rejectedAt: string | null;
  activatedBy: PermitUserRef | null;
  activatedAt: string | null;
  suspendedBy: PermitUserRef | null;
  suspendedAt: string | null;
  resumedBy: PermitUserRef | null;
  resumedAt: string | null;
  cancelledBy: PermitUserRef | null;
  cancelledAt: string | null;
  closedBy: PermitUserRef | null;
  closedAt: string | null;
  rejectionReason: string | null;
  suspensionReason: string | null;
  cancellationReason: string | null;
  closureNotes: string | null;
  closureChecks: PermitClosureChecks | null;
  isExpired: boolean;
  createdBy: PermitUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface PermitsResponse {
  success: boolean;
  permits: PermitSummary[];
  pagination: ApiPagination;
}

export interface PermitResponse {
  success: boolean;
  permit: PermitSummary;
}

export interface PermitAssignee {
  id: string;
  firstName: string;
  lastName: string;
  ikoshRole: IkoshRole;
}

export interface PermitAssigneesResponse {
  success: boolean;
  assignees: PermitAssignee[];
}

export interface PermitHazardInput {
  hazard: string;
  controlMeasures: string;
}

export interface CreatePermitInput {
  workDescription: string;
  workType: PermitWorkType;
  projectId: string;
  siteId: string;
  location?: string;
  validFrom: string;
  validTo: string;
  responsiblePersonId: string;
  workersInvolved: string[];
  requiredPrecautions: PermitPrecaution[];
  hazards: PermitHazardInput[];
}

export interface UpdatePermitInput {
  workDescription?: string;
  workType?: PermitWorkType;
  projectId?: string;
  siteId?: string;
  location?: string;
  validFrom?: string;
  validTo?: string;
  responsiblePersonId?: string;
  workersInvolved?: string[];
  requiredPrecautions?: PermitPrecaution[];
  hazards?: PermitHazardInput[];
}

export interface UpdatePermitStatusInput {
  status: PermitStatus;
  reason?: string;
  closureNotes?: string;
  closureChecks?: PermitClosureChecks;
}

/* -------------------------------------------------------------------------- */
/* Risk assessments                                                           */
/* -------------------------------------------------------------------------- */

export const RISK_ASSESSMENT_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "ARCHIVED",
] as const;

export type RiskAssessmentStatus = (typeof RISK_ASSESSMENT_STATUSES)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export interface RiskAssessmentUserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface RiskAssessmentProjectRef {
  id: string;
  name: string | null;
}

export interface RiskAssessmentSiteRef {
  id: string;
  name: string | null;
  code: string | null;
}

/** Hazard line with server-derived inherent and residual risk bands. */
export interface RiskAssessmentHazard {
  id: string;
  hazard: string;
  consequences: string;
  existingControls: string;
  likelihood: number;
  severity: number;
  inherentLevel: RiskLevel;
  residualLikelihood: number;
  residualSeverity: number;
  residualLevel: RiskLevel;
  additionalControls: string;
}

/** Client mirror of `toRiskAssessmentSummary`. */
export interface RiskAssessmentSummary {
  id: string;
  title: string;
  description: string;
  status: RiskAssessmentStatus;
  project: RiskAssessmentProjectRef;
  site: RiskAssessmentSiteRef | null;
  owner: RiskAssessmentUserRef | null;
  reviewDate: string | null;
  hazards: RiskAssessmentHazard[];
  submittedBy: RiskAssessmentUserRef | null;
  submittedAt: string | null;
  approvedBy: RiskAssessmentUserRef | null;
  approvedAt: string | null;
  archivedBy: RiskAssessmentUserRef | null;
  archivedAt: string | null;
  createdBy: RiskAssessmentUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiskAssessmentsResponse {
  success: boolean;
  riskAssessments: RiskAssessmentSummary[];
  pagination: ApiPagination;
}

export interface RiskAssessmentResponse {
  success: boolean;
  riskAssessment: RiskAssessmentSummary;
}

export interface RiskAssessmentAssignee {
  id: string;
  firstName: string;
  lastName: string;
  ikoshRole: IkoshRole;
}

export interface RiskAssessmentAssigneesResponse {
  success: boolean;
  assignees: RiskAssessmentAssignee[];
}

/** Scores only: the API derives inherent and residual levels. */
export interface RiskAssessmentHazardInput {
  hazard: string;
  consequences?: string;
  existingControls?: string;
  likelihood: number;
  severity: number;
  residualLikelihood: number;
  residualSeverity: number;
  additionalControls?: string;
}

export interface CreateRiskAssessmentInput {
  title: string;
  description?: string;
  projectId: string;
  siteId?: string;
  ownerId: string;
  reviewDate?: string;
  hazards: RiskAssessmentHazardInput[];
}

/** `siteId: null` clears the site; omitting it leaves the current site. */
export interface UpdateRiskAssessmentInput {
  title?: string;
  description?: string;
  projectId?: string;
  siteId?: string | null;
  ownerId?: string;
  reviewDate?: string | null;
  hazards?: RiskAssessmentHazardInput[];
}

export interface UpdateRiskAssessmentStatusInput {
  status: RiskAssessmentStatus;
}

/* -------------------------------------------------------------------------- */
/* HSE audits                                                                 */
/* -------------------------------------------------------------------------- */

export const AUDIT_TYPES = [
  "INTERNAL",
  "EXTERNAL",
  "SUPPLIER",
  "CERTIFICATION",
] as const;

export type AuditType = (typeof AUDIT_TYPES)[number];

export const AUDIT_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const AUDIT_CHECKLIST_RESULTS = [
  "PENDING",
  "COMPLIANT",
  "NON_COMPLIANT",
  "NOT_APPLICABLE",
] as const;

export type AuditChecklistResult = (typeof AUDIT_CHECKLIST_RESULTS)[number];

export const AUDIT_FINDING_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type AuditFindingSeverity = (typeof AUDIT_FINDING_SEVERITIES)[number];

export interface AuditUserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface AuditProjectRef {
  id: string;
  name: string | null;
}

export interface AuditSiteRef {
  id: string;
  name: string | null;
  code: string | null;
}

export interface AuditCorrectiveActionRef {
  id: string;
  description: string | null;
  status: string | null;
}

export interface AuditChecklistItem {
  id: string;
  item: string;
  result: AuditChecklistResult;
  notes: string;
}

export interface AuditFinding {
  id: string;
  description: string;
  severity: AuditFindingSeverity;
  recommendation: string | null;
  correctiveAction: AuditCorrectiveActionRef | null;
  createdAt: string;
}

/** Audit mirror of `toHseAuditSummary`. */
export interface HseAuditSummary {
  id: string;
  title: string;
  type: AuditType;
  status: AuditStatus;
  project: AuditProjectRef;
  site: AuditSiteRef | null;
  auditors: AuditUserRef[];
  scheduledFor: string;
  description: string;
  completionNotes: string | null;
  completedAt: string | null;
  completedBy: AuditUserRef | null;
  checklist: AuditChecklistItem[];
  findings: AuditFinding[];
  createdBy: AuditUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditsResponse {
  success: boolean;
  audits: HseAuditSummary[];
  pagination: ApiPagination;
}

export interface AuditResponse {
  success: boolean;
  audit: HseAuditSummary;
}

export interface AuditAssignee {
  id: string;
  firstName: string;
  lastName: string;
  ikoshRole: IkoshRole;
}

export interface AuditAssigneesResponse {
  success: boolean;
  assignees: AuditAssignee[];
}

/** Response for raising a corrective action from an audit finding. */
export interface AuditCorrectiveActionResponse extends AuditResponse {
  correctiveAction: CorrectiveActionSummary;
}

export interface AuditChecklistItemInput {
  item: string;
  notes?: string;
}

export interface CreateHseAuditInput {
  title: string;
  type: AuditType;
  projectId: string;
  siteId?: string;
  auditorIds: string[];
  scheduledFor: string;
  description?: string;
  checklist?: AuditChecklistItemInput[];
}

/** `siteId: null` clears the site; omitting it leaves the current site. */
export interface UpdateHseAuditInput {
  title?: string;
  type?: AuditType;
  projectId?: string;
  siteId?: string | null;
  auditorIds?: string[];
  scheduledFor?: string;
  description?: string;
}

export interface UpdateHseAuditStatusInput {
  status: AuditStatus;
  completionNotes?: string;
}

export interface CreateAuditChecklistItemInput {
  item: string;
  notes?: string;
}

export interface UpdateAuditChecklistItemInput {
  result: AuditChecklistResult;
  notes?: string;
}

export interface CreateAuditFindingInput {
  description: string;
  severity: AuditFindingSeverity;
  recommendation?: string;
}

export interface LinkAuditCorrectiveActionInput {
  assignedTo: string;
  dueDate: string;
  description?: string;
}

/* -------------------------------------------------------------------------- */
/* Audit log                                                                  */
/* -------------------------------------------------------------------------- */

export interface AuditLogEntry {
  id: string;
  actor: { id: string };
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogResponse {
  success: boolean;
  data: {
    auditLog: AuditLogEntry[];
  };
}

/* -------------------------------------------------------------------------- */
/* HSE training and toolbox talks                                             */
/* -------------------------------------------------------------------------- */

export const TRAINING_COURSE_CATEGORIES = [
  "INDUCTION",
  "PPE",
  "WORK_AT_HEIGHT",
  "CONFINED_SPACE",
  "FIRE_SAFETY",
  "FIRST_AID",
  "PERMIT_TO_WORK",
  "ENVIRONMENTAL",
  "DRIVING",
  "OTHER",
] as const;

export type TrainingCourseCategory =
  (typeof TRAINING_COURSE_CATEGORIES)[number];

/** Attendance-record lifecycle shared by training sessions and toolbox talks. */
export const ATTENDANCE_RECORD_STATUSES = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type AttendanceRecordStatus =
  (typeof ATTENDANCE_RECORD_STATUSES)[number];

export const WORKFORCE_PARTICIPANT_KINDS = ["EMPLOYEE", "CONTRACTOR"] as const;

export type WorkforceParticipantKind =
  (typeof WORKFORCE_PARTICIPANT_KINDS)[number];

export const PARTICIPANT_ATTENDANCE_STATES = [
  "INVITED",
  "ATTENDED",
  "ABSENT",
] as const;

export type ParticipantAttendanceState =
  (typeof PARTICIPANT_ATTENDANCE_STATES)[number];

/** Derived from recorded certificate dates only; never a competency claim. */
export type CertificateState =
  | "NOT_RECORDED"
  | "RECORDED"
  | "VALID"
  | "EXPIRING_SOON"
  | "EXPIRED";

export interface WorkforceUserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TrainingCourseRef {
  id: string;
  code: string | null;
  title: string | null;
  category: TrainingCourseCategory | null;
}

export interface TrainingProjectRef {
  id: string;
  name: string | null;
}

export interface TrainingSiteRef {
  id: string;
  name: string | null;
  code: string | null;
}

export interface TrainingCourseSummary {
  id: string;
  code: string;
  title: string;
  category: TrainingCourseCategory;
  defaultDurationMinutes: number | null;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingCoursesResponse {
  success: boolean;
  courses: TrainingCourseSummary[];
}

export interface TrainingCourseResponse {
  success: boolean;
  course: TrainingCourseSummary;
}

export interface TrainingParticipant {
  id: string;
  kind: WorkforceParticipantKind;
  employeeId: string | null;
  contractorPersonnelId: string | null;
  contractor: { id: string; name: string | null } | null;
  name: string;
  attendance: ParticipantAttendanceState;
  completed: boolean;
  certificateNumber: string | null;
  certificateIssuedOn: string | null;
  certificateExpiresOn: string | null;
  certificateState: CertificateState;
  notes: string | null;
}

export interface TrainingSessionSummary {
  id: string;
  course: TrainingCourseRef;
  project: TrainingProjectRef;
  site: TrainingSiteRef;
  topic: string;
  description: string;
  trainerName: string;
  scheduledDate: string;
  durationMinutes: number;
  status: AttendanceRecordStatus;
  participantCount: number;
  employeeParticipantCount: number;
  contractorParticipantCount: number;
  attendedCount: number;
  completedCount: number;
  participants: TrainingParticipant[];
  completedBy: WorkforceUserRef | null;
  completedAt: string | null;
  cancelledBy: WorkforceUserRef | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdBy: WorkforceUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyTrainingSession
  extends Omit<TrainingSessionSummary, "participants"> {
  participation: TrainingParticipant;
}

export interface TrainingSessionsResponse {
  success: boolean;
  sessions: TrainingSessionSummary[];
  pagination: ApiPagination;
}

export interface TrainingSessionResponse {
  success: boolean;
  session: TrainingSessionSummary;
}

export interface MyTrainingSessionsResponse {
  success: boolean;
  sessions: MyTrainingSession[];
  pagination: ApiPagination;
}

export interface PersonTrainingHistoryResponse {
  success: boolean;
  records: MyTrainingSession[];
  pagination: ApiPagination;
}

export interface TrainingParticipantInput {
  kind: WorkforceParticipantKind;
  employeeId?: string;
  contractorPersonnelId?: string;
  attendance?: ParticipantAttendanceState;
  notes?: string;
  completed?: boolean;
  certificateNumber?: string;
  certificateIssuedOn?: string;
  certificateExpiresOn?: string;
}

export interface CreateTrainingCourseInput {
  code: string;
  title: string;
  category: TrainingCourseCategory;
  defaultDurationMinutes?: number;
  description?: string;
}

export interface UpdateTrainingCourseInput {
  title?: string;
  category?: TrainingCourseCategory;
  defaultDurationMinutes?: number;
  description?: string;
  isActive?: boolean;
}

export interface CreateTrainingSessionInput {
  courseId: string;
  projectId: string;
  siteId: string;
  topic: string;
  description?: string;
  trainerName: string;
  scheduledDate: string;
  durationMinutes: number;
  participants?: TrainingParticipantInput[];
}

export interface UpdateTrainingSessionInput {
  courseId?: string;
  projectId?: string;
  siteId?: string;
  topic?: string;
  description?: string;
  trainerName?: string;
  scheduledDate?: string;
  durationMinutes?: number;
}

export interface UpdateTrainingSessionStatusInput {
  status: AttendanceRecordStatus;
  reason?: string;
}

export interface ToolboxTalkParticipant {
  id: string;
  kind: WorkforceParticipantKind;
  employeeId: string | null;
  contractorPersonnelId: string | null;
  contractor: { id: string; name: string | null } | null;
  name: string;
  attendance: ParticipantAttendanceState;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  notes: string | null;
}

export interface ToolboxTalkSummary {
  id: string;
  project: TrainingProjectRef;
  site: TrainingSiteRef;
  topic: string;
  discussionPoints: string;
  facilitatorName: string;
  scheduledDate: string;
  durationMinutes: number;
  status: AttendanceRecordStatus;
  participantCount: number;
  employeeParticipantCount: number;
  contractorParticipantCount: number;
  attendedCount: number;
  acknowledgedCount: number;
  participants: ToolboxTalkParticipant[];
  completedBy: WorkforceUserRef | null;
  completedAt: string | null;
  cancelledBy: WorkforceUserRef | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdBy: WorkforceUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyToolboxTalk
  extends Omit<ToolboxTalkSummary, "participants"> {
  participation: ToolboxTalkParticipant;
}

export interface ToolboxTalksResponse {
  success: boolean;
  talks: ToolboxTalkSummary[];
  pagination: ApiPagination;
}

export interface ToolboxTalkResponse {
  success: boolean;
  talk: ToolboxTalkSummary;
}

export interface MyToolboxTalksResponse {
  success: boolean;
  talks: MyToolboxTalk[];
  pagination: ApiPagination;
}

export interface PersonToolboxTalkHistoryResponse {
  success: boolean;
  records: MyToolboxTalk[];
  pagination: ApiPagination;
}

export interface ToolboxTalkParticipantInput {
  kind: WorkforceParticipantKind;
  employeeId?: string;
  contractorPersonnelId?: string;
  attendance?: ParticipantAttendanceState;
  notes?: string;
  acknowledged?: boolean;
}

export interface CreateToolboxTalkInput {
  projectId: string;
  siteId: string;
  topic: string;
  discussionPoints?: string;
  facilitatorName: string;
  scheduledDate: string;
  durationMinutes: number;
  participants?: ToolboxTalkParticipantInput[];
}

export interface UpdateToolboxTalkInput {
  projectId?: string;
  siteId?: string;
  topic?: string;
  discussionPoints?: string;
  facilitatorName?: string;
  scheduledDate?: string;
  durationMinutes?: number;
}

export interface UpdateToolboxTalkStatusInput {
  status: AttendanceRecordStatus;
  reason?: string;
}
