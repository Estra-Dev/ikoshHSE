import mongoose, { type ClientSession, Types } from "mongoose";
import { AuditLog } from "../models/AuditLog.js";

export interface AuditMutationDetails {
  action: string;
  entityType: string;
  entityId?: Types.ObjectId | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface AuditedMutation<T> {
  result: T;
  audit: AuditMutationDetails;
}

/**
 * Runs a domain mutation and its audit insert in one MongoDB transaction.
 *
 * If the audit insert fails, the transaction aborts the domain mutation, so
 * a successful response can never represent an unaudited write.
 *
 * Production MongoDB must be a replica set (MongoDB Atlas is); standalone
 * servers do not support multi-document transactions.
 */
export async function runAuditedMutation<T>(
  actorId: Types.ObjectId,
  mutate: (session: ClientSession) => Promise<AuditedMutation<T>>,
): Promise<T> {
  const session = await mongoose.startSession();
  let result: T | undefined;

  try {
    await session.withTransaction(async () => {
      const outcome = await mutate(session);
      result = outcome.result;

      await AuditLog.create(
        [
          {
            actor: actorId,
            action: outcome.audit.action,
            entityType: outcome.audit.entityType,
            entityId: outcome.audit.entityId ?? null,
            before: outcome.audit.before ?? null,
            after: outcome.audit.after ?? null,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  if (result === undefined) {
    throw new Error("Audited mutation completed without a result.");
  }

  return result;
}
