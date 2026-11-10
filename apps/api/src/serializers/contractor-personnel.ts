import type { ContractorPersonnelDocument } from "../models/ContractorPersonnel.js";

/** Minimal document shape required to serialize a contractor personnel. */
export type ContractorPersonnelLike = ContractorPersonnelDocument & { _id: unknown };

export interface SerializedContractorPersonnel {
  id: string;
  contractor: { id: string };
  firstName: string;
  lastName: string;
  personnelId: string | null;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  site: { id: string } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Whitelists contractor personnel response fields and converts the Mongo document to a JSON-safe shape. */
export function toContractorPersonnelSummary(
  personnel: ContractorPersonnelLike,
): SerializedContractorPersonnel {
  return {
    id: String(personnel._id),
    contractor: { id: String(personnel.contractor) },
    firstName: personnel.firstName,
    lastName: personnel.lastName,
    personnelId: personnel.personnelId ?? null,
    jobTitle: personnel.jobTitle ?? null,
    phone: personnel.phone ?? null,
    email: personnel.email ?? null,
    site: personnel.site ? { id: String(personnel.site) } : null,
    isActive: personnel.isActive,
    createdAt: personnel.createdAt.toISOString(),
    updatedAt: personnel.updatedAt.toISOString(),
  };
}