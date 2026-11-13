import { Router, type Request, type Response } from "express";
import { Types } from "mongoose";
import { requireAuth } from "@digit-auth/node";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import { isHseManagementRole, isManagementRole } from "../lib/ikosh-constants.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
} from "../lib/validation/common.js";
import {
  type DirectorySortOption,
  type EmployeeDirectoryQuery,
  employeeDirectoryQuerySchema,
  updateEmployeeRoleSchema,
  updateEmployeeSchema,
  updateEmployeeSitesSchema,
  updateEmployeeStatusSchema,
  updateOwnProfileSchema,
} from "../lib/validation/employee.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { employeeAuditSnapshot } from "../lib/audit-snapshots.js";
import { Department } from "../models/Department.js";
import { Site } from "../models/Site.js";
import { User } from "../models/User.js";
import {
  toBasicUserProfile,
  toFullUserProfile,
  toHsePersonnelSummary,
} from "../serializers/user.js";

const router: Router = Router();

const DIRECTORY_SORTS: Record<DirectorySortOption, Record<string, 1 | -1>> = {
  name: { lastName: 1, firstName: 1 },
  "-name": { lastName: -1, firstName: -1 },
  employeeId: { employeeId: 1 },
  "-employeeId": { employeeId: -1 },
  hireDate: { hireDate: 1 },
  "-hireDate": { hireDate: -1 },
  createdAt: { createdAt: 1 },
  "-createdAt": { createdAt: -1 },
};

const POPULATE_EMPLOYEE_FIELDS = [
  { path: "department", select: "name" },
  { path: "managerId", select: "firstName lastName jobTitle" },
];

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Every employee route requires an authenticated, active IKOSH employee.
router.use(requireAuth(digitAuth), attachIkoshUser);

// Employee directory: search, filtering and pagination. Returns basic
// profile information only.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = employeeDirectoryQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const query: EmployeeDirectoryQuery = parsed.data;
  const viewer = getIkoshUser(req);

  // Inactive employees are hidden by default. Only management roles may
  // list them.
  const includeInactive = query.isActive === "false";
  const showInactive = includeInactive && isManagementRole(viewer.ikoshRole);

  const filter: Record<string, unknown> = {
    isActive: !showInactive,
  };

  if (query.q) {
    const pattern = new RegExp(escapeRegExp(query.q), "i");
    filter.$or = [
      { firstName: pattern },
      { lastName: pattern },
      { email: pattern },
      { employeeId: pattern },
    ];
  }

  if (query.department) {
    filter.department = query.department;
  }

  if (query.ikoshRole) {
    filter.ikoshRole = query.ikoshRole;
  }

  if (query.employmentType) {
    filter.employmentType = query.employmentType;
  }

  if (query.siteId) {
    filter.assignedSites = new Types.ObjectId(query.siteId);
  }

  const [total, employees] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .lean()
      .sort(DIRECTORY_SORTS[query.sort ?? "name"])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate({ path: "department", select: "name" }),
  ]);

  // HSE managers need role, active status and site assignments to administer
  // access. Everyone else keeps the basic, HR-free directory view.
  const isAccessManager = isHseManagementRole(viewer.ikoshRole);

  res.status(200).json({
    success: true,
    employees: employees.map((employee) =>
      isAccessManager
        ? toHsePersonnelSummary(employee)
        : toBasicUserProfile(employee),
    ),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
});

// Own full profile, including employment information.
router.get("/me", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  await viewer.populate(POPULATE_EMPLOYEE_FIELDS);

  res.status(200).json({
    success: true,
    employee: toFullUserProfile(viewer),
  });
});

// Update own contact details only. Employment information, roles and status
// are controlled by administrators.
router.patch("/me", async (req: Request, res: Response): Promise<void> => {
  const parsed = updateOwnProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const viewer = getIkoshUser(req);
  const { phone, location } = parsed.data;

  if (phone !== undefined) {
    viewer.phone = phone;
  }

  if (location !== undefined) {
    viewer.location = location;
  }

  await viewer.save();
  await viewer.populate(POPULATE_EMPLOYEE_FIELDS);

  res.status(200).json({
    success: true,
    employee: toFullUserProfile(viewer),
  });
});

// Employee profile. Ordinary employees see basic information; management
// roles (and the employee themselves) see the full profile.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const employeeId = parseObjectIdParam(req.params.id, "employee");

  const viewer = getIkoshUser(req);
  const employee = await User.findById(employeeId).populate(
    POPULATE_EMPLOYEE_FIELDS,
  );

  if (!employee) {
    throw new HttpError(404, "Employee not found.");
  }

  const isSelf = String(employee._id) === String(viewer._id);

  if (!isSelf && !isManagementRole(viewer.ikoshRole)) {
    // Inactive employees are invisible to ordinary employees.
    if (!employee.isActive) {
      throw new HttpError(404, "Employee not found.");
    }

    res.status(200).json({
      success: true,
      employee: toBasicUserProfile(employee),
    });
    return;
  }

  res.status(200).json({
    success: true,
    employee: toFullUserProfile(employee),
  });
});

// Update an employee's employment and contact information (administrators
// only).
router.patch(
  "/:id",
  requireIkoshRole("ADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    const employeeId = parseObjectIdParam(req.params.id, "employee");

    const parsed = updateEmployeeSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const {
      employeeId: newEmployeeId,
      jobTitle,
      department,
      employmentType,
      hireDate,
      managerId,
      phone,
      location,
    } = parsed.data;
    const viewer = getIkoshUser(req);

    const employee = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const employee = await User.findById(employeeId).session(session);

        if (!employee) {
          throw new HttpError(404, "Employee not found.");
        }

        const before = employeeAuditSnapshot(employee);

        if (department !== undefined) {
          if (department) {
            const departmentExists = await Department.exists({
              _id: department,
            }).session(session);

            if (!departmentExists) {
              throw new HttpError(400, "Specified department was not found.");
            }

            employee.department = new Types.ObjectId(department);
          } else {
            employee.department = null;
          }
        }

        if (managerId !== undefined) {
          if (managerId) {
            if (String(managerId) === String(employee._id)) {
              throw new HttpError(
                400,
                "An employee cannot be their own manager.",
              );
            }

            const managerExists = await User.exists({
              _id: managerId,
            }).session(session);

            if (!managerExists) {
              throw new HttpError(400, "Specified manager was not found.");
            }

            employee.managerId = new Types.ObjectId(managerId);
          } else {
            employee.managerId = null;
          }
        }

        if (newEmployeeId !== undefined) {
          employee.employeeId = newEmployeeId;
        }

        if (jobTitle !== undefined) {
          employee.jobTitle = jobTitle;
        }

        if (employmentType !== undefined) {
          employee.employmentType = employmentType;
        }

        if (hireDate !== undefined) {
          employee.hireDate = hireDate;
        }

        if (phone !== undefined) {
          employee.phone = phone;
        }

        if (location !== undefined) {
          employee.location = location;
        }

        try {
          await employee.save({ session });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new HttpError(
              409,
              "This employee ID is already assigned to another employee.",
            );
          }

          throw error;
        }

        return {
          result: employee,
          audit: {
            action: "employee.updated",
            entityType: "User",
            entityId: employee._id,
            before,
            after: employeeAuditSnapshot(employee),
          },
        };
      },
    );

    await employee.populate(POPULATE_EMPLOYEE_FIELDS);

    res.status(200).json({
      success: true,
      employee: toFullUserProfile(employee),
    });
  },
);

// Change an employee's IKOSH role (administrators only; never self).
router.patch(
  "/:id/role",
  requireIkoshRole("ADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    const employeeId = parseObjectIdParam(req.params.id, "employee");

    const parsed = updateEmployeeRoleSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const viewer = getIkoshUser(req);

    if (String(employeeId) === String(viewer._id)) {
      throw new HttpError(403, "You cannot change your own IKOSH role.");
    }

    const employee = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const employee = await User.findById(employeeId).session(session);

        if (!employee) {
          throw new HttpError(404, "Employee not found.");
        }

        const before = employeeAuditSnapshot(employee);

        employee.ikoshRole = parsed.data.ikoshRole;

        try {
          await employee.save({ session });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            // Not expected: roles are not unique. Fail generically.
            throw new HttpError(409, "Request could not be processed.");
          }

          throw error;
        }

        return {
          result: employee,
          audit: {
            action: "employee.role_changed",
            entityType: "User",
            entityId: employee._id,
            before,
            after: employeeAuditSnapshot(employee),
          },
        };
      },
    );

    await employee.populate(POPULATE_EMPLOYEE_FIELDS);

    res.status(200).json({
      success: true,
      employee: toFullUserProfile(employee),
    });
  },
);

// Activate or deactivate an employee's IKOSH record (administrators only;
// never self-deactivation). IKOSH status is completely independent from
// DigitAuth authentication: the account stays authenticated, but loses
// access to all application endpoints.
router.patch(
  "/:id/status",
  requireIkoshRole("ADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    const employeeId = parseObjectIdParam(req.params.id, "employee");

    const parsed = updateEmployeeStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const viewer = getIkoshUser(req);

    if (
      String(employeeId) === String(viewer._id) &&
      parsed.data.isActive === false
    ) {
      throw new HttpError(
        403,
        "You cannot deactivate your own employee record.",
      );
    }

    const employee = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const employee = await User.findById(employeeId).session(session);

        if (!employee) {
          throw new HttpError(404, "Employee not found.");
        }

        const before = employeeAuditSnapshot(employee);

        employee.isActive = parsed.data.isActive;
        await employee.save({ session });

        return {
          result: employee,
          audit: {
            action: "employee.status_changed",
            entityType: "User",
            entityId: employee._id,
            before,
            after: employeeAuditSnapshot(employee),
          },
        };
      },
    );

    await employee.populate(POPULATE_EMPLOYEE_FIELDS);

    res.status(200).json({
      success: true,
      employee: toFullUserProfile(employee),
    });
  },
);

// Replace an employee's site assignments (HSE_MANAGER + ADMIN only). Site
// assignments drive all non-management HSE access, so every change is
// validated, deduplicated and audited with before/after values. The payload
// is strict: roles, status and employment fields cannot be changed here.
router.patch(
  "/:id/sites",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const employeeId = parseObjectIdParam(req.params.id, "employee");

    const parsed = updateEmployeeSitesSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const viewer = getIkoshUser(req);
    const requestedSiteIds = [...new Set(parsed.data.siteIds)];

    const employee = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const employee = await User.findById(employeeId).session(session);

        if (!employee) {
          throw new HttpError(404, "Employee not found.");
        }

        const before = employeeAuditSnapshot(employee);

        if (requestedSiteIds.length > 0) {
          const sites = await Site.find({ _id: { $in: requestedSiteIds } })
            .select("_id status")
            .session(session)
            .lean();

          if (sites.length !== requestedSiteIds.length) {
            throw new HttpError(
              400,
              "One or more specified sites were not found.",
            );
          }

          if (sites.some((site) => site.status !== "ACTIVE")) {
            throw new HttpError(
              400,
              "Only active sites can be assigned to HSE personnel.",
            );
          }
        }

        // Stable ordering keeps audit snapshots comparable across changes.
        employee.assignedSites = requestedSiteIds
          .map((siteId) => new Types.ObjectId(siteId))
          .sort((left, right) =>
            String(left).localeCompare(String(right)),
          );

        await employee.save({ session });

        return {
          result: employee,
          audit: {
            action: "employee.sites_changed",
            entityType: "User",
            entityId: employee._id,
            before,
            after: employeeAuditSnapshot(employee),
          },
        };
      },
    );

    await employee.populate(POPULATE_EMPLOYEE_FIELDS);

    res.status(200).json({
      success: true,
      employee: toFullUserProfile(employee),
    });
  },
);

export default router;
