import type {
  PpeCategory,
  PpeCondition,
  PpeIssuanceStatus,
  PpeUnit,
  WorkforceParticipantKind,
} from "./api/types";

export const PPE_CATEGORY_LABELS: Record<PpeCategory, string> = {
  HEAD_PROTECTION: "Head protection",
  EYE_FACE_PROTECTION: "Eye & face protection",
  HEARING_PROTECTION: "Hearing protection",
  RESPIRATORY_PROTECTION: "Respiratory protection",
  HAND_PROTECTION: "Hand protection",
  FOOT_PROTECTION: "Foot protection",
  BODY_PROTECTION: "Body protection",
  FALL_PROTECTION: "Fall protection",
  HIGH_VISIBILITY: "High visibility",
  OTHER: "Other",
};

export const PPE_UNIT_LABELS: Record<PpeUnit, string> = {
  EACH: "Each",
  PAIR: "Pair",
  SET: "Set",
  BOX: "Box",
};

export const PPE_CONDITION_LABELS: Record<PpeCondition, string> = {
  NEW: "New",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
  DAMAGED: "Damaged",
};

export const PPE_STATUS_LABELS: Record<PpeIssuanceStatus, string> = {
  ISSUED: "Issued",
  RETURNED: "Returned",
  REPLACED: "Replaced",
  LOST: "Lost",
};

export const PPE_KIND_LABELS: Record<WorkforceParticipantKind, string> = {
  EMPLOYEE: "Employee",
  CONTRACTOR: "Contractor",
};

/** Only serviceable PPE may be returned to usable stock. */
export const PPE_RESTOCKABLE_CONDITIONS: readonly PpeCondition[] = [
  "NEW",
  "GOOD",
  "FAIR",
];

export function isRestockableCondition(condition: PpeCondition): boolean {
  return PPE_RESTOCKABLE_CONDITIONS.includes(condition);
}

export function formatPpeItemName(item: {
  code: string | null;
  name: string | null;
  size: string | null;
}): string {
  const label = [item.code, item.name].filter(Boolean).join(" · ");
  const base = label || "PPE item";
  return item.size ? `${base} (${item.size})` : base;
}

/** Label used for the low-stock banner without inventing a warning state. */
export function ppeStockLabel(state: {
  isOutOfStock: boolean;
  isLowStock: boolean;
  quantityOnHand: number;
  minimumQuantity: number;
}): string {
  if (state.isOutOfStock) {
    return "Out of stock";
  }

  if (state.isLowStock) {
    return `Low stock · ${state.quantityOnHand} left (minimum ${state.minimumQuantity})`;
  }

  return "In stock";
}

export interface PpeFilterState {
  q: string;
  status: "" | PpeIssuanceStatus;
  kind: "" | WorkforceParticipantKind;
  projectId: string;
  siteId: string;
  from: string;
  to: string;
  page: number;
  limit: number;
}

export const DEFAULT_PPE_FILTERS: PpeFilterState = {
  q: "",
  status: "",
  kind: "",
  projectId: "",
  siteId: "",
  from: "",
  to: "",
  page: 1,
  limit: 20,
};

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePpeFilters(params: URLSearchParams): PpeFilterState {
  const status = params.get("status") ?? "";
  const kind = params.get("kind") ?? "";

  return {
    q: (params.get("q") ?? "").trim(),
    status: (["ISSUED", "RETURNED", "REPLACED", "LOST"] as const).includes(
      status as never,
    )
      ? (status as PpeIssuanceStatus)
      : "",
    kind: (["EMPLOYEE", "CONTRACTOR"] as const).includes(kind as never)
      ? (kind as WorkforceParticipantKind)
      : "",
    projectId: params.get("projectId") ?? "",
    siteId: params.get("siteId") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    page: positiveInt(params.get("page"), 1),
    limit: Math.min(positiveInt(params.get("limit"), 20), 100),
  };
}

export function buildPpeSearchParams(filters: PpeFilterState): URLSearchParams {
  const params = new URLSearchParams();

  for (const key of [
    "q",
    "status",
    "kind",
    "projectId",
    "siteId",
    "from",
    "to",
  ] as const) {
    const value = filters[key].trim();
    if (value) {
      params.set(key, value);
    }
  }

  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  return params;
}

export function hasActivePpeFilters(filters: PpeFilterState): boolean {
  return Boolean(
    filters.q ||
      filters.status ||
      filters.kind ||
      filters.projectId ||
      filters.siteId ||
      filters.from ||
      filters.to,
  );
}
