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
  employees: EmployeeBasic[];
  pagination: DirectoryPagination;
}

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

export interface SiteSummary {
  id: string;
  project: { id: string };
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
