import type { ProjectDocument } from "../models/Project.js";

/** Minimal document shape required to serialize a project. */
export type ProjectLike = ProjectDocument & { _id: unknown };

export interface SerializedProject {
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

/** Whitelists project response fields and converts the Mongo document to a JSON-safe shape. */
export function toProjectSummary(project: ProjectLike): SerializedProject {
  return {
    id: String(project._id),
    name: project.name,
    code: project.code,
    description: project.description ?? "",
    client: project.client ?? null,
    location: project.location ?? null,
    status: project.status,
    startDate: project.startDate ? project.startDate.toISOString() : null,
    endDate: project.endDate ? project.endDate.toISOString() : null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}