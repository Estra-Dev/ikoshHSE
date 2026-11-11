import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * Audit logging wraps domain writes and audit inserts in a MongoDB
 * transaction. Transactions require a replica set, so the test database runs
 * as a single-node replica set instead of a standalone server.
 */
export default async function setup() {
  const mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });

  process.env.MONGODB_URI = mongoServer.getUri("ikoshHSE-test");

  return async () => {
    await mongoServer.stop();
  };
}
