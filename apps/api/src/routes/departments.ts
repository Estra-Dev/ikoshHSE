import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
} from "../lib/validation/common.js";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from "../lib/validation/department.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { departmentAuditSnapshot } from "../lib/audit-snapshots.js";
import { Department } from "../models/Department.js";
import { User } from "../models/User.js";
import { toDepartmentSummary } from "../serializers/department.js";

const router: Router = Router();

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

// Every department route requires an authenticated, active IKOSH employee.
router.use(requireAuth(digitAuth), attachIkoshUser);

// List departments with their member counts. Only administrators may
// include inactive departments.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const includeInactive =
    req.query.includeInactive === "true" && viewer.ikoshRole === "ADMIN";

  const departments = await Department.find(
    includeInactive ? {} : { isActive: true },
  )
    .lean()
    .sort({ name: 1 })
    .populate("head", "firstName lastName");

  const memberCounts = await User.aggregate<{
    _id: unknown;
    memberCount: number;
  }>([
    { $match: { department: { $ne: null } } },
    { $group: { _id: "$department", memberCount: { $sum: 1 } } },
  ]);

  const countByDepartment = new Map(
    memberCounts.map((entry) => [String(entry._id), entry.memberCount]),
  );

  res.status(200).json({
    success: true,
    departments: departments.map((department) =>
      toDepartmentSummary(
        department,
        department.head,
        countByDepartment.get(String(department._id)) ?? 0,
      ),
    ),
  });
});

// Create a department (administrators only).
router.post(
  "/",
  requireIkoshRole("ADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createDepartmentSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { name, code, description, headId } = parsed.data;
    const viewer = getIkoshUser(req);

    const { department, head } = await runAuditedMutation(
      viewer._id,
      async (session) => {
        let head = null;

        if (headId) {
          head = await User.findById(headId).session(session);

          if (!head) {
            throw new HttpError(
              400,
              "Specified department head was not found.",
            );
          }
        }

        const created = new Department({
          name,
          code,
          description: description ?? "",
          head: headId ?? null,
        });

        try {
          await created.save({ session });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new HttpError(
              409,
              "A department with this name or code already exists.",
            );
          }

          throw error;
        }

        return {
          result: { department: created, head },
          audit: {
            action: "department.created",
            entityType: "Department",
            entityId: created._id,
            after: departmentAuditSnapshot(created),
          },
        };
      },
    );

    res.status(201).json({
      success: true,
      department: toDepartmentSummary(department, head, 0),
    });
  },
);

// Update a department (administrators only).
router.patch(
  "/:id",
  requireIkoshRole("ADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    const departmentId = parseObjectIdParam(req.params.id, "department");

    const parsed = updateDepartmentSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { name, code, description, headId, isActive } = parsed.data;
    const viewer = getIkoshUser(req);

    const department = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const department = await Department.findById(departmentId).session(
          session,
        );

        if (!department) {
          throw new HttpError(404, "Department not found.");
        }

        const before = departmentAuditSnapshot(department);

        if (headId !== undefined) {
          if (headId) {
            const head = await User.findById(headId).session(session);

            if (!head) {
              throw new HttpError(
                400,
                "Specified department head was not found.",
              );
            }

            department.head = head._id;
          } else {
            department.head = null;
          }
        }

        if (name !== undefined) {
          department.name = name;
        }

        if (code !== undefined) {
          department.code = code;
        }

        if (description !== undefined) {
          department.description = description ?? "";
        }

        if (isActive !== undefined) {
          department.isActive = isActive;
        }

        try {
          await department.save({ session });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new HttpError(
              409,
              "A department with this name or code already exists.",
            );
          }

          throw error;
        }

        return {
          result: department,
          audit: {
            action: "department.updated",
            entityType: "Department",
            entityId: department._id,
            before,
            after: departmentAuditSnapshot(department),
          },
        };
      },
    );

    if (department.head) {
      await department.populate("head", "firstName lastName");
    }

    const memberCount = await User.countDocuments({
      department: department._id,
    });

    res.status(200).json({
      success: true,
      department: toDepartmentSummary(department, department.head, memberCount),
    });
  },
);

// Delete a department (administrators only). Departments with assigned
// employees must be reassigned first.
router.delete(
  "/:id",
  requireIkoshRole("ADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    const departmentId = parseObjectIdParam(req.params.id, "department");

    const viewer = getIkoshUser(req);

    await runAuditedMutation(viewer._id, async (session) => {
      const department = await Department.findById(departmentId).session(
        session,
      );

      if (!department) {
        throw new HttpError(404, "Department not found.");
      }

      const memberCount = await User.countDocuments({
        department: department._id,
      }).session(session);

      if (memberCount > 0) {
        throw new HttpError(
          409,
          `Department still has ${memberCount} assigned employee${
            memberCount === 1 ? "" : "s"
          }. Reassign them before deleting.`,
        );
      }

      await Department.deleteOne({ _id: department._id }, { session });

      return {
        result: department,
        audit: {
          action: "department.deleted",
          entityType: "Department",
          entityId: department._id,
          before: departmentAuditSnapshot(department),
        },
      };
    });

    res.status(200).json({ success: true, message: "Department deleted." });
  },
);

export default router;
