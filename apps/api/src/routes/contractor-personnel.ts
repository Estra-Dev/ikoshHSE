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
  updateContractorPersonnelSchema,
} from "../lib/validation/contractor-personnel.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import { assertSiteAccess, siteScopeFilter } from "../lib/site-access.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { contractorPersonnelAuditSnapshot } from "../lib/audit-snapshots.js";
import { ContractorPersonnel } from "../models/ContractorPersonnel.js";
import { Contractor } from "../models/Contractor.js";
import { Site } from "../models/Site.js";
import { toContractorPersonnelSummary } from "../serializers/contractor-personnel.js";

const router: Router = Router();

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
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

  const siteFilter = siteId
    ? { site: new Types.ObjectId(siteId) }
    : siteScopeFilter(viewer, "site");
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

  res.status(200).json({
    success: true,
    personnel: personnel.map(toContractorPersonnelSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Create a contractor personnel (HSE_MANAGER + ADMIN only).
router.post(
  "/",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
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
      siteId,
    } = parsed.data;

    const personnel = await runAuditedMutation(viewer._id, async (session) => {
      // Verify contractor exists.
      const contractor = await Contractor.findById(contractorId).session(
        session,
      );
      if (!contractor) {
        throw new HttpError(404, "Specified contractor was not found.");
      }

      // Verify site exists if being assigned.
      if (siteId) {
        const site = await Site.findById(siteId).session(session);
        if (!site) {
          throw new HttpError(404, "Specified site was not found.");
        }
        assertSiteAccess(viewer, siteId);
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
        site: siteId,
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
    const personnelId = parseObjectIdParam(req.params.id, "personnel");

    const parsed = updateContractorPersonnelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const viewer = getIkoshUser(req);

    const { contractorId, siteId, ...rest } = parsed.data;

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
        personnel.contractor = new Types.ObjectId(contractorId);

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

      // Verify site exists if being changed.
      if (siteId !== undefined) {
        if (siteId) {
          const newSite = await Site.findById(siteId).session(session);
          if (!newSite) {
            throw new HttpError(404, "Specified site was not found.");
          }
          assertSiteAccess(viewer, siteId);
        }
        personnel.site = siteId ? new Types.ObjectId(siteId) : null;
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

      if (personnel.site) {
        throw new HttpError(
          409,
          "Cannot delete personnel with active site assignment. Reassign or remove site first.",
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
