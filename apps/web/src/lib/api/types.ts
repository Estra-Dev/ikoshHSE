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
  reportedBy: { id: string };
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
