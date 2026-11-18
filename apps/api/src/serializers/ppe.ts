export interface PpeItemLike {
  _id: unknown;
  code: string;
  name: string;
  category: string;
  size?: string | null;
  unit: string;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PpeStockLike {
  _id: unknown;
  project: unknown;
  site: unknown;
  item: unknown;
  quantityOnHand: number;
  minimumQuantity: number;
  updatedBy?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface PpeIssuanceLike {
  _id: unknown;
  project: unknown;
  site: unknown;
  item: unknown;
  kind: string;
  employee?: unknown;
  contractorPersonnel?: unknown;
  contractor?: unknown;
  name: string;
  quantity: number;
  conditionAtIssue: string;
  status: string;
  issuedOn: Date;
  issuedBy?: unknown;
  notes?: string | null;
  returnedOn?: Date | null;
  returnedBy?: unknown;
  returnCondition?: string | null;
  returnNotes?: string | null;
  restocked: boolean;
  lostOn?: Date | null;
  lostBy?: unknown;
  lostNotes?: string | null;
  replacementFor?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface PpeItemRef {
  id: string;
  code: string | null;
  name: string | null;
  category: string | null;
  size: string | null;
  unit: string | null;
}

export interface PpeProjectRef {
  id: string;
  name: string | null;
}

export interface PpeSiteRef {
  id: string;
  name: string | null;
  code: string | null;
}

export interface PpeUserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface PpeContractorRef {
  id: string;
  name: string | null;
}

export interface SerializedPpeItem {
  id: string;
  code: string;
  name: string;
  category: string;
  size: string | null;
  unit: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedPpeStock {
  id: string;
  item: PpeItemRef;
  project: PpeProjectRef;
  site: PpeSiteRef;
  quantityOnHand: number;
  minimumQuantity: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  updatedBy: PpeUserRef | null;
  updatedAt: string;
}

export interface SerializedPpeIssuance {
  id: string;
  recipient: {
    kind: string;
    employeeId: string | null;
    contractorPersonnelId: string | null;
    contractor: PpeContractorRef | null;
    name: string;
  };
  item: PpeItemRef;
  project: PpeProjectRef;
  site: PpeSiteRef;
  quantity: number;
  conditionAtIssue: string;
  status: string;
  issuedOn: string;
  issuedBy: PpeUserRef | null;
  notes: string | null;
  returnedOn: string | null;
  returnedBy: PpeUserRef | null;
  returnCondition: string | null;
  returnNotes: string | null;
  restocked: boolean;
  lostOn: string | null;
  lostBy: PpeUserRef | null;
  lostNotes: string | null;
  replacementFor: string | null;
  createdAt: string;
  updatedAt: string;
}

function referenceId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    if ("_id" in value) {
      const id = (value as { _id: unknown })._id;
      return id === null || id === undefined ? null : String(id);
    }

    return String(value);
  }

  return String(value);
}

function stringField(value: unknown, key: string): string | null {
  if (typeof value === "object" && value !== null && key in value) {
    const field = (value as Record<string, unknown>)[key];
    return typeof field === "string" ? field : null;
  }

  return null;
}

function toProjectRef(project: unknown): PpeProjectRef {
  return {
    id: referenceId(project) ?? "",
    name: stringField(project, "name"),
  };
}

function toSiteRef(site: unknown): PpeSiteRef {
  return {
    id: referenceId(site) ?? "",
    name: stringField(site, "name"),
    code: stringField(site, "code"),
  };
}

function toItemRef(item: unknown): PpeItemRef {
  return {
    id: referenceId(item) ?? "",
    code: stringField(item, "code"),
    name: stringField(item, "name"),
    category: stringField(item, "category"),
    size: stringField(item, "size"),
    unit: stringField(item, "unit"),
  };
}

function toUserRef(user: unknown): PpeUserRef | null {
  const id = referenceId(user);

  if (!id) {
    return null;
  }

  return {
    id,
    firstName: stringField(user, "firstName") ?? "",
    lastName: stringField(user, "lastName") ?? "",
  };
}

function toContractorRef(contractor: unknown): PpeContractorRef | null {
  const id = referenceId(contractor);

  if (!id) {
    return null;
  }

  return { id, name: stringField(contractor, "name") };
}

export function toPpeItemSummary(item: PpeItemLike): SerializedPpeItem {
  return {
    id: String(item._id),
    code: item.code,
    name: item.name,
    category: item.category,
    size: item.size ?? null,
    unit: item.unit,
    description: item.description ?? "",
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/**
 * Low stock is only flagged when a meaningful threshold is configured.
 * Out-of-stock is always visible as a separate state.
 */
export function ppeStockState(
  quantityOnHand: number,
  minimumQuantity: number,
): { isLowStock: boolean; isOutOfStock: boolean } {
  const isOutOfStock = quantityOnHand <= 0;
  return {
    isOutOfStock,
    isLowStock:
      !isOutOfStock && minimumQuantity > 0 && quantityOnHand <= minimumQuantity,
  };
}

export function toPpeStockSummary(stock: PpeStockLike): SerializedPpeStock {
  const state = ppeStockState(stock.quantityOnHand, stock.minimumQuantity);

  return {
    id: String(stock._id),
    item: toItemRef(stock.item),
    project: toProjectRef(stock.project),
    site: toSiteRef(stock.site),
    quantityOnHand: stock.quantityOnHand,
    minimumQuantity: stock.minimumQuantity,
    ...state,
    updatedBy: toUserRef(stock.updatedBy),
    updatedAt: stock.updatedAt.toISOString(),
  };
}

export function toPpeIssuanceSummary(
  issuance: PpeIssuanceLike,
): SerializedPpeIssuance {
  return {
    id: String(issuance._id),
    recipient: {
      kind: issuance.kind,
      employeeId: referenceId(issuance.employee),
      contractorPersonnelId: referenceId(issuance.contractorPersonnel),
      contractor: toContractorRef(issuance.contractor),
      name: issuance.name,
    },
    item: toItemRef(issuance.item),
    project: toProjectRef(issuance.project),
    site: toSiteRef(issuance.site),
    quantity: issuance.quantity,
    conditionAtIssue: issuance.conditionAtIssue,
    status: issuance.status,
    issuedOn: issuance.issuedOn.toISOString(),
    issuedBy: toUserRef(issuance.issuedBy),
    notes: issuance.notes ?? null,
    returnedOn: issuance.returnedOn
      ? issuance.returnedOn.toISOString()
      : null,
    returnedBy: toUserRef(issuance.returnedBy),
    returnCondition: issuance.returnCondition ?? null,
    returnNotes: issuance.returnNotes ?? null,
    restocked: issuance.restocked,
    lostOn: issuance.lostOn ? issuance.lostOn.toISOString() : null,
    lostBy: toUserRef(issuance.lostBy),
    lostNotes: issuance.lostNotes ?? null,
    replacementFor: referenceId(issuance.replacementFor),
    createdAt: issuance.createdAt.toISOString(),
    updatedAt: issuance.updatedAt.toISOString(),
  };
}
