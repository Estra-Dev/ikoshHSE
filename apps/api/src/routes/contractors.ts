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
  createContractorSchema,
  updateContractorSchema,
} from "../lib/validation/contractor.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { contractorAuditSnapshot } from "../lib/audit-snapshots.js";
import { Contractor } from "../models/Contractor.js";
import { Project } from "../models/Project.js";
import { ContractorPersonnel } from "../models/ContractorPersonnel.js";
import { toContractorSummary } from "../serializers/contractor.js";

const router: Router = Router();

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

// All contractor routes require authenticated, active IKOSH employee.
router.use(requireAuth(digitAuth), attachIkoshUser);

// List contractors with pagination and filters. Only HSE_MANAGER + ADMIN can
// include inactive contractors.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const includeInactive =
    req.query.includeInactive === "true" &&
    isHseManagementRole(viewer.ikoshRole);

  const filter = includeInactive ? {} : { isActive: true };

  const { page, limit, skip } = parsePagination(req.query);

  const [total, contractors] = await Promise.all([
    Contractor.countDocuments(filter),
    Contractor.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
  ]);

  res.status(200).json({
    success: true,
    contractors: contractors.map(toContractorSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Create a contractor (HSE_MANAGER + ADMIN only).
router.post(
  "/",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createContractorSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const {
      name,
      registrationNumber,
      trade,
      contactName,
      contactEmail,
      contactPhone,
      projects,
    } = parsed.data;

    // Verify engaged projects exist if provided.
    const viewer = getIkoshUser(req);

    const contractor = await runAuditedMutation(
      viewer._id,
      async (session) => {
        if (projects && projects.length > 0) {
          const existingProjects = await Project.find({
            _id: { $in: projects },
          })
            .session(session)
            .lean();
          if (existingProjects.length !== projects.length) {
            throw new HttpError(
              404,
              "One or more specified projects were not found.",
            );
          }
        }

        const created = new Contractor({
          name,
          registrationNumber,
          trade,
          contactName,
          contactEmail,
          contactPhone,
          projects: projects || [],
        });

        try {
          await created.save({ session });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new HttpError(
              409,
              "A contractor with this name or registration number already exists.",
            );
          }
          throw error;
        }

        return {
          result: created,
          audit: {
            action: "contractor.created",
            entityType: "Contractor",
            entityId: created._id,
            after: contractorAuditSnapshot(created),
          },
        };
      },
    );

    res.status(201).json({
      success: true,
      contractor: toContractorSummary(contractor),
    });
  },
);

// Update a contractor (HSE_MANAGER + ADMIN only).
router.patch(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const contractorId = parseObjectIdParam(req.params.id, "contractor");

    const parsed = updateContractorSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    // Verify new projects exist if being changed.
    const { projects, ...rest } = parsed.data;
    const viewer = getIkoshUser(req);

    const contractor = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const contractor = await Contractor.findById(contractorId).session(
          session,
        );
        if (!contractor) {
          throw new HttpError(404, "Contractor not found.");
        }

        const before = contractorAuditSnapshot(contractor);

        if (projects !== undefined) {
          if (projects.length > 0) {
            const existingProjects = await Project.find({
              _id: { $in: projects },
            })
              .session(session)
              .lean();
            if (existingProjects.length !== projects.length) {
              throw new HttpError(
                404,
                "One or more specified projects were not found.",
              );
            }
          }
          contractor.projects = projects.map((id) => new Types.ObjectId(id));
        }

        // Apply other updates.
        Object.assign(contractor, rest);

        try {
          await contractor.save({ session });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new HttpError(
              409,
              "A contractor with this name or registration number already exists.",
            );
          }
          throw error;
        }

        return {
          result: contractor,
          audit: {
            action: "contractor.updated",
            entityType: "Contractor",
            entityId: contractor._id,
            before,
            after: contractorAuditSnapshot(contractor),
          },
        };
      },
    );

    res.status(200).json({
      success: true,
      contractor: toContractorSummary(contractor),
    });
  },
);

// Delete a contractor (HSE_MANAGER + ADMIN only). Blocking if engaged with projects or personnel.
router.delete(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const contractorId = parseObjectIdParam(req.params.id, "contractor");

    await runAuditedMutation(getIkoshUser(req)._id, async (session) => {
      const contractor = await Contractor.findById(contractorId).session(
        session,
      );
      if (!contractor) {
        throw new HttpError(404, "Contractor not found.");
      }

      // Block deletion if engaged with projects or has personnel.
      const [projectsCount, personnelCount] = await Promise.all([
        Project.countDocuments({
          _id: { $in: contractor.projects || [] },
        }).session(session),
        ContractorPersonnel.countDocuments({
          contractor: contractorId,
        }).session(session),
      ]);

      if (projectsCount > 0 || personnelCount > 0) {
        throw new HttpError(
          409,
          "Contractor is still engaged with projects or has assigned personnel. Update relationships or remove personnel first.",
        );
      }

      await Contractor.deleteOne({ _id: contractorId }, { session });

      return {
        result: contractor,
        audit: {
          action: "contractor.deleted",
          entityType: "Contractor",
          entityId: contractor._id,
          before: contractorAuditSnapshot(contractor),
        },
      };
    });

    res.status(200).json({
      success: true,
      message: "Contractor deleted.",
    });
  },
);

export default router;
