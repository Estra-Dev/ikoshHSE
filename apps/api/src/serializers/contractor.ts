import type { ContractorDocument } from "../models/Contractor.js";

/** Minimal document shape required to serialize a contractor. */
export type ContractorLike = ContractorDocument & { _id: unknown };

export interface SerializedContractor {
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

/** Whitelists contractor response fields and converts the Mongo document to a JSON-safe shape. */
export function toContractorSummary(
  contractor: ContractorLike,
): SerializedContractor {
  return {
    id: String(contractor._id),
    name: contractor.name,
    registrationNumber: contractor.registrationNumber ?? null,
    trade: contractor.trade ?? null,
    contactName: contractor.contactName ?? null,
    contactEmail: contractor.contactEmail ?? null,
    contactPhone: contractor.contactPhone ?? null,
    projects: (contractor.projects ?? []).map((projectId) => ({ id: String(projectId) })),
    isActive: contractor.isActive,
    createdAt: contractor.createdAt.toISOString(),
    updatedAt: contractor.updatedAt.toISOString(),
  };
}