import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
} from "../lib/validation/common.js";
import {
  createProjectSchema,
  updateProjectSchema,
} from "../lib/validation/project.js";
import { attachIkoshUser, getIkoshUser } from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
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
  const includeInactive = req.query.includeInactive === "true" && isHseManagementRole(viewer.ikoshRole);

  const filter = includeInactive ? {} : { status: "ACTIVE" };

  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || "20", 10)));
  const skip = (page - 1) * limit;

  const [total, projects] = await Promise.all([
    Project.countDocuments(filter),
    Project.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
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

// Create a project (HSE_MANAGER + ADMIN only).
router.post(
  "/",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { name, code, description, client, location, status, startDate, endDate } = parsed.data;

    let project;
    try {
      project = await Project.create({
        name,
        code,
        description: description ?? "",
        client,
        location,
        status: status ?? "ACTIVE",
        startDate,
        endDate,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new HttpError(409, "A project with this name or code already exists.");
      }
      throw error;
    }

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
  async (req: Request, res: Response): Promise<void> {
    const projectId = parseObjectIdParam(req.params.id, "project");

    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const project = await Project.findById(projectId);
    if (!project) {
      throw new HttpError(404, "Project not found.");
    }

    const { name, code, description, client, location, status, startDate, endDate } = parsed.data;

    if (name !== undefined) project.name = name;
    if (code !== undefined) project.code = code;
    if (description !== undefined) project.description = description ?? "";
    if (client !== undefined) project.client = client;
    if (location !== undefined) project.location = location;
    if (status !== undefined) project.status = status;
    if (startDate !== undefined) project.startDate = startDate;
    if (endDate !== undefined) project.endDate = endDate;

    try {
      await project.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new HttpError(409, "A project with this name or code already exists.");
      }
      throw error;
    }

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
  async (req: Request, res: Response): Promise<void> {
    const projectId = parseObjectIdParam(req.params.id, "project");

    const project = await Project.findById(projectId);
    if (!project) {
      throw new HttpError(404, "Project not found.");
    }

    const sitesCount = await require("./src/models/Site.js").default?.countDocuments?.({ project: projectId }) ?? 0;
    if (sitesCount > 0) {
      throw new HttpError(409, `Project still has ${sitesCount} site${sitesCount === 1 ? "" : "s"}. Delete or archive them first.`);
    }

    await Project.deleteOne({ _id: projectId });

    res.status(200).json({
      success: true,
      message: "Project deleted.",
    });
  },
);

export default router;