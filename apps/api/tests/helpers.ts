import type { AuthenticatedUser } from "@digit-auth/node";
import type { Types } from "mongoose";
import { User, type UserDocument } from "../src/models/User.js";
import { Department, type DepartmentDocument } from "../src/models/Department.js";
import { registerDigitAuthUser } from "./digit-auth-stub.ts";

let counter = 0;

export interface CreateIkoshUserOptions {
  digitAuthUserId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  ikoshRole?: string;
  isActive?: boolean;
  department?: Types.ObjectId;
  employeeId?: string;
  jobTitle?: string;
  phone?: string;
  location?: string;
  employmentType?: string;
  hireDate?: Date;
  managerId?: Types.ObjectId;
  assignedSites?: Types.ObjectId[];
}

/**
 * Creates an IKOSH user record in MongoDB, mirroring what the DigitAuth
 * webhook would have synced.
 */
export async function createIkoshUser(
  options: CreateIkoshUserOptions = {},
): Promise<UserDocument> {
  counter += 1;

  return User.create({
    digitAuthUserId: options.digitAuthUserId ?? `da_user_${counter}`,
    digitAuthApplicationId: "da_app_test",
    email: options.email ?? `employee${counter}@ikosh.test`,
    firstName: options.firstName ?? "Test",
    lastName: options.lastName ?? `Employee ${counter}`,
    ...(options.ikoshRole !== undefined ? { ikoshRole: options.ikoshRole } : {}),
    ...(options.isActive !== undefined ? { isActive: options.isActive } : {}),
    ...(options.department !== undefined ? { department: options.department } : {}),
    ...(options.employeeId !== undefined ? { employeeId: options.employeeId } : {}),
    ...(options.jobTitle !== undefined ? { jobTitle: options.jobTitle } : {}),
    ...(options.phone !== undefined ? { phone: options.phone } : {}),
    ...(options.location !== undefined ? { location: options.location } : {}),
    ...(options.employmentType !== undefined
      ? { employmentType: options.employmentType }
      : {}),
    ...(options.hireDate !== undefined ? { hireDate: options.hireDate } : {}),
    ...(options.managerId !== undefined ? { managerId: options.managerId } : {}),
    ...(options.assignedSites !== undefined
      ? { assignedSites: options.assignedSites }
      : {}),
  });
}

export interface CreateDepartmentOptions {
  name?: string;
  code?: string;
  description?: string;
  headId?: Types.ObjectId | null;
  isActive?: boolean;
}

/** Creates a department record directly in MongoDB. */
export async function createDepartment(
  options: CreateDepartmentOptions = {},
): Promise<DepartmentDocument> {
  counter += 1;

  return Department.create({
    name: options.name ?? `Department ${counter}`,
    code: options.code ?? `DEPT${counter}`,
    description: options.description ?? "",
    head: options.headId ?? null,
    ...(options.isActive !== undefined ? { isActive: options.isActive } : {}),
  });
}

/**
 * Creates an IKOSH user and returns everything needed to act as them.
 */
export async function signInAsIkoshUser(
  options: CreateIkoshUserOptions = {},
): Promise<{ user: UserDocument; authorization: string }> {
  const user = await createIkoshUser(options);
  const digitAuthUser = makeDigitAuthUser(user.digitAuthUserId);
  return { user, authorization: signInAs(digitAuthUser) };
}

/** Builds a DigitAuth authenticated identity for a given user id. */
export function makeDigitAuthUser(
  id: string,
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id,
    email: `${id}@digitauth.test`,
    firstName: "DigitAuth",
    lastName: "User",
    role: "USER",
    status: "ACTIVE",
    emailVerified: true,
    failedLoginAttempts: 0,
    ...overrides,
  };
}

/**
 * Registers the DigitAuth identity against a fresh bearer token and returns
 * the ready-to-use `Authorization` header value.
 */
export function signInAs(user: AuthenticatedUser): string {
  counter += 1;
  const token = `access_token_${user.id}_${counter}`;
  registerDigitAuthUser(token, user);
  return `Bearer ${token}`;
}
