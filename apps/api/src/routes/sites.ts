import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import { Types } from "mongoose";
import {
  firstValidationIssue,
  parseObjectIdParam,
  parsePagination,
} from "../lib/validation/common.js";
import { createSiteSchema, updateSiteSchema } from "../lib/validation/site.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import {
  assertSiteAccess,
  siteScopeFilter,
} from "../lib/site-access.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { siteAuditSnapshot } from "../lib/audit-snapshots.js";
import { Site } from "../models/Site.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { ContractorPersonnel } from "../models/ContractorPersonnel.js";
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
  const includeInactive =
    req.query.includeInactive === "true" &&
    isHseManagementRole(viewer.ikoshRole);
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;

  if (projectId && !Types.ObjectId.isValid(projectId)) {
    throw new HttpError(400, "Invalid project ID.");
  }

  const projectFilter = projectId
    ? { project: new Types.ObjectId(projectId) }
    : {};

  // Site-level access control: HSE management sees all; everyone else sees
  // only assigned sites, and empty assignments match no sites.
  const siteFilter = siteScopeFilter(viewer);

  const filter = {
    ...projectFilter,
    ...(includeInactive ? {} : { status: "ACTIVE" as const }),
    ...siteFilter,
  };

  const { page, limit, skip } = parsePagination(req.query);

  const [total, sites] = await Promise.all([
    Site.countDocuments(filter),
    Site.find(filter)
      .populate("project", "name")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
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

// Site detail. Site access is enforced for every role, and non-management
// viewers cannot open sites outside their assignments or non-active sites.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const siteId = parseObjectIdParam(req.params.id, "site");
  const viewer = getIkoshUser(req);

  assertSiteAccess(viewer, siteId);

  const site = await Site.findById(siteId)
    .populate("project", "name")
    .lean();

  if (
    !site ||
    (site.status !== "ACTIVE" && !isHseManagementRole(viewer.ikoshRole))
  ) {
    throw new HttpError(404, "Site not found.");
  }

  res.status(200).json({
    success: true,
    site: toSiteSummary(site),
  });
});

// Create a site (HSE_MANAGER + ADMIN only).
router.post(
  "/",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createSiteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { projectId, name, code, location, description, status } =
      parsed.data;
    const viewer = getIkoshUser(req);

    const site = await runAuditedMutation(viewer._id, async (session) => {
      // Verify project exists.
      const project = await Project.findById(projectId).session(session);
      if (!project) {
        throw new HttpError(404, "Specified project was not found.");
      }

      const created = new Site({
        project: projectId,
        name,
        code,
        location,
        description: description ?? "",
        status: status ?? "ACTIVE",
      });

      try {
        await created.save({ session });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new HttpError(409, "A site with this code already exists.");
        }
        throw error;
      }

      return {
        result: created,
        audit: {
          action: "site.created",
          entityType: "Site",
          entityId: created._id,
          after: siteAuditSnapshot(created),
        },
      };
    });

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
  async (req: Request, res: Response): Promise<void> => {
    const siteId = parseObjectIdParam(req.params.id, "site");

    const parsed = updateSiteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { projectId, name, code, location, description, status } =
      parsed.data;
    const viewer = getIkoshUser(req);

    const site = await runAuditedMutation(viewer._id, async (session) => {
      const site = await Site.findById(siteId).session(session);
      if (!site) {
        throw new HttpError(404, "Site not found.");
      }

      const before = siteAuditSnapshot(site);

      // Verify new project exists if being changed.
      if (projectId !== undefined) {
        const newProject = await Project.findById(projectId).session(session);
        if (!newProject) {
          throw new HttpError(404, "Specified project was not found.");
        }
        site.project = new Types.ObjectId(projectId);
      }

      if (name !== undefined) site.name = name;
      if (code !== undefined) site.code = code;
      if (location !== undefined) site.location = location;
      if (description !== undefined) site.description = description ?? "";
      if (status !== undefined) site.status = status;

      try {
        await site.save({ session });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new HttpError(409, "A site with this code already exists.");
        }
        throw error;
      }

      return {
        result: site,
        audit: {
          action: "site.updated",
          entityType: "Site",
          entityId: site._id,
          before,
          after: siteAuditSnapshot(site),
        },
      };
    });

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
  async (req: Request, res: Response): Promise<void> => {
    const siteId = parseObjectIdParam(req.params.id, "site");

    await runAuditedMutation(getIkoshUser(req)._id, async (session) => {
      const site = await Site.findById(siteId).session(session);
      if (!site) {
        throw new HttpError(404, "Site not found.");
      }

      // Block deletion if employees or contractor personnel are assigned to this site.
      const [employeesCount, personnelCount] = await Promise.all([
        User.countDocuments({ assignedSites: siteId }).session(session),
        ContractorPersonnel.countDocuments({ site: siteId }).session(session),
      ]);

      if (employeesCount > 0 || personnelCount > 0) {
        throw new HttpError(
          409,
          `Site still has assigned employees or personnel. Reassign or deactivate them first.`,
        );
      }

      await Site.deleteOne({ _id: siteId }, { session });

      return {
        result: site,
        audit: {
          action: "site.deleted",
          entityType: "Site",
          entityId: site._id,
          before: siteAuditSnapshot(site),
        },
      };
    });

    res.status(200).json({
      success: true,
      message: "Site deleted.",
    });
  },
);

export default router;
