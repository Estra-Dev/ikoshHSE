import {
  isEmploymentType,
  isIkoshRole,
  type EmploymentType,
  type IkoshRole,
} from "../lib/ikosh-constants.js";
import type { UserDocument } from "../models/User.js";

/**
 * Basic information visible to every active employee in the directory and
 * on other employees' profiles. Sensitive employment and administrative
 * information is intentionally excluded.
 */
export interface SerializedEmployeeBasic {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  location: string | null;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
}

export interface EmployeeManagerSummary {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
}

/**
 * Full profile including employment and administrative information. Only
 * returned for the employee's own profile, or to management roles
 * (SUPERVISOR, HSE_OFFICER, ADMIN).
 */
export interface SerializedEmployeeFull extends SerializedEmployeeBasic {
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

/**
 * HSE personnel view used by the access-management directory. It adds only
 * the HSE-relevant administrative fields (role, active status and site
 * assignments) to the basic profile and deliberately omits HR employment
 * information.
 */
export interface SerializedHsePersonnel extends SerializedEmployeeBasic {
  ikoshRole: IkoshRole;
  isActive: boolean;
  assignedSites: string[];
}

/** Minimal document shape required to serialize a user. */
export type UserLike = UserDocument & { _id: unknown };

interface PopulatedDepartment {
  _id: unknown;
  name: string;
}

interface PopulatedManager {
  _id: unknown;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
}

function toDepartmentRef(
  department: unknown,
): { id: string; name: string } | null {
  if (
    department === null ||
    department === undefined ||
    typeof department !== "object"
  ) {
    return null;
  }

  const populated = department as Partial<PopulatedDepartment>;

  if (typeof populated.name !== "string") {
    return null;
  }

  return { id: String(populated._id), name: populated.name };
}

function toManagerSummary(manager: unknown): EmployeeManagerSummary | null {
  if (
    manager === null ||
    manager === undefined ||
    typeof manager !== "object"
  ) {
    return null;
  }

  const populated = manager as Partial<PopulatedManager>;

  if (typeof populated.firstName !== "string") {
    return null;
  }

  return {
    id: String(populated._id),
    firstName: populated.firstName,
    lastName: typeof populated.lastName === "string" ? populated.lastName : "",
    jobTitle:
      typeof populated.jobTitle === "string" ? populated.jobTitle : null,
  };
}

/**
 * Site ids as plain strings. Works both for unpopulated ObjectId arrays and
 * populated site documents, so callers do not need to populate.
 */
function toAssignedSiteIds(sites: unknown): string[] {
  if (!Array.isArray(sites)) {
    return [];
  }

  return sites.map((site) => {
    if (typeof site === "object" && site !== null && "_id" in site) {
      return String((site as { _id: unknown })._id);
    }

    return String(site);
  });
}

/**
 * Basic profile: name, contact details, job title and department. Never
 * exposes employment, role or administrative status.
 */
export function toBasicUserProfile(
  user: UserLike,
): SerializedEmployeeBasic {
  return {
    id: String(user._id),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? null,
    location: user.location ?? null,
    jobTitle: user.jobTitle ?? null,
    department: toDepartmentRef(user.department),
  };
}

/** Full profile, including sensitive employment and administrative fields. */
export function toFullUserProfile(
  user: UserLike,
): SerializedEmployeeFull {
  return {
    ...toBasicUserProfile(user),
    employeeId: user.employeeId ?? null,
    employmentType: isEmploymentType(user.employmentType)
      ? user.employmentType
      : null,
    hireDate: user.hireDate ? user.hireDate.toISOString() : null,
    manager: toManagerSummary(user.managerId),
    ikoshRole: isIkoshRole(user.ikoshRole) ? user.ikoshRole : "EMPLOYEE",
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    assignedSites: toAssignedSiteIds(user.assignedSites),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * HSE personnel summary for access management. Includes role, active status
 * and assigned site ids, but no HR employment information.
 */
export function toHsePersonnelSummary(
  user: UserLike,
): SerializedHsePersonnel {
  return {
    ...toBasicUserProfile(user),
    ikoshRole: isIkoshRole(user.ikoshRole) ? user.ikoshRole : "EMPLOYEE",
    isActive: user.isActive,
    assignedSites: toAssignedSiteIds(user.assignedSites),
  };
}
