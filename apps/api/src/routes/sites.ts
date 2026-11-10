import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
} from "../lib/validation/common.js";
import {
  createSiteSchema,
  updateSiteSchema,
} from "../lib/validation/site.js";
import { attachIkoshUser, getIkoshUser } from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import { Site } from "../models/Site.js";
import { Project } from "../models/Project.js";
import { toSiteSummary } from "../serializers/site.js";

const router: Router = Router();

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

// All site routes require authenticated, active IKOSH employee.
router.use(requireAuth(digitAuth), attachIkoshUser);

// List sites with pagination and filters. Projects may be selected; site-level
// access control filters out sites the user is not assigned to (via User.assignedSites).
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const includeInactive = req.query.includeInactive === "true" && isHseManagementRole(viewer.ikoshRole);
  const projectFilter = req.query.projectId ? { project: req.query.projectId } : {};

  // Site-level access control: limit to sites user is assigned to.
  const assignedSites = viewer.assignedSites || [];
  const siteFilter = assignedSites.length > 0 ? { _id: { $in: assignedSites } } : {};

  const filter = {
    ...projectFilter,
    ...(includeInactive ? {} : { status: "ACTIVE" }),
    ...siteFilter,
  };

  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || "20", 10)));
  const skip = (page - 1) * limit;

  const [total, sites] = await Promise.all([
    Site.countDocuments(filter),
    Site.find(filter)
      .populate("project", "name")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
  ]);

  res.status(200).json({
    success: true,
    sites: sites.map(toSiteSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Create a site (HSE_MANAGER + ADMIN only).
router.post(
  "/",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> {
    const parsed = createSiteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { projectId, name, code, location, description, status } = parsed.data;

    // Verify project exists.
    const project = await Project.findById(projectId);
    if (!project) {
      throw new HttpError(404, "Specified project was not found.");
    }

    let site;
    try {
      site = await Site.create({
        project: projectId,
        name,
        code,
        location,
        description: description ?? "",
        status: status ?? "ACTIVE",
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new HttpError(409, "A site with this code already exists.");
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      site: toSiteSummary(site),
    });
  },
);

// Update a site (HSE_MANAGER + ADMIN only).
router.patch(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> {
    const siteId = parseObjectIdParam(req.params.id, "site");

    const parsed = updateSiteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const site = await Site.findById(siteId);
    if (!site) {
      throw new HttpError(404, "Site not found.");
    }

    // Verify new project exists if being changed.
    const { projectId, name, code, location, description, status } = parsed.data;
    if (projectId !== undefined) {
      const newProject = await Project.findById(projectId);
      if (!newProject) {
        throw new HttpError(404, "Specified project was not found.");
      }
      site.project = projectId;
    }

    if (name !== undefined) site.name = name;
    if (code !== undefined) site.code = code;
    if (location !== undefined) site.location = location;
    if (description !== undefined) site.description = description ?? "";
    if (status !== undefined) site.status = status;

    try {
      await site.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new HttpError(409, "A site with this code already exists.");
      }
      throw error;
    }

    await site.populate("project", "name");

    res.status(200).json({
      success: true,
      site: toSiteSummary(site),
    });
  },
);

// Delete a site (HSE_MANAGER + ADMIN only). Blocking if assigned employees or personnel.
router.delete(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> {
    const siteId = parseObjectIdParam(req.params.id, "site");

    const site = await Site.findById(siteId);
    if (!site) {
      throw new HttpError(404, "Site not found.");
    }

    // Block deletion if employees or contractor personnel are assigned to this site.
    const User = require("./src/models/User.js").default;
    const ContractorPersonnel = require("./src/models/ContractorPersonnel.js").default;

    const [employeesCount, personnelCount] = await Promise.all([
      User.countDocuments({ assignedSites: siteId }),
      ContractorPersonnel.countDocuments({ site: siteId }),
    ]);

    if (employeesCount > 0 || personnelCount > 0) {
      throw new HttpError(409, `Site still has assigned employees or personnel. Reassign or deactivate them first.`);
    }

    await Site.deleteOne({ _id: siteId });

    res.status(200).json({
      success: true,
      message: "Site deleted.",
    });
  },
);

export default router;