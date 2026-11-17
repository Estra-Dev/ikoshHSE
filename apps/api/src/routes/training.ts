import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { Types, type ClientSession } from "mongoose";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
  parsePagination,
} from "../lib/validation/common.js";
import {
  createTrainingCourseSchema,
  createTrainingSessionSchema,
  updateTrainingCourseSchema,
  updateTrainingParticipantsSchema,
  updateTrainingSessionSchema,
  updateTrainingSessionStatusSchema,
} from "../lib/validation/training.js";
import type {
  TrainingParticipantInput,
} from "../lib/validation/participant.js";
import {
  canTransitionTrainingSessionStatus,
  isTrainingSessionStatus,
} from "../lib/hse-constants.js";
import { canCreateTraining, canManageTraining, canViewTraining } from "../lib/hse-permissions.js";
import { assertSiteAccess } from "../lib/site-access.js";
import {
  assertTrainingSessionAccess,
  canCancelTrainingSession,
  canCompleteTrainingSession,
  canEditTrainingSession,
  trainingScopeFilter,
} from "../lib/training-access.js";
import {
  resolveParticipants,
  type ResolvedParticipant,
} from "../lib/participant-records.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import {
  trainingCourseAuditSnapshot,
  trainingSessionAuditSnapshot,
} from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { TrainingCourse } from "../models/TrainingCourse.js";
import { TrainingSession } from "../models/TrainingSession.js";
import { Project } from "../models/Project.js";
import { Site } from "../models/Site.js";
import { User } from "../models/User.js";
import { ContractorPersonnel } from "../models/ContractorPersonnel.js";
import {
  toTrainingCourseSummary,
  toTrainingPersonHistory,
  toTrainingSessionSummary,
  type SerializedMyTrainingSession,
} from "../serializers/training.js";
const router: Router = Router();

const TRAINING_SESSION_POPULATE = [
  { path: "course", select: "code title category" },
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "participants.contractor", select: "name" },
  { path: "completedBy", select: "firstName lastName" },
  { path: "cancelledBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
];

// Every training route requires an authenticated, active IKOSH employee.
// Register and history endpoints additionally require the training capability;
// `/my` is available to every employee for their own participation records.
router.use(requireAuth(digitAuth), attachIkoshUser);

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function assertTrainingRegisterAccess(viewer: {
  ikoshRole: string;
}): void {
  if (!canViewTraining(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to view training records.");
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateQuery(
  value: unknown,
  label: string,
): Date | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new HttpError(400, `Invalid ${label}.`);
  }

  return date;
}

/**
 * Resolves and validates the project/site pair. Training is always site-bound:
 * the site must exist, be active and belong to the selected project.
 */
async function resolveTrainingProjectAndSite(
  session: ClientSession,
  projectId: string,
  siteId: string,
): Promise<{ project: Types.ObjectId; site: Types.ObjectId }> {
  const project = await Project.findById(projectId).session(session);

  if (!project) {
    throw new HttpError(404, "Specified project was not found.");
  }

  const site = await Site.findById(siteId).session(session);

  if (!site) {
    throw new HttpError(404, "Specified site was not found.");
  }

  if (String(site.project) !== String(project._id)) {
    throw new HttpError(
      409,
      "The selected site does not belong to the selected project.",
    );
  }

  if (site.status !== "ACTIVE") {
    throw new HttpError(
      409,
      "Training sessions can only be scheduled at an active site.",
    );
  }

  return { project: project._id, site: site._id };
}

async function assertActiveCourse(
  courseId: string,
  session: ClientSession,
): Promise<Types.ObjectId> {
  const course = await TrainingCourse.findById(courseId).session(session);

  if (!course) {
    throw new HttpError(404, "Specified training course was not found.");
  }

  if (!course.isActive) {
    throw new HttpError(400, "Select an active training course.");
  }

  return course._id;
}

/** Builds stored participant rows from resolved references and client input. */
function buildTrainingParticipants(
  resolved: readonly ResolvedParticipant[],
  inputs: readonly TrainingParticipantInput[],
) {
  return resolved.map((base, index) => {
    const input = inputs[index]!;

    return {
      ...base,
      attendance: input.attendance ?? "INVITED",
      completed: input.completed ?? false,
      certificateNumber: input.certificateNumber ?? null,
      certificateIssuedOn: input.certificateIssuedOn ?? null,
      certificateExpiresOn: input.certificateExpiresOn ?? null,
      notes: input.notes ?? null,
    };
  });
}

// Training course catalogue. Active courses are readable by any authenticated
// employee; only HSE management may create or change courses.
router.get("/courses", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const includeInactive = req.query.includeInactive === "true";
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;
  const search = rawSearch?.trim();

  if (includeInactive && !canManageTraining(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to view inactive training courses.",
    );
  }

  if (search && search.length > 200) {
    throw new HttpError(400, "Search text is too long.");
  }

  const filter: Record<string, unknown> = {};

  if (!includeInactive) {
    filter.isActive = true;
  }

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ code: pattern }, { title: pattern }];
  }

  const courses = await TrainingCourse.find(filter)
    .sort({ isActive: -1, title: 1 })
    .limit(500)
    .lean();

  res.status(200).json({
    success: true,
    courses: courses.map(toTrainingCourseSummary),
  });
});

router.post("/courses", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canManageTraining(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to create training courses.",
    );
  }

  const parsed = createTrainingCourseSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;

  const course = await runAuditedMutation(viewer._id, async (session) => {
    const created = new TrainingCourse({
      code: data.code,
      title: data.title,
      category: data.category,
      defaultDurationMinutes: data.defaultDurationMinutes ?? null,
      description: data.description ?? "",
      isActive: true,
    });

    try {
      await created.save({ session });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new HttpError(409, "A course with this code already exists.");
      }

      throw error;
    }

    return {
      result: created,
      audit: {
        action: "training.course_created",
        entityType: "TrainingCourse",
        entityId: created._id,
        after: trainingCourseAuditSnapshot(created),
      },
    };
  });

  res.status(201).json({
    success: true,
    course: toTrainingCourseSummary(course),
  });
});

router.patch(
  "/courses/:id",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const courseId = parseObjectIdParam(req.params.id, "course");

    if (!canManageTraining(viewer.ikoshRole)) {
      throw new HttpError(
        403,
        "You are not permitted to change training courses.",
      );
    }

    const parsed = updateTrainingCourseSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const data = parsed.data;

    const course = await runAuditedMutation(viewer._id, async (session) => {
      const course = await TrainingCourse.findById(courseId).session(session);

      if (!course) {
        throw new HttpError(404, "Training course not found.");
      }

      const before = trainingCourseAuditSnapshot(course);

      if (data.title !== undefined) course.title = data.title;
      if (data.category !== undefined) course.category = data.category;
      if (data.defaultDurationMinutes !== undefined) {
        course.defaultDurationMinutes = data.defaultDurationMinutes;
      }
      if (data.description !== undefined) {
        course.description = data.description;
      }
      if (data.isActive !== undefined) course.isActive = data.isActive;

      await course.save({ session });

      return {
        result: course,
        audit: {
          action: "training.course_updated",
          entityType: "TrainingCourse",
          entityId: course._id,
          before,
          after: trainingCourseAuditSnapshot(course),
        },
      };
    });

    res.status(200).json({
      success: true,
      course: toTrainingCourseSummary(course),
    });
  },
);

// An employee's own training participation. Only the caller's participant row
// is returned; other attendees are never exposed.
router.get("/my", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { "participants.employee": viewer._id };

  const [total, sessions] = await Promise.all([
    TrainingSession.countDocuments(filter),
    TrainingSession.find(filter)
      .sort({ scheduledDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(TRAINING_SESSION_POPULATE)
      .lean(),
  ]);

  const records = sessions
    .map((session) =>
      toTrainingPersonHistory(session, "EMPLOYEE", String(viewer._id)),
    )
    .filter((record): record is SerializedMyTrainingSession => record !== null);

  res.status(200).json({
    success: true,
    sessions: records,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Authorised HSE staff view one person's training history. Records are still
// filtered through the viewer's site scope so history never leaks other sites.
router.get(
  "/personnel/:kind/:personId/history",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    assertTrainingRegisterAccess(viewer);

    const rawKind = req.params.kind;
    const kind =
      rawKind === "employee"
        ? "EMPLOYEE"
        : rawKind === "contractor"
          ? "CONTRACTOR"
          : null;

    if (!kind) {
      throw new HttpError(400, "Invalid personnel kind.");
    }

    const personId = parseObjectIdParam(req.params.personId, "personnel");

    if (kind === "EMPLOYEE") {
      const employee = await User.findById(personId).select("_id").lean();

      if (!employee) {
        throw new HttpError(404, "Personnel record not found.");
      }
    } else {
      const person = await ContractorPersonnel.findById(personId)
        .select("_id")
        .lean();

      if (!person) {
        throw new HttpError(404, "Personnel record not found.");
      }
    }

    const conditions: Record<string, unknown>[] = [
      kind === "EMPLOYEE"
        ? { "participants.employee": new Types.ObjectId(personId) }
        : { "participants.contractorPersonnel": new Types.ObjectId(personId) },
    ];
    const scope = trainingScopeFilter(viewer);

    if (Object.keys(scope).length > 0) {
      conditions.push(scope);
    }

    const filter = { $and: conditions };
    const { page, limit, skip } = parsePagination(req.query);

    const [total, sessions] = await Promise.all([
      TrainingSession.countDocuments(filter),
      TrainingSession.find(filter)
        .sort({ scheduledDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(TRAINING_SESSION_POPULATE)
        .lean(),
    ]);

    const records = sessions
      .map((session) => toTrainingPersonHistory(session, kind, personId))
      .filter((record): record is SerializedMyTrainingSession => record !== null);

    res.status(200).json({
      success: true,
      records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
);

// Training register. Visibility is always site-scoped for non-management.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  assertTrainingRegisterAccess(viewer);

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const courseId =
    typeof req.query.courseId === "string" ? req.query.courseId : undefined;
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const from = parseDateQuery(req.query.from, "start date");
  const to = parseDateQuery(req.query.to, "end date");
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;

  if (status !== undefined && !isTrainingSessionStatus(status)) {
    throw new HttpError(400, "Invalid training session status.");
  }

  for (const [label, value] of [
    ["course", courseId],
    ["project", projectId],
    ["site", siteId],
  ] as const) {
    if (value !== undefined && !Types.ObjectId.isValid(value)) {
      throw new HttpError(400, `Invalid ${label} id.`);
    }
  }

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const search = rawSearch?.trim();

  if (search && search.length > 200) {
    throw new HttpError(400, "Search text is too long.");
  }

  const conditions: Record<string, unknown>[] = [];
  const scope = trainingScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (status) conditions.push({ status });
  if (courseId) conditions.push({ course: new Types.ObjectId(courseId) });
  if (projectId) conditions.push({ project: new Types.ObjectId(projectId) });
  if (siteId) conditions.push({ site: new Types.ObjectId(siteId) });

  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    conditions.push({ scheduledDate: range });
  }

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    const matchingCourses = await TrainingCourse.find({
      $or: [{ title: pattern }, { code: pattern }],
    })
      .select("_id")
      .lean();

    conditions.push({
      $or: [
        { topic: pattern },
        { trainerName: pattern },
        { course: { $in: matchingCourses.map((course) => course._id) } },
      ],
    });
  }

  const filter =
    conditions.length > 0
      ? { $and: conditions }
      : ({} as Record<string, unknown>);

  const { page, limit, skip } = parsePagination(req.query);

  const [total, sessions] = await Promise.all([
    TrainingSession.countDocuments(filter),
    TrainingSession.find(filter)
      .sort({ scheduledDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(TRAINING_SESSION_POPULATE)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    sessions: sessions.map(toTrainingSessionSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Schedule a training session. The site is mandatory, active and project-bound;
// the course must be active and every participant must resolve to an existing
// active workforce record.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canCreateTraining(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to schedule training sessions.",
    );
  }

  const parsed = createTrainingSessionSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;

  assertSiteAccess(viewer, data.siteId);

  const session = await runAuditedMutation(viewer._id, async (tx) => {
    const resolved = await resolveTrainingProjectAndSite(
      tx,
      data.projectId,
      data.siteId,
    );
    const course = await assertActiveCourse(data.courseId, tx);
    const participantInputs = data.participants ?? [];
    const participants = buildTrainingParticipants(
      await resolveParticipants(participantInputs, resolved.site, tx),
      participantInputs,
    );

    const created = new TrainingSession({
      course,
      project: resolved.project,
      site: resolved.site,
      topic: data.topic,
      description: data.description ?? "",
      trainerName: data.trainerName,
      scheduledDate: data.scheduledDate,
      durationMinutes: data.durationMinutes,
      status: "SCHEDULED",
      participants,
      createdBy: viewer._id,
    });

    await created.save({ session: tx });

    return {
      result: created,
      audit: {
        action: "training.session_created",
        entityType: "TrainingSession",
        entityId: created._id,
        after: trainingSessionAuditSnapshot(created),
      },
    };
  });

  await session.populate(TRAINING_SESSION_POPULATE);

  res.status(201).json({
    success: true,
    session: toTrainingSessionSummary(session),
  });
});

// Read one session. Out-of-scope sessions return 404 so existence is not
// leaked to viewers outside the site.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  assertTrainingRegisterAccess(viewer);

  const sessionId = parseObjectIdParam(req.params.id, "training session");
  const session = await TrainingSession.findById(sessionId).populate(
    TRAINING_SESSION_POPULATE,
  );

  if (!session) {
    throw new HttpError(404, "Training session not found.");
  }

  assertTrainingSessionAccess(viewer, session);

  res.status(200).json({
    success: true,
    session: toTrainingSessionSummary(session),
  });
});

// Edit scheduled session content. Status and participants are changed through
// their dedicated endpoints.
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canCreateTraining(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to edit training sessions.",
    );
  }

  const sessionId = parseObjectIdParam(req.params.id, "training session");
  const parsed = updateTrainingSessionSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;

  const session = await runAuditedMutation(viewer._id, async (tx) => {
    const session = await TrainingSession.findById(sessionId).session(tx);

    if (!session) {
      throw new HttpError(404, "Training session not found.");
    }

    assertTrainingSessionAccess(viewer, session);

    if (!canEditTrainingSession(viewer, session)) {
      throw new HttpError(
        403,
        "Only the session author or HSE management can edit a scheduled training session.",
      );
    }

    const before = trainingSessionAuditSnapshot(session);

    const projectId = data.projectId ?? String(session.project);
    const siteId = data.siteId ?? String(session.site);

    const resolved = await resolveTrainingProjectAndSite(
      tx,
      projectId,
      siteId,
    );

    if (data.courseId !== undefined) {
      session.course = await assertActiveCourse(data.courseId, tx);
    }

    if (data.topic !== undefined) session.topic = data.topic;
    if (data.description !== undefined) {
      session.description = data.description;
    }
    if (data.trainerName !== undefined) {
      session.trainerName = data.trainerName;
    }
    if (data.scheduledDate !== undefined) {
      session.scheduledDate = data.scheduledDate;
    }
    if (data.durationMinutes !== undefined) {
      session.durationMinutes = data.durationMinutes;
    }

    session.project = resolved.project;
    session.site = resolved.site;

    await session.save({ session: tx });

    return {
      result: session,
      audit: {
        action: "training.session_updated",
        entityType: "TrainingSession",
        entityId: session._id,
        before,
        after: trainingSessionAuditSnapshot(session),
      },
    };
  });

  await session.populate(TRAINING_SESSION_POPULATE);

  res.status(200).json({
    success: true,
    session: toTrainingSessionSummary(session),
  });
});

// Replace attendance/certificate evidence while the session is scheduled. The
// whole participant list is sent so removals are explicit and auditable.
router.put(
  "/:id/participants",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);

    if (!canCreateTraining(viewer.ikoshRole)) {
      throw new HttpError(
        403,
        "You are not permitted to record training attendance.",
      );
    }

    const sessionId = parseObjectIdParam(req.params.id, "training session");
    const parsed = updateTrainingParticipantsSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const session = await runAuditedMutation(viewer._id, async (tx) => {
      const session = await TrainingSession.findById(sessionId).session(tx);

      if (!session) {
        throw new HttpError(404, "Training session not found.");
      }

      assertTrainingSessionAccess(viewer, session);

      if (!canEditTrainingSession(viewer, session)) {
        throw new HttpError(
          403,
          "Only the session author or HSE management can record attendance for a scheduled training session.",
        );
      }

      const before = trainingSessionAuditSnapshot(session);
      const inputs = parsed.data.participants;
      const participants = buildTrainingParticipants(
        await resolveParticipants(inputs, session.site, tx),
        inputs,
      );

      session.participants = participants as typeof session.participants;

      await session.save({ session: tx });

      return {
        result: session,
        audit: {
          action: "training.participants_updated",
          entityType: "TrainingSession",
          entityId: session._id,
          before,
          after: trainingSessionAuditSnapshot(session),
        },
      };
    });

    await session.populate(TRAINING_SESSION_POPULATE);

    res.status(200).json({
      success: true,
      session: toTrainingSessionSummary(session),
    });
  },
);

// Complete or cancel a scheduled session. Completion requires at least one
// attended participant; both terminal states are final.
router.patch(
  "/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const sessionId = parseObjectIdParam(req.params.id, "training session");
    const parsed = updateTrainingSessionStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { status: nextStatus, reason } = parsed.data;

    const session = await runAuditedMutation(viewer._id, async (tx) => {
      const session = await TrainingSession.findById(sessionId).session(tx);

      if (!session) {
        throw new HttpError(404, "Training session not found.");
      }

      assertTrainingSessionAccess(viewer, session);

      if (
        !canTransitionTrainingSessionStatus(
          session.status as "SCHEDULED" | "COMPLETED" | "CANCELLED",
          nextStatus as "SCHEDULED" | "COMPLETED" | "CANCELLED",
        )
      ) {
        throw new HttpError(
          409,
          `Invalid status transition from ${session.status} to ${nextStatus}.`,
        );
      }

      const before = trainingSessionAuditSnapshot(session);

      if (nextStatus === "COMPLETED") {
        if (!canCompleteTrainingSession(viewer, session)) {
          throw new HttpError(
            403,
            "Only the session author or HSE management can complete this session.",
          );
        }

        const attended = (session.participants ?? []).filter(
          (participant) => participant.attendance === "ATTENDED",
        ).length;

        if (attended === 0) {
          throw new HttpError(
            409,
            "Record at least one attended participant before completing the session.",
          );
        }

        session.completedBy = viewer._id;
        session.completedAt = new Date();
      } else if (nextStatus === "CANCELLED") {
        if (!canCancelTrainingSession(viewer, session)) {
          throw new HttpError(
            403,
            "Only the session author or HSE management can cancel this session.",
          );
        }

        session.cancelledBy = viewer._id;
        session.cancelledAt = new Date();
        session.cancellationReason = reason ?? null;
      }

      session.status = nextStatus;

      await session.save({ session: tx });

      return {
        result: session,
        audit: {
          action:
            nextStatus === "COMPLETED"
              ? "training.session_completed"
              : "training.session_cancelled",
          entityType: "TrainingSession",
          entityId: session._id,
          before,
          after: trainingSessionAuditSnapshot(session),
        },
      };
    });

    await session.populate(TRAINING_SESSION_POPULATE);

    res.status(200).json({
      success: true,
      session: toTrainingSessionSummary(session),
    });
  },
);

export default router;
