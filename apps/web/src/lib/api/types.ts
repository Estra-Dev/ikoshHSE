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
