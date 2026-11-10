import type { SiteDocument } from "../models/Site.js";

/** Minimal document shape required to serialize a site. */
export type SiteLike = SiteDocument & { _id: unknown };

export interface SerializedSite {
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

/** Whitelists site response fields and converts the Mongo document to a JSON-safe shape. */
export function toSiteSummary(site: SiteLike): SerializedSite {
  return {
    id: String(site._id),
    project: { id: String(site.project) },
    name: site.name,
    code: site.code,
    location: site.location ?? null,
    description: site.description ?? "",
    status: site.status,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };
}