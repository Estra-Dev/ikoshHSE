import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
  parsePagination,
} from "../lib/validation/common.js";
import {
  createProjectSchema,
  updateProjectSchema,
} from "../lib/validation/project.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { projectAuditSnapshot } from "../lib/audit-snapshots.js";
import { Project } from "../models/Project.js";
import { Site } from "../models/Site.js";
import { toProjectSummary } from "../serializers/project.js";

const router: Router = Router();

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

// All project routes require authenticated, active IKOSH employee.
router.use(requireAuth(digitAuth), attachIkoshUser);

// List projects with pagination and filters. Only HSE_MANAGER + ADMIN can
// include inactive projects (where "inactive" means "archived".).
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const includeInactive =
    req.query.includeInactive === "true" &&
    isHseManagementRole(viewer.ikoshRole);

  const filter = includeInactive ? {} : { status: "ACTIVE" as const };

  const { page, limit, skip } = parsePagination(req.query);

  const [total, projects] = await Promise.all([
    Project.countDocuments(filter),
    Project.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
  ]);

  res.status(200).json({
    success: true,
    projects: projects.map(toProjectSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Project detail. Non-management viewers see only active projects; HSE
// management can also open planned, on-hold, completed or cancelled projects.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const projectId = parseObjectIdParam(req.params.id, "project");
  const viewer = getIkoshUser(req);

  const project = await Project.findById(projectId).lean();

  if (
    !project ||
    (project.status !== "ACTIVE" && !isHseManagementRole(viewer.ikoshRole))
  ) {
    throw new HttpError(404, "Project not found.");
  }

  res.status(200).json({
    success: true,
    project: toProjectSummary(project),
  });
});

// Create a project (HSE_MANAGER + ADMIN only).
router.post(
  "/",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const {
      name,
      code,
      description,
      client,
      location,
      status,
      startDate,
      endDate,
    } = parsed.data;

    let project;
    const viewer = getIkoshUser(req);

    project = await runAuditedMutation(viewer._id, async (session) => {
      const created = new Project({
        name,
        code,
        description: description ?? "",
        client,
        location,
        status: status ?? "ACTIVE",
        startDate,
        endDate,
      });

      try {
        await created.save({ session });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new HttpError(
            409,
            "A project with this name or code already exists.",
          );
        }
        throw error;
      }

      return {
        result: created,
        audit: {
          action: "project.created",
          entityType: "Project",
          entityId: created._id,
          after: projectAuditSnapshot(created),
        },
      };
    });

    res.status(201).json({
      success: true,
      project: toProjectSummary(project),
    });
  },
);

// Update a project (HSE_MANAGER + ADMIN only).
router.patch(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const projectId = parseObjectIdParam(req.params.id, "project");

    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const {
      name,
      code,
      description,
      client,
      location,
      status,
      startDate,
      endDate,
    } = parsed.data;

    const project = await runAuditedMutation(
      getIkoshUser(req)._id,
      async (session) => {
        const project = await Project.findById(projectId).session(session);
        if (!project) {
          throw new HttpError(404, "Project not found.");
        }

        const before = projectAuditSnapshot(project);

        if (name !== undefined) project.name = name;
        if (code !== undefined) project.code = code;
        if (description !== undefined) project.description = description ?? "";
        if (client !== undefined) project.client = client;
        if (location !== undefined) project.location = location;
        if (status !== undefined) project.status = status;
        if (startDate !== undefined) project.startDate = startDate;
        if (endDate !== undefined) project.endDate = endDate;

        try {
          await project.save({ session });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new HttpError(
              409,
              "A project with this name or code already exists.",
            );
          }
          throw error;
        }

        return {
          result: project,
          audit: {
            action: "project.updated",
            entityType: "Project",
            entityId: project._id,
            before,
            after: projectAuditSnapshot(project),
          },
        };
      },
    );

    res.status(200).json({
      success: true,
      project: toProjectSummary(project),
    });
  },
);

// Delete a project (HSE_MANAGER + ADMIN only). Blocking if it still has sites.
router.delete(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const projectId = parseObjectIdParam(req.params.id, "project");

    await runAuditedMutation(getIkoshUser(req)._id, async (session) => {
      const project = await Project.findById(projectId).session(session);
      if (!project) {
        throw new HttpError(404, "Project not found.");
      }

      const sitesCount = await Site.countDocuments({
        project: projectId,
      }).session(session);
      if (sitesCount > 0) {
        throw new HttpError(
          409,
          `Project still has ${sitesCount} site${sitesCount === 1 ? "" : "s"}. Delete or archive them first.`,
        );
      }

      await Project.deleteOne({ _id: projectId }, { session });

      return {
        result: project,
        audit: {
          action: "project.deleted",
          entityType: "Project",
          entityId: project._id,
          before: projectAuditSnapshot(project),
        },
      };
    });

    res.status(200).json({
      success: true,
      message: "Project deleted.",
    });
  },
);

export default router;
