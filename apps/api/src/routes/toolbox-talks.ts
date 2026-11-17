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
  createToolboxTalkSchema,
  updateToolboxParticipantsSchema,
  updateToolboxTalkSchema,
  updateToolboxTalkStatusSchema,
} from "../lib/validation/toolbox-talk.js";
import type { ToolboxParticipantInput } from "../lib/validation/participant.js";
import {
  canTransitionToolboxTalkStatus,
  isToolboxTalkStatus,
} from "../lib/hse-constants.js";
import {
  canCreateToolboxTalks,
  canViewToolboxTalks,
} from "../lib/hse-permissions.js";
import { assertSiteAccess } from "../lib/site-access.js";
import {
  assertToolboxTalkAccess,
  canCancelToolboxTalk,
  canCompleteToolboxTalk,
  canEditToolboxTalk,
  toolboxTalkScopeFilter,
} from "../lib/toolbox-talk-access.js";
import {
  resolveParticipants,
  type ResolvedParticipant,
} from "../lib/participant-records.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { toolboxTalkAuditSnapshot } from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { ToolboxTalk } from "../models/ToolboxTalk.js";
import { Project } from "../models/Project.js";
import { Site } from "../models/Site.js";
import { User } from "../models/User.js";
import { ContractorPersonnel } from "../models/ContractorPersonnel.js";
import {
  toMyToolboxTalk,
  toToolboxPersonHistory,
  toToolboxTalkSummary,
  type SerializedMyToolboxTalk,
} from "../serializers/toolbox-talk.js";

const router: Router = Router();

const TOOLBOX_TALK_POPULATE = [
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "participants.contractor", select: "name" },
  { path: "completedBy", select: "firstName lastName" },
  { path: "cancelledBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
];

// Every toolbox talk route requires an authenticated, active IKOSH employee.
// `/my` is available to every employee for their own participation records.
router.use(requireAuth(digitAuth), attachIkoshUser);

function assertToolboxRegisterAccess(viewer: { ikoshRole: string }): void {
  if (!canViewToolboxTalks(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to view toolbox talk records.",
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateQuery(value: unknown, label: string): Date | undefined {
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
 * Resolves and validates the project/site pair. Talks are always site-bound:
 * the site must exist, be active and belong to the selected project.
 */
async function resolveTalkProjectAndSite(
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
      "Toolbox talks can only be scheduled at an active site.",
    );
  }

  return { project: project._id, site: site._id };
}

/** Builds stored participant rows from resolved references and client input. */
function buildToolboxParticipants(
  resolved: readonly ResolvedParticipant[],
  inputs: readonly ToolboxParticipantInput[],
) {
  const now = new Date();

  return resolved.map((base, index) => {
    const input = inputs[index]!;
    const acknowledged = input.acknowledged ?? false;

    return {
      ...base,
      attendance: input.attendance ?? "INVITED",
      acknowledged,
      acknowledgedAt: acknowledged ? now : null,
      notes: input.notes ?? null,
    };
  });
}

// An employee's own toolbox talk participation. Only the caller's participant
// row is returned; other attendees are never exposed.
router.get("/my", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { "participants.employee": viewer._id };

  const [total, talks] = await Promise.all([
    ToolboxTalk.countDocuments(filter),
    ToolboxTalk.find(filter)
      .sort({ scheduledDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(TOOLBOX_TALK_POPULATE)
      .lean(),
  ]);

  const records = talks
    .map((talk) => toMyToolboxTalk(talk, String(viewer._id)))
    .filter((record): record is SerializedMyToolboxTalk => record !== null);

  res.status(200).json({
    success: true,
    talks: records,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Authorised HSE staff view one person's toolbox talk history. Records are
// still filtered through the viewer's site scope.
router.get(
  "/personnel/:kind/:personId/history",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    assertToolboxRegisterAccess(viewer);

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
    const scope = toolboxTalkScopeFilter(viewer);

    if (Object.keys(scope).length > 0) {
      conditions.push(scope);
    }

    const filter = { $and: conditions };
    const { page, limit, skip } = parsePagination(req.query);

    const [total, talks] = await Promise.all([
      ToolboxTalk.countDocuments(filter),
      ToolboxTalk.find(filter)
        .sort({ scheduledDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(TOOLBOX_TALK_POPULATE)
        .lean(),
    ]);

    const records = talks
      .map((talk) => toToolboxPersonHistory(talk, kind, personId))
      .filter((record): record is SerializedMyToolboxTalk => record !== null);

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

// Toolbox talk register. Visibility is always site-scoped for non-management.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  assertToolboxRegisterAccess(viewer);

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const from = parseDateQuery(req.query.from, "start date");
  const to = parseDateQuery(req.query.to, "end date");
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;

  if (status !== undefined && !isToolboxTalkStatus(status)) {
    throw new HttpError(400, "Invalid toolbox talk status.");
  }

  for (const [label, value] of [
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
  const scope = toolboxTalkScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (status) conditions.push({ status });
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
    conditions.push({
      $or: [
        { topic: pattern },
        { facilitatorName: pattern },
        { discussionPoints: pattern },
      ],
    });
  }

  const filter =
    conditions.length > 0
      ? { $and: conditions }
      : ({} as Record<string, unknown>);

  const { page, limit, skip } = parsePagination(req.query);

  const [total, talks] = await Promise.all([
    ToolboxTalk.countDocuments(filter),
    ToolboxTalk.find(filter)
      .sort({ scheduledDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(TOOLBOX_TALK_POPULATE)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    talks: talks.map(toToolboxTalkSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Schedule a toolbox talk. The site is mandatory, active and project-bound;
// every participant must resolve to an existing active workforce record.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canCreateToolboxTalks(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to schedule toolbox talks.",
    );
  }

  const parsed = createToolboxTalkSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;

  assertSiteAccess(viewer, data.siteId);

  const talk = await runAuditedMutation(viewer._id, async (tx) => {
    const resolved = await resolveTalkProjectAndSite(
      tx,
      data.projectId,
      data.siteId,
    );
    const participantInputs = data.participants ?? [];
    const participants = buildToolboxParticipants(
      await resolveParticipants(participantInputs, resolved.site, tx),
      participantInputs,
    );

    const created = new ToolboxTalk({
      project: resolved.project,
      site: resolved.site,
      topic: data.topic,
      discussionPoints: data.discussionPoints ?? "",
      facilitatorName: data.facilitatorName,
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
        action: "toolbox_talk.created",
        entityType: "ToolboxTalk",
        entityId: created._id,
        after: toolboxTalkAuditSnapshot(created),
      },
    };
  });

  await talk.populate(TOOLBOX_TALK_POPULATE);

  res.status(201).json({
    success: true,
    talk: toToolboxTalkSummary(talk),
  });
});

// Read one talk. Out-of-scope talks return 404 so existence is not leaked.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  assertToolboxRegisterAccess(viewer);

  const talkId = parseObjectIdParam(req.params.id, "toolbox talk");
  const talk = await ToolboxTalk.findById(talkId).populate(
    TOOLBOX_TALK_POPULATE,
  );

  if (!talk) {
    throw new HttpError(404, "Toolbox talk not found.");
  }

  assertToolboxTalkAccess(viewer, talk);

  res.status(200).json({
    success: true,
    talk: toToolboxTalkSummary(talk),
  });
});

// Edit scheduled talk content. Status and participants are changed through
// their dedicated endpoints.
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canCreateToolboxTalks(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to edit toolbox talks.",
    );
  }

  const talkId = parseObjectIdParam(req.params.id, "toolbox talk");
  const parsed = updateToolboxTalkSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;

  const talk = await runAuditedMutation(viewer._id, async (tx) => {
    const talk = await ToolboxTalk.findById(talkId).session(tx);

    if (!talk) {
      throw new HttpError(404, "Toolbox talk not found.");
    }

    assertToolboxTalkAccess(viewer, talk);

    if (!canEditToolboxTalk(viewer, talk)) {
      throw new HttpError(
        403,
        "Only the talk author or HSE management can edit a scheduled toolbox talk.",
      );
    }

    const before = toolboxTalkAuditSnapshot(talk);

    const projectId = data.projectId ?? String(talk.project);
    const siteId = data.siteId ?? String(talk.site);

    const resolved = await resolveTalkProjectAndSite(tx, projectId, siteId);

    if (data.topic !== undefined) talk.topic = data.topic;
    if (data.discussionPoints !== undefined) {
      talk.discussionPoints = data.discussionPoints;
    }
    if (data.facilitatorName !== undefined) {
      talk.facilitatorName = data.facilitatorName;
    }
    if (data.scheduledDate !== undefined) {
      talk.scheduledDate = data.scheduledDate;
    }
    if (data.durationMinutes !== undefined) {
      talk.durationMinutes = data.durationMinutes;
    }

    talk.project = resolved.project;
    talk.site = resolved.site;

    await talk.save({ session: tx });

    return {
      result: talk,
      audit: {
        action: "toolbox_talk.updated",
        entityType: "ToolboxTalk",
        entityId: talk._id,
        before,
        after: toolboxTalkAuditSnapshot(talk),
      },
    };
  });

  await talk.populate(TOOLBOX_TALK_POPULATE);

  res.status(200).json({
    success: true,
    talk: toToolboxTalkSummary(talk),
  });
});

// Replace attendance/acknowledgement evidence while the talk is scheduled. The
// whole participant list is sent so removals are explicit and auditable.
router.put(
  "/:id/participants",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);

    if (!canCreateToolboxTalks(viewer.ikoshRole)) {
      throw new HttpError(
        403,
        "You are not permitted to record toolbox talk attendance.",
      );
    }

    const talkId = parseObjectIdParam(req.params.id, "toolbox talk");
    const parsed = updateToolboxParticipantsSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const talk = await runAuditedMutation(viewer._id, async (tx) => {
      const talk = await ToolboxTalk.findById(talkId).session(tx);

      if (!talk) {
        throw new HttpError(404, "Toolbox talk not found.");
      }

      assertToolboxTalkAccess(viewer, talk);

      if (!canEditToolboxTalk(viewer, talk)) {
        throw new HttpError(
          403,
          "Only the talk author or HSE management can record attendance for a scheduled toolbox talk.",
        );
      }

      const before = toolboxTalkAuditSnapshot(talk);
      const inputs = parsed.data.participants;
      const participants = buildToolboxParticipants(
        await resolveParticipants(inputs, talk.site, tx),
        inputs,
      );

      talk.participants = participants as typeof talk.participants;

      await talk.save({ session: tx });

      return {
        result: talk,
        audit: {
          action: "toolbox_talk.participants_updated",
          entityType: "ToolboxTalk",
          entityId: talk._id,
          before,
          after: toolboxTalkAuditSnapshot(talk),
        },
      };
    });

    await talk.populate(TOOLBOX_TALK_POPULATE);

    res.status(200).json({
      success: true,
      talk: toToolboxTalkSummary(talk),
    });
  },
);

// Complete or cancel a scheduled talk. Completion requires at least one
// acknowledged attendee; both terminal states are final.
router.patch(
  "/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const talkId = parseObjectIdParam(req.params.id, "toolbox talk");
    const parsed = updateToolboxTalkStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { status: nextStatus, reason } = parsed.data;

    const talk = await runAuditedMutation(viewer._id, async (tx) => {
      const talk = await ToolboxTalk.findById(talkId).session(tx);

      if (!talk) {
        throw new HttpError(404, "Toolbox talk not found.");
      }

      assertToolboxTalkAccess(viewer, talk);

      if (
        !canTransitionToolboxTalkStatus(
          talk.status as "SCHEDULED" | "COMPLETED" | "CANCELLED",
          nextStatus as "SCHEDULED" | "COMPLETED" | "CANCELLED",
        )
      ) {
        throw new HttpError(
          409,
          `Invalid status transition from ${talk.status} to ${nextStatus}.`,
        );
      }

      const before = toolboxTalkAuditSnapshot(talk);

      if (nextStatus === "COMPLETED") {
        if (!canCompleteToolboxTalk(viewer, talk)) {
          throw new HttpError(
            403,
            "Only the talk author or HSE management can complete this toolbox talk.",
          );
        }

        const acknowledged = (talk.participants ?? []).filter(
          (participant) => participant.acknowledged,
        ).length;

        if (acknowledged === 0) {
          throw new HttpError(
            409,
            "Record at least one acknowledged attendee before completing the toolbox talk.",
          );
        }

        talk.completedBy = viewer._id;
        talk.completedAt = new Date();
      } else if (nextStatus === "CANCELLED") {
        if (!canCancelToolboxTalk(viewer, talk)) {
          throw new HttpError(
            403,
            "Only the talk author or HSE management can cancel this toolbox talk.",
          );
        }

        talk.cancelledBy = viewer._id;
        talk.cancelledAt = new Date();
        talk.cancellationReason = reason ?? null;
      }

      talk.status = nextStatus;

      await talk.save({ session: tx });

      return {
        result: talk,
        audit: {
          action:
            nextStatus === "COMPLETED"
              ? "toolbox_talk.completed"
              : "toolbox_talk.cancelled",
          entityType: "ToolboxTalk",
          entityId: talk._id,
          before,
          after: toolboxTalkAuditSnapshot(talk),
        },
      };
    });

    await talk.populate(TOOLBOX_TALK_POPULATE);

    res.status(200).json({
      success: true,
      talk: toToolboxTalkSummary(talk),
    });
  },
);

export default router;
