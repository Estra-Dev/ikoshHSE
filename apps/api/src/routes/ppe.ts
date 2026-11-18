import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { Types, type ClientSession, type HydratedDocument } from "mongoose";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
  parsePagination,
} from "../lib/validation/common.js";
import {
  createPpeItemSchema,
  createPpeStockSchema,
  issuePpeSchema,
  lostPpeSchema,
  replacePpeSchema,
  returnPpeSchema,
  updatePpeItemSchema,
  updatePpeStockSchema,
} from "../lib/validation/ppe.js";
import {
  isPpeIssuanceStatus,
  isPpeRestockableCondition,
} from "../lib/hse-constants.js";
import {
  canManagePpeCatalogue,
  canManagePpeStock,
  canViewPpe,
} from "../lib/hse-permissions.js";
import { assertSiteAccess } from "../lib/site-access.js";
import {
  assertPpeIssueAccess,
  assertPpeRecordAccess,
  assertPpeRegisterAccess,
  ppeScopeFilter,
} from "../lib/ppe-access.js";
import { resolveParticipants } from "../lib/participant-records.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import {
  ppeIssuanceAuditSnapshot,
  ppeItemAuditSnapshot,
  ppeStockAuditSnapshot,
} from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { PpeItem } from "../models/PpeItem.js";
import { PpeStock } from "../models/PpeStock.js";
import { PpeIssuance } from "../models/PpeIssuance.js";
import { Site, type SiteDocument } from "../models/Site.js";
import { User } from "../models/User.js";
import { ContractorPersonnel } from "../models/ContractorPersonnel.js";
import {
  toPpeIssuanceSummary,
  toPpeItemSummary,
  toPpeStockSummary,
} from "../serializers/ppe.js";

const router: Router = Router();

const PPE_STOCK_POPULATE = [
  { path: "item", select: "code name category size unit" },
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "updatedBy", select: "firstName lastName" },
];

const PPE_ISSUANCE_POPULATE = [
  { path: "item", select: "code name category size unit" },
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "contractor", select: "name" },
  { path: "issuedBy", select: "firstName lastName" },
  { path: "returnedBy", select: "firstName lastName" },
  { path: "lostBy", select: "firstName lastName" },
];

router.use(requireAuth(digitAuth), attachIkoshUser);

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

/** Small clock tolerance keeps "today" valid across client/server clocks. */
function assertNotFuture(date: Date, label: string): void {
  if (date.getTime() > Date.now() + 60_000) {
    throw new HttpError(400, `${label} cannot be in the future.`);
  }
}

async function resolveActivePpeSite(
  session: ClientSession,
  siteId: string,
): Promise<HydratedDocument<SiteDocument>> {
  const site = await Site.findById(siteId).session(session);

  if (!site) {
    throw new HttpError(404, "Specified site was not found.");
  }

  if (site.status !== "ACTIVE") {
    throw new HttpError(409, "PPE can only be issued at an active site.");
  }

  return site;
}

/**
 * Atomically removes stock. The conditional update is the concurrency guard:
 * two simultaneous issuances can never drive quantity below zero.
 */
async function decrementStock(
  session: ClientSession,
  siteId: Types.ObjectId,
  itemId: Types.ObjectId,
  quantity: number,
  actorId: Types.ObjectId,
): Promise<void> {
  const existing = await PpeStock.findOne({
    site: siteId,
    item: itemId,
  }).session(session);

  if (!existing) {
    throw new HttpError(
      409,
      "No stock is recorded for this item at the selected site. Add inventory first.",
    );
  }

  const updated = await PpeStock.findOneAndUpdate(
    {
      _id: existing._id,
      quantityOnHand: { $gte: quantity },
    },
    {
      $inc: { quantityOnHand: -quantity },
      $set: { updatedBy: actorId },
    },
    {
      session,
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!updated) {
    throw new HttpError(
      409,
      `Insufficient stock. Only ${existing.quantityOnHand} unit(s) are available.`,
    );
  }
}

/** Atomically returns serviceable quantity to stock. */
async function restock(
  session: ClientSession,
  siteId: Types.ObjectId,
  itemId: Types.ObjectId,
  quantity: number,
  actorId: Types.ObjectId,
): Promise<void> {
  const updated = await PpeStock.findOneAndUpdate(
    { site: siteId, item: itemId },
    {
      $inc: { quantityOnHand: quantity },
      $set: { updatedBy: actorId },
    },
    {
      session,
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!updated) {
    throw new HttpError(
      409,
      "The stock record for this item no longer exists, so it cannot be restocked.",
    );
  }
}

function assertStockViewer(viewer: { ikoshRole: string }): void {
  if (!canViewPpe(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to view PPE stock.");
  }
}

function assertStockManager(viewer: { ikoshRole: string }): void {
  if (!canManagePpeStock(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to manage PPE stock.");
  }
}

function assertCatalogueManager(viewer: { ikoshRole: string }): void {
  if (!canManagePpeCatalogue(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to manage the PPE catalogue.",
    );
  }
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

router.get("/items", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  assertPpeRegisterAccess(viewer);

  const includeInactive =
    req.query.includeInactive === "true" &&
    canManagePpeCatalogue(viewer.ikoshRole);
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;
  const search = rawSearch?.trim();

  if (search && search.length > 200) {
    throw new HttpError(400, "Search text is too long.");
  }

  const filter: Record<string, unknown> = {};

  if (!includeInactive) {
    filter.isActive = true;
  }

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ code: pattern }, { name: pattern }];
  }

  const items = await PpeItem.find(filter)
    .sort({ isActive: -1, name: 1 })
    .limit(500)
    .lean();

  res.status(200).json({
    success: true,
    items: items.map(toPpeItemSummary),
  });
});

router.post("/items", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  assertCatalogueManager(viewer);

  const parsed = createPpeItemSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;

  const item = await runAuditedMutation(viewer._id, async (session) => {
    const created = new PpeItem({
      code: data.code,
      name: data.name,
      category: data.category,
      size: data.size ?? null,
      unit: data.unit,
      description: data.description ?? "",
      isActive: true,
    });

    try {
      await created.save({ session });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new HttpError(409, "A PPE item with this code already exists.");
      }

      throw error;
    }

    return {
      result: created,
      audit: {
        action: "ppe.catalogue_created",
        entityType: "PpeItem",
        entityId: created._id,
        after: ppeItemAuditSnapshot(created),
      },
    };
  });

  res.status(201).json({
    success: true,
    item: toPpeItemSummary(item),
  });
});

router.patch(
  "/items/:id",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    assertCatalogueManager(viewer);

    const itemId = parseObjectIdParam(req.params.id, "PPE item");
    const parsed = updatePpeItemSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const data = parsed.data;

    const item = await runAuditedMutation(viewer._id, async (session) => {
      const item = await PpeItem.findById(itemId).session(session);

      if (!item) {
        throw new HttpError(404, "PPE item not found.");
      }

      const before = ppeItemAuditSnapshot(item);

      if (data.name !== undefined) item.name = data.name;
      if (data.category !== undefined) item.category = data.category;
      if (data.size !== undefined) item.size = data.size;
      if (data.unit !== undefined) item.unit = data.unit;
      if (data.description !== undefined) {
        item.description = data.description;
      }
      if (data.isActive !== undefined) item.isActive = data.isActive;

      await item.save({ session });

      return {
        result: item,
        audit: {
          action: "ppe.catalogue_updated",
          entityType: "PpeItem",
          entityId: item._id,
          before,
          after: ppeItemAuditSnapshot(item),
        },
      };
    });

    res.status(200).json({
      success: true,
      item: toPpeItemSummary(item),
    });
  },
);

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

router.get("/stock", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  assertStockViewer(viewer);

  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const itemId =
    typeof req.query.itemId === "string" ? req.query.itemId : undefined;
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;
  const search = rawSearch?.trim();
  const lowStockOnly = req.query.lowStockOnly === "true";

  for (const [label, value] of [
    ["project", projectId],
    ["site", siteId],
    ["item", itemId],
  ] as const) {
    if (value !== undefined && !Types.ObjectId.isValid(value)) {
      throw new HttpError(400, `Invalid ${label} id.`);
    }
  }

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  if (search && search.length > 200) {
    throw new HttpError(400, "Search text is too long.");
  }

  const conditions: Record<string, unknown>[] = [];
  const scope = ppeScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (projectId) {
    conditions.push({ project: new Types.ObjectId(projectId) });
  }
  if (siteId) conditions.push({ site: new Types.ObjectId(siteId) });
  if (itemId) conditions.push({ item: new Types.ObjectId(itemId) });

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    const matchingItems = await PpeItem.find({
      $or: [{ code: pattern }, { name: pattern }],
    })
      .select("_id")
      .lean();

    conditions.push({
      item: { $in: matchingItems.map((item) => item._id) },
    });
  }

  const baseFilter: Record<string, unknown> =
    conditions.length > 0 ? { $and: conditions } : {};

  const outOfStockExpr = { $lte: ["$quantityOnHand", 0] };
  const lowStockExpr = {
    $and: [
      { $gt: ["$quantityOnHand", 0] },
      { $gt: ["$minimumQuantity", 0] },
      { $lte: ["$quantityOnHand", "$minimumQuantity"] },
    ],
  };
  const actionableStockExpr = {
    $or: [outOfStockExpr, lowStockExpr],
  };

  const filter = lowStockOnly
    ? { $and: [baseFilter, { $expr: actionableStockExpr }] }
    : baseFilter;

  const { page, limit, skip } = parsePagination(req.query);

  const [total, low, outOfStock, stock] = await Promise.all([
    PpeStock.countDocuments(baseFilter),
    PpeStock.countDocuments({
      $and: [baseFilter, { $expr: lowStockExpr }],
    }),
    PpeStock.countDocuments({
      $and: [baseFilter, { $expr: outOfStockExpr }],
    }),
    PpeStock.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(PPE_STOCK_POPULATE)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    stock: stock.map(toPpeStockSummary),
    summary: { total, low, outOfStock },
    pagination: {
      page,
      limit,
      total: lowStockOnly ? low + outOfStock : total,
      totalPages: Math.ceil((lowStockOnly ? low + outOfStock : total) / limit),
    },
  });
});

router.post("/stock", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  assertStockManager(viewer);

  const parsed = createPpeStockSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;
  assertSiteAccess(viewer, data.siteId);

  const stock = await runAuditedMutation(viewer._id, async (session) => {
    const item = await PpeItem.findById(data.itemId).session(session);

    if (!item) {
      throw new HttpError(404, "PPE item not found.");
    }

    if (!item.isActive) {
      throw new HttpError(409, "Select an active PPE item.");
    }

    const site = await Site.findById(data.siteId).session(session);

    if (!site) {
      throw new HttpError(404, "Specified site was not found.");
    }

    if (site.status !== "ACTIVE") {
      throw new HttpError(409, "Stock can only be added at an active site.");
    }

    const exists = await PpeStock.exists({
      site: site._id,
      item: item._id,
    }).session(session);

    if (exists) {
      throw new HttpError(
        409,
        "Stock already exists for this item at this site. Adjust the existing quantity instead.",
      );
    }

    const created = new PpeStock({
      project: site.project,
      site: site._id,
      item: item._id,
      quantityOnHand: data.quantityOnHand,
      minimumQuantity: data.minimumQuantity,
      updatedBy: viewer._id,
    });

    try {
      await created.save({ session });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new HttpError(
          409,
          "Stock already exists for this item at this site. Adjust the existing quantity instead.",
        );
      }

      throw error;
    }

    return {
      result: created,
      audit: {
        action: "ppe.stock_created",
        entityType: "PpeStock",
        entityId: created._id,
        after: ppeStockAuditSnapshot(created, data.reason),
      },
    };
  });

  await stock.populate(PPE_STOCK_POPULATE);

  res.status(201).json({
    success: true,
    stock: toPpeStockSummary(stock),
  });
});

router.patch(
  "/stock/:id",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    assertStockManager(viewer);

    const stockId = parseObjectIdParam(req.params.id, "stock");
    const parsed = updatePpeStockSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const data = parsed.data;

    const stock = await runAuditedMutation(viewer._id, async (session) => {
      const stock = await PpeStock.findById(stockId).session(session);

      if (!stock) {
        throw new HttpError(404, "PPE stock record not found.");
      }

      assertPpeRecordAccess(viewer, stock);

      const before = ppeStockAuditSnapshot(stock);

      if (data.quantityOnHand !== undefined) {
        stock.quantityOnHand = data.quantityOnHand;
      }
      if (data.minimumQuantity !== undefined) {
        stock.minimumQuantity = data.minimumQuantity;
      }
      stock.updatedBy = viewer._id;

      await stock.save({ session });

      return {
        result: stock,
        audit: {
          action: "ppe.stock_updated",
          entityType: "PpeStock",
          entityId: stock._id,
          before,
          after: ppeStockAuditSnapshot(stock, data.reason),
        },
      };
    });

    await stock.populate(PPE_STOCK_POPULATE);

    res.status(200).json({
      success: true,
      stock: toPpeStockSummary(stock),
    });
  },
);

// ---------------------------------------------------------------------------
// Issuances
// ---------------------------------------------------------------------------

router.get("/issuances", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  assertPpeRegisterAccess(viewer);

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const itemId =
    typeof req.query.itemId === "string" ? req.query.itemId : undefined;
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
  const from = parseDateQuery(req.query.from, "start date");
  const to = parseDateQuery(req.query.to, "end date");
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;
  const search = rawSearch?.trim();

  if (status !== undefined && !isPpeIssuanceStatus(status)) {
    throw new HttpError(400, "Invalid PPE issuance status.");
  }

  if (kind !== undefined && kind !== "EMPLOYEE" && kind !== "CONTRACTOR") {
    throw new HttpError(400, "Invalid recipient type.");
  }

  for (const [label, value] of [
    ["item", itemId],
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

  if (search && search.length > 200) {
    throw new HttpError(400, "Search text is too long.");
  }

  const conditions: Record<string, unknown>[] = [];
  const scope = ppeScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (status) conditions.push({ status });
  if (kind) conditions.push({ kind });
  if (itemId) conditions.push({ item: new Types.ObjectId(itemId) });
  if (projectId) conditions.push({ project: new Types.ObjectId(projectId) });
  if (siteId) conditions.push({ site: new Types.ObjectId(siteId) });

  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    conditions.push({ issuedOn: range });
  }

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    const matchingItems = await PpeItem.find({
      $or: [{ code: pattern }, { name: pattern }],
    })
      .select("_id")
      .lean();

    conditions.push({
      $or: [
        { name: pattern },
        { item: { $in: matchingItems.map((item) => item._id) } },
      ],
    });
  }

  const filter: Record<string, unknown> =
    conditions.length > 0 ? { $and: conditions } : {};

  const { page, limit, skip } = parsePagination(req.query);

  const [total, issuances] = await Promise.all([
    PpeIssuance.countDocuments(filter),
    PpeIssuance.find(filter)
      .sort({ issuedOn: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(PPE_ISSUANCE_POPULATE)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    issuances: issuances.map(toPpeIssuanceSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

router.post(
  "/issuances",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    assertPpeIssueAccess(viewer);

    const parsed = issuePpeSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const data = parsed.data;
    assertSiteAccess(viewer, data.siteId);

    const issuedOn = data.issuedOn ?? new Date();
    assertNotFuture(issuedOn, "Issue date");

    const issuance = await runAuditedMutation(viewer._id, async (session) => {
      const site = await resolveActivePpeSite(session, data.siteId);
      const item = await PpeItem.findById(data.itemId).session(session);

      if (!item) {
        throw new HttpError(404, "PPE item not found.");
      }

      if (!item.isActive) {
        throw new HttpError(409, "Select an active PPE item.");
      }

      const [recipient] = await resolveParticipants(
        [data.recipient],
        site._id,
        session,
      );

      if (!recipient) {
        throw new HttpError(400, "Select a PPE recipient.");
      }

      await decrementStock(
        session,
        site._id,
        item._id,
        data.quantity,
        viewer._id,
      );

      const created = new PpeIssuance({
        project: site.project,
        site: site._id,
        item: item._id,
        kind: recipient.kind,
        employee: recipient.employee,
        contractorPersonnel: recipient.contractorPersonnel,
        contractor: recipient.contractor,
        name: recipient.name,
        quantity: data.quantity,
        conditionAtIssue: data.conditionAtIssue,
        status: "ISSUED",
        issuedOn,
        issuedBy: viewer._id,
        notes: data.notes ?? null,
      });

      await created.save({ session });

      return {
        result: created,
        audit: {
          action: "ppe.issuance_created",
          entityType: "PpeIssuance",
          entityId: created._id,
          after: ppeIssuanceAuditSnapshot(created),
        },
      };
    });

    await issuance.populate(PPE_ISSUANCE_POPULATE);

    res.status(201).json({
      success: true,
      issuance: toPpeIssuanceSummary(issuance),
    });
  },
);

router.get(
  "/issuances/:id",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    assertPpeRegisterAccess(viewer);

    const issuanceId = parseObjectIdParam(req.params.id, "PPE issuance");
    const issuance = await PpeIssuance.findById(issuanceId).populate(
      PPE_ISSUANCE_POPULATE,
    );

    if (!issuance) {
      throw new HttpError(404, "PPE issuance not found.");
    }

    assertPpeRecordAccess(viewer, issuance);

    res.status(200).json({
      success: true,
      issuance: toPpeIssuanceSummary(issuance),
    });
  },
);

router.patch(
  "/issuances/:id/return",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    assertPpeIssueAccess(viewer);

    const issuanceId = parseObjectIdParam(req.params.id, "PPE issuance");
    const parsed = returnPpeSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const data = parsed.data;
    const returnedOn = data.returnedOn ?? new Date();
    assertNotFuture(returnedOn, "Return date");

    if (data.restock && !isPpeRestockableCondition(data.returnCondition)) {
      throw new HttpError(
        400,
        "Only PPE returned in NEW, GOOD or FAIR condition can be restocked.",
      );
    }

    const issuance = await runAuditedMutation(viewer._id, async (session) => {
      const issuance = await PpeIssuance.findById(issuanceId).session(session);

      if (!issuance) {
        throw new HttpError(404, "PPE issuance not found.");
      }

      assertPpeRecordAccess(viewer, issuance);

      if (issuance.status !== "ISSUED") {
        throw new HttpError(
          409,
          `Cannot return PPE that is already ${issuance.status}.`,
        );
      }

      if (returnedOn.getTime() < issuance.issuedOn.getTime()) {
        throw new HttpError(
          400,
          "Return date cannot be before the issue date.",
        );
      }

      const before = ppeIssuanceAuditSnapshot(issuance);

      if (data.restock) {
        await restock(
          session,
          issuance.site,
          issuance.item,
          issuance.quantity,
          viewer._id,
        );
      }

      issuance.status = "RETURNED";
      issuance.returnedOn = returnedOn;
      issuance.returnedBy = viewer._id;
      issuance.returnCondition = data.returnCondition;
      issuance.returnNotes = data.notes ?? null;
      issuance.restocked = data.restock;

      await issuance.save({ session });

      return {
        result: issuance,
        audit: {
          action: "ppe.issuance_returned",
          entityType: "PpeIssuance",
          entityId: issuance._id,
          before,
          after: ppeIssuanceAuditSnapshot(issuance),
        },
      };
    });

    await issuance.populate(PPE_ISSUANCE_POPULATE);

    res.status(200).json({
      success: true,
      issuance: toPpeIssuanceSummary(issuance),
    });
  },
);

router.post(
  "/issuances/:id/replace",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    assertPpeIssueAccess(viewer);

    const issuanceId = parseObjectIdParam(req.params.id, "PPE issuance");
    const parsed = replacePpeSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const data = parsed.data;
    const issuedOn = data.issuedOn ?? new Date();
    assertNotFuture(issuedOn, "Replacement issue date");

    const replacement = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const previous =
          await PpeIssuance.findById(issuanceId).session(session);

        if (!previous) {
          throw new HttpError(404, "PPE issuance not found.");
        }

        assertPpeRecordAccess(viewer, previous);

        if (previous.status !== "ISSUED") {
          throw new HttpError(
            409,
            `Cannot replace PPE that is already ${previous.status}.`,
          );
        }

        const item = await PpeItem.findById(previous.item).session(session);

        if (!item || !item.isActive) {
          throw new HttpError(
            409,
            "This PPE item is inactive and cannot be reissued.",
          );
        }

        if (issuedOn.getTime() < previous.issuedOn.getTime()) {
          throw new HttpError(
            400,
            "Replacement date cannot be before the original issue date.",
          );
        }

        const before = ppeIssuanceAuditSnapshot(previous);

        await decrementStock(
          session,
          previous.site,
          previous.item,
          previous.quantity,
          viewer._id,
        );

        previous.status = "REPLACED";
        await previous.save({ session });

        const created = new PpeIssuance({
          project: previous.project,
          site: previous.site,
          item: previous.item,
          kind: previous.kind,
          employee: previous.employee,
          contractorPersonnel: previous.contractorPersonnel,
          contractor: previous.contractor,
          name: previous.name,
          quantity: previous.quantity,
          conditionAtIssue: data.conditionAtIssue ?? "NEW",
          status: "ISSUED",
          issuedOn,
          issuedBy: viewer._id,
          notes: data.notes ?? null,
          replacementFor: previous._id,
        });

        await created.save({ session });

        return {
          result: created,
          audit: {
            action: "ppe.issuance_replaced",
            entityType: "PpeIssuance",
            entityId: previous._id,
            before,
            after: ppeIssuanceAuditSnapshot(previous),
          },
          additionalAudits: [
            {
              action: "ppe.issuance_created",
              entityType: "PpeIssuance",
              entityId: created._id,
              after: ppeIssuanceAuditSnapshot(created),
            },
          ],
        };
      },
    );

    await replacement.populate(PPE_ISSUANCE_POPULATE);

    res.status(201).json({
      success: true,
      issuance: toPpeIssuanceSummary(replacement),
    });
  },
);

router.patch(
  "/issuances/:id/lost",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    assertPpeIssueAccess(viewer);

    const issuanceId = parseObjectIdParam(req.params.id, "PPE issuance");
    const parsed = lostPpeSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const data = parsed.data;
    const lostOn = data.lostOn ?? new Date();
    assertNotFuture(lostOn, "Lost date");

    const issuance = await runAuditedMutation(viewer._id, async (session) => {
      const issuance = await PpeIssuance.findById(issuanceId).session(session);

      if (!issuance) {
        throw new HttpError(404, "PPE issuance not found.");
      }

      assertPpeRecordAccess(viewer, issuance);

      if (issuance.status !== "ISSUED") {
        throw new HttpError(
          409,
          `Cannot mark PPE lost when it is already ${issuance.status}.`,
        );
      }

      if (lostOn.getTime() < issuance.issuedOn.getTime()) {
        throw new HttpError(400, "Lost date cannot be before the issue date.");
      }

      const before = ppeIssuanceAuditSnapshot(issuance);

      issuance.status = "LOST";
      issuance.lostOn = lostOn;
      issuance.lostBy = viewer._id;
      issuance.lostNotes = data.notes ?? null;

      await issuance.save({ session });

      return {
        result: issuance,
        audit: {
          action: "ppe.issuance_lost",
          entityType: "PpeIssuance",
          entityId: issuance._id,
          before,
          after: ppeIssuanceAuditSnapshot(issuance),
        },
      };
    });

    await issuance.populate(PPE_ISSUANCE_POPULATE);

    res.status(200).json({
      success: true,
      issuance: toPpeIssuanceSummary(issuance),
    });
  },
);

router.get(
  "/personnel/:kind/:personId/history",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    assertPpeRegisterAccess(viewer);

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
        ? { employee: new Types.ObjectId(personId) }
        : { contractorPersonnel: new Types.ObjectId(personId) },
    ];
    const scope = ppeScopeFilter(viewer);

    if (Object.keys(scope).length > 0) {
      conditions.push(scope);
    }

    const filter = { $and: conditions };
    const { page, limit, skip } = parsePagination(req.query);

    const [total, issuances] = await Promise.all([
      PpeIssuance.countDocuments(filter),
      PpeIssuance.find(filter)
        .sort({ issuedOn: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(PPE_ISSUANCE_POPULATE)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      records: issuances.map(toPpeIssuanceSummary),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
);

export default router;
