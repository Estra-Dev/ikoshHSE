export interface SiteLike {
  _id: unknown;
  project: unknown;
  name: string;
  code: string;
  location?: string | null;
  description: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedSiteProject {
  id: string;
  name: string | null;
}

export interface SerializedSite {
  id: string;
  project: SerializedSiteProject;
  name: string;
  code: string;
  location: string | null;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Project references may arrive as an ObjectId or as a populated document.
 * Handling both keeps list/detail responses stable and avoids returning
 * `[object Object]` when a caller populates the project name.
 */
function toProjectRef(project: unknown): SerializedSiteProject {
  if (typeof project === "object" && project !== null && "_id" in project) {
    const populated = project as { _id: unknown; name?: unknown };

    return {
      id: String(populated._id),
      name: typeof populated.name === "string" ? populated.name : null,
    };
  }

  return { id: String(project), name: null };
}

/** Whitelists site response fields and converts the Mongo document to a JSON-safe shape. */
export function toSiteSummary(site: SiteLike): SerializedSite {
  return {
    id: String(site._id),
    project: toProjectRef(site.project),
    name: site.name,
    code: site.code,
    location: site.location ?? null,
    description: site.description ?? "",
    status: site.status,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };
}
