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
import {
  createContractorPersonnelSchema,
  createContractorPersonnelSiteAssignmentSchema,
  updateContractorPersonnelSchema,
} from "../lib/validation/contractor-personnel.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import { canViewAllSites } from "../lib/hse-permissions.js";
import { assertSiteAccess } from "../lib/site-access.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import {
  contractorPersonnelAuditSnapshot,
  contractorPersonnelSiteAssignmentAuditSnapshot,
} from "../lib/audit-snapshots.js";
import { ContractorPersonnel } from "../models/ContractorPersonnel.js";
import { ContractorPersonnelSiteAssignment } from "../models/ContractorPersonnelSiteAssignment.js";
import { Contractor } from "../models/Contractor.js";
import {
  toContractorPersonnelSiteAssignmentSummary,
  toContractorPersonnelSummary,
} from "../serializers/contractor-personnel.js";
import {
  assertAssignableSite,
  hasActiveAssignmentsForPersonnel,
  personnelIdsAssignedToSites,
} from "../lib/contractor-personnel-assignments.js";

const router: Router = Router();

const ASSIGNMENT_POPULATE = [
  { path: "site", select: "name code" },
  { path: "assignedBy", select: "firstName lastName" },
  { path: "endedBy", select: "firstName lastName" },
];

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function rejectLegacySiteId(body: unknown): void {
  if (typeof body === "object" && body !== null && "siteId" in body) {
    throw new HttpError(
      400,
      "siteId is no longer accepted. Use POST /api/contractor-personnel/:id/assignments to assign sites.",
    );
  }
}

function toActiveSiteRef(value: unknown): {
  id: string;
  name: string | null;
} {
  if (typeof value === "object" && value !== null && "_id" in value) {
    const populated = value as { _id: unknown; name?: unknown };

    return {
      id: String(populated._id),
      name: typeof populated.name === "string" ? populated.name : null,
    };
  }

  return { id: String(value), name: null };
}

// All contractor personnel routes require authenticated, active IKOSH employee.
router.use(requireAuth(digitAuth), attachIkoshUser);

// List contractor personnel with pagination and filters. Only HSE_MANAGER + ADMIN can
// include inactive personnel or see those assigned to unassigned sites.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const includeInactive =
    req.query.includeInactive === "true" &&
    isHseManagementRole(viewer.ikoshRole);
  const contractorId =
    typeof req.query.contractorId === "string"
      ? req.query.contractorId
      : undefined;

  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;

  if (contractorId && !Types.ObjectId.isValid(contractorId)) {
    throw new HttpError(400, "Invalid contractor ID.");
  }

  if (siteId && !Types.ObjectId.isValid(siteId)) {
    throw new HttpError(400, "Invalid site ID.");
  }

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const contractorFilter = contractorId
    ? { contractor: new Types.ObjectId(contractorId) }
    : {};

  // Site filtering uses active assignment records, with legacy
  // `ContractorPersonnel.site` values included until the backfill is verified.
  let allowedSiteIds: Types.ObjectId[] | null = null;

  if (siteId) {
    allowedSiteIds = [new Types.ObjectId(siteId)];
  } else if (!canViewAllSites(viewer.ikoshRole)) {
    allowedSiteIds = (viewer.assignedSites ?? []).map(
      (assignedSite) => new Types.ObjectId(String(assignedSite)),
    );
  }

  const siteFilter =
    allowedSiteIds === null
      ? {}
      : { _id: { $in: await personnelIdsAssignedToSites(allowedSiteIds) } };

  const filter = {
    ...contractorFilter,
    ...siteFilter,
    ...(includeInactive ? {} : { isActive: true }),
  };

  const { page, limit, skip } = parsePagination(req.query);

  const [total, personnel] = await Promise.all([
    ContractorPersonnel.countDocuments(filter),
    ContractorPersonnel.find(filter)
      .lean()
      .populate("contractor", "name")
      .populate("site", "name")
      .sort({ lastName: 1, firstName: 1 })
      .skip(skip)
      .limit(limit),
  ]);

  const personnelIds = personnel.map((person) => person._id);
  const activeAssignments =
    personnelIds.length === 0
      ? []
      : await ContractorPersonnelSiteAssignment.find({
          personnel: { $in: personnelIds },
          isActive: true,
        })
          .populate("site", "name")
          .lean();

  const activeSitesByPersonnel = new Map<
    string,
    { id: string; name: string | null }[]
  >();

  for (const assignment of activeAssignments) {
    const key = String(assignment.personnel);
    const sites = activeSitesByPersonnel.get(key) ?? [];
    sites.push(toActiveSiteRef(assignment.site));
    activeSitesByPersonnel.set(key, sites);
  }

  res.status(200).json({
    success: true,
    personnel: personnel.map((person) =>
      toContractorPersonnelSummary(person, {
        activeSites: activeSitesByPersonnel.get(String(person._id)) ?? [],
      }),
    ),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Contractor personnel detail with active site deployments and full
// assignment history (HSE_MANAGER + ADMIN only).
router.get(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const personnelId = parseObjectIdParam(req.params.id, "personnel");

    const personnel = await ContractorPersonnel.findById(personnelId)
      .populate("contractor", "name")
      .lean();

    if (!personnel) {
      throw new HttpError(404, "Contractor personnel not found.");
    }

    const assignments = await ContractorPersonnelSiteAssignment.find({
      personnel: personnelId,
    })
      .sort({ assignedAt: -1 })
      .populate(ASSIGNMENT_POPULATE)
      .lean();

    const serializedAssignments = assignments.map(
      toContractorPersonnelSiteAssignmentSummary,
    );
    const activeAssignments = assignments.filter(
      (assignment) => assignment.isActive,
    );

    res.status(200).json({
      success: true,
      personnel: toContractorPersonnelSummary(personnel, {
        activeSites: activeAssignments.map((assignment) =>
          toActiveSiteRef(assignment.site),
        ),
      }),
      activeAssignments: serializedAssignments.filter(
        (assignment) => assignment.isActive,
      ),
      assignmentHistory: serializedAssignments,
    });
  },
);

// Add a site assignment for contractor personnel (HSE_MANAGER + ADMIN only).
router.post(
  "/:id/assignments",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const personnelId = parseObjectIdParam(req.params.id, "personnel");

    const parsed = createContractorPersonnelSiteAssignmentSchema.safeParse(
      req.body,
    );
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const viewer = getIkoshUser(req);

    const assignment = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const { personnel, contractor, site } = await assertAssignableSite({
          personnelId,
          siteId: parsed.data.siteId,
          session,
        });

        const created = new ContractorPersonnelSiteAssignment({
          personnel: personnel._id,
          contractor: contractor._id,
          site: site._id,
          assignedAt: new Date(),
          assignedBy: viewer._id,
          isActive: true,
        });

        try {
          await created.save({ session });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new HttpError(
              409,
              "This personnel already has an active assignment to this site.",
            );
          }
          throw error;
        }

        return {
          result: created,
          audit: {
            action: "contractor_personnel.site_assigned",
            entityType: "ContractorPersonnelSiteAssignment",
            entityId: created._id,
            after: contractorPersonnelSiteAssignmentAuditSnapshot(created),
          },
        };
      },
    );

    await assignment.populate(ASSIGNMENT_POPULATE);

    res.status(201).json({
      success: true,
      assignment: toContractorPersonnelSiteAssignmentSummary(assignment),
    });
  },
);

// End a site assignment without deleting its history (HSE_MANAGER + ADMIN only).
router.delete(
  "/:id/assignments/:assignmentId",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const personnelId = parseObjectIdParam(req.params.id, "personnel");
    const assignmentId = parseObjectIdParam(
      req.params.assignmentId,
      "assignment",
    );

    const viewer = getIkoshUser(req);

    const assignment = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const current = await ContractorPersonnelSiteAssignment.findOne({
          _id: assignmentId,
          personnel: personnelId,
        }).session(session);

        if (!current) {
          throw new HttpError(404, "Assignment not found.");
        }

        if (!current.isActive) {
          throw new HttpError(409, "This assignment has already ended.");
        }

        const before = contractorPersonnelSiteAssignmentAuditSnapshot(current);

        current.isActive = false;
        current.endedAt = new Date();
        current.endedBy = viewer._id;

        await current.save({ session });

        return {
          result: current,
          audit: {
            action: "contractor_personnel.site_unassigned",
            entityType: "ContractorPersonnelSiteAssignment",
            entityId: current._id,
            before,
            after: contractorPersonnelSiteAssignmentAuditSnapshot(current),
          },
        };
      },
    );

    await assignment.populate(ASSIGNMENT_POPULATE);

    res.status(200).json({
      success: true,
      assignment: toContractorPersonnelSiteAssignmentSummary(assignment),
    });
  },
);

// Create a contractor personnel (HSE_MANAGER + ADMIN only).
router.post(
  "/",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    rejectLegacySiteId(req.body);

    const parsed = createContractorPersonnelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const viewer = getIkoshUser(req);

    const {
      contractorId,
      firstName,
      lastName,
      personnelId,
      jobTitle,
      phone,
      email,
    } = parsed.data;

    const personnel = await runAuditedMutation(viewer._id, async (session) => {
      // Verify contractor exists.
      const contractor = await Contractor.findById(contractorId).session(
        session,
      );
      if (!contractor) {
        throw new HttpError(404, "Specified contractor was not found.");
      }

      // Validate personnelId uniqueness within contractor if provided.
      if (personnelId) {
        const existing = await ContractorPersonnel.findOne({
          contractor: contractorId,
          personnelId,
        }).session(session);
        if (existing) {
          throw new HttpError(
            409,
            "This personnel ID is already assigned to another person within the contractor.",
          );
        }
      }

      const created = new ContractorPersonnel({
        contractor: contractorId,
        firstName,
        lastName,
        personnelId,
        jobTitle,
        phone,
        email,
      });

      await created.save({ session });

      return {
        result: created,
        audit: {
          action: "contractor_personnel.created",
          entityType: "ContractorPersonnel",
          entityId: created._id,
          after: contractorPersonnelAuditSnapshot(created),
        },
      };
    });

    res.status(201).json({
      success: true,
      personnel: toContractorPersonnelSummary(personnel),
    });
  },
);

// Update a contractor personnel (HSE_MANAGER + ADMIN only).
router.patch(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    rejectLegacySiteId(req.body);

    const personnelId = parseObjectIdParam(req.params.id, "personnel");

    const parsed = updateContractorPersonnelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const viewer = getIkoshUser(req);

    const { contractorId, ...rest } = parsed.data;

    const personnel = await runAuditedMutation(viewer._id, async (session) => {
      const personnel = await ContractorPersonnel.findById(personnelId).session(
        session,
      );
      if (!personnel) {
        throw new HttpError(404, "Contractor personnel not found.");
      }

      const before = contractorPersonnelAuditSnapshot(personnel);

      // Verify contractor exists if being changed.
      if (contractorId !== undefined) {
        const newContractor = await Contractor.findById(contractorId).session(
          session,
        );
        if (!newContractor) {
          throw new HttpError(404, "Specified contractor was not found.");
        }

        if (String(contractorId) !== String(personnel.contractor)) {
          const hasActiveAssignments =
            await hasActiveAssignmentsForPersonnel(
              personnel._id,
              session,
            );

          if (personnel.site || hasActiveAssignments) {
            throw new HttpError(
              409,
              "Cannot change contractor while site assignments exist. End active assignments and resolve the legacy site reference first.",
            );
          }

          personnel.contractor = new Types.ObjectId(contractorId);
        }

        // Validate new personnelId uniqueness within new contractor if provided.
        if (rest.personnelId !== undefined) {
          const duplicate = await ContractorPersonnel.findOne({
            contractor: contractorId,
            personnelId: rest.personnelId,
            _id: { $ne: personnel._id },
          }).session(session);
          if (duplicate) {
            throw new HttpError(
              409,
              "This personnel ID is already assigned to another person within the contractor.",
            );
          }
        }
      }

      // Apply other updates.
      Object.assign(personnel, rest);

      // Validate personnelId uniqueness if being updated within same contractor.
      if (rest.personnelId !== undefined && contractorId === undefined) {
        const duplicate = await ContractorPersonnel.findOne({
          contractor: personnel.contractor,
          personnelId: rest.personnelId,
          _id: { $ne: personnel._id },
        }).session(session);
        if (duplicate) {
          throw new HttpError(
            409,
            "This personnel ID is already assigned to another person within the contractor.",
          );
        }
      }

      try {
        await personnel.save({ session });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new HttpError(
            409,
            "A personnel record with this identifier already exists.",
          );
        }
        throw error;
      }

      return {
        result: personnel,
        audit: {
          action: "contractor_personnel.updated",
          entityType: "ContractorPersonnel",
          entityId: personnel._id,
          before,
          after: contractorPersonnelAuditSnapshot(personnel),
        },
      };
    });

    await personnel.populate([
      { path: "contractor", select: "name" },
      { path: "site", select: "name" },
    ]);

    res.status(200).json({
      success: true,
      personnel: toContractorPersonnelSummary(personnel),
    });
  },
);

// Delete a contractor personnel (HSE_MANAGER + ADMIN only). Blocking if site assignment.
router.delete(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const personnelId = parseObjectIdParam(req.params.id, "personnel");

    await runAuditedMutation(getIkoshUser(req)._id, async (session) => {
      const personnel = await ContractorPersonnel.findById(personnelId).session(
        session,
      );
      if (!personnel) {
        throw new HttpError(404, "Contractor personnel not found.");
      }

      const hasActiveAssignments = await hasActiveAssignmentsForPersonnel(
        personnel._id,
        session,
      );

      if (personnel.site || hasActiveAssignments) {
        throw new HttpError(
          409,
          "Cannot delete personnel with active site assignments. End the assignments and resolve the legacy site reference first.",
        );
      }

      await ContractorPersonnel.deleteOne({ _id: personnelId }, { session });

      return {
        result: personnel,
        audit: {
          action: "contractor_personnel.deleted",
          entityType: "ContractorPersonnel",
          entityId: personnel._id,
          before: contractorPersonnelAuditSnapshot(personnel),
        },
      };
    });

    res.status(200).json({
      success: true,
      message: "Contractor personnel deleted.",
    });
  },
);

export default router;
