import type { DepartmentDocument } from "../models/Department.js";

export interface DepartmentHeadSummary {
  id: string;
  firstName: string;
  lastName: string;
}

export interface SerializedDepartment {
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

interface PopulatedHead {
  _id: unknown;
  firstName: string;
  lastName: string;
}

/** Minimal document shape required to serialize a department. */
export type DepartmentLike = DepartmentDocument & { _id: unknown };

function toHeadSummary(head: unknown): DepartmentHeadSummary | null {
  if (head === null || head === undefined) {
    return null;
  }

  const populatedHead = head as PopulatedHead;

  return {
    id: String(populatedHead._id),
    firstName: populatedHead.firstName,
    lastName: populatedHead.lastName,
  };
}

/**
 * Whitelists department response fields and converts the Mongo document to
 * a JSON-safe shape. Raw document properties are never serialized directly.
 */
export function toDepartmentSummary(
  department: DepartmentLike,
  head: unknown,
  memberCount: number,
): SerializedDepartment {
  return {
    id: String(department._id),
    name: department.name,
    code: department.code,
    description: department.description,
    head: toHeadSummary(head),
    memberCount,
    isActive: department.isActive,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  };
}
