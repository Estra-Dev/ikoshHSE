import type { AuditLogDocument } from "../models/AuditLog.js";

/** Minimal document shape required to serialize an audit log entry. */
export type AuditLogLike = AuditLogDocument & { _id: unknown };

export interface SerializedAuditLog {
  id: string;
  actor: { id: string };
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

/** Whitelists audit log response fields and converts the Mongo document to a JSON-safe shape. */
export function toAuditLogSummary(
  auditLog: AuditLogLike,
): SerializedAuditLog {
  return {
    id: String(auditLog._id),
    actor: { id: String(auditLog.actor) },
    action: auditLog.action,
    entityType: auditLog.entityType,
    entityId: auditLog.entityId ? String(auditLog.entityId) : null,
    before: auditLog.before ?? null,
    after: auditLog.after ?? null,
    createdAt: auditLog.createdAt.toISOString(),
  };
}