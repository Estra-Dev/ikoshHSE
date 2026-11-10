import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

/**
 * Placeholder DigitAuth configuration. `src/lib/digit-auth.ts` validates these
 * at import time; the network client itself is replaced by the mock below, so
 * these values are never used for real requests.
 */
process.env.DIGIT_AUTH_API_URL ??= "http://digit-auth.test/api/v1";
process.env.DIGIT_AUTH_CLIENT_ID ??= "da_test_client_id";
process.env.DIGIT_AUTH_CLIENT_SECRET ??= "das_test_client_secret";

/**
 * Mocks `@digit-auth/node` so `createDigitAuth` returns a client whose
 * `getCurrentUser` resolves from the test token registry, while every other
 * export — most importantly `requireAuth` and `getAuth` — remains the real
 * SDK implementation. Existing authentication behavior is therefore executed
 * exactly as in production, only backed by a stub identity store.
 */
vi.mock("@digit-auth/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@digit-auth/node")>();
  const { findDigitAuthUser } = await import("./digit-auth-stub.ts");

  return {
    ...actual,
    createDigitAuth: () => ({
      client: {
        getCurrentUser: async (accessToken: string) => {
          const user = findDigitAuthUser(accessToken);

          if (!user) {
            throw new actual.DigitAuthError(
              "Invalid or expired access token.",
              401,
              "API_ERROR",
            );
          }

          return user;
        },
      },
    }),
  };
});

let mongoServer: MongoMemoryServer | null = null;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri("ikoshHSE-test");
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.syncIndexes();
});

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});
