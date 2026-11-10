/**
 * One-off migration: converts legacy free-text `User.department` values into
 * `Department` records and stores ObjectId references instead.
 *
 * The DigitAuth webhook never writes the department field, so this only
 * affects records created before the Employee Management milestone.
 *
 * Reads and writes through the raw driver collection, because the User
 * schema now expects ObjectIds and would fail to hydrate legacy strings.
 *
 * Usage: pnpm --filter @ikosh/api migrate-departments
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Department } from "../src/models/Department.js";

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error("Missing MONGODB_URI environment variable.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(mongoUri);

  try {
    const usersCollection = mongoose.connection.collection("users");

    const legacyUsers = await usersCollection
      .find({ department: { $type: "string" } })
      .toArray();

    if (legacyUsers.length === 0) {
      console.log("No legacy department values found. Nothing to migrate.");
      return;
    }

    console.log(`Found ${legacyUsers.length} user(s) with legacy departments.`);

    let migrated = 0;

    for (const legacyUser of legacyUsers) {
      const name = String(legacyUser.department).trim();
      const email = String(legacyUser.email);

      if (!name) {
        await usersCollection.updateOne(
          { _id: legacyUser._id },
          { $set: { department: null } },
        );
        console.log(`- ${email}: cleared empty department value.`);
        continue;
      }

      const department = await Department.findOneAndUpdate(
        { name },
        { $setOnInsert: { name, code: await uniqueCodeFor(name) } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      await usersCollection.updateOne(
        { _id: legacyUser._id },
        { $set: { department: department._id } },
      );

      migrated += 1;
      console.log(`- ${email}: "${name}" -> ${String(department._id)}`);
    }

    console.log(`Migrated ${migrated} user(s) to department references.`);
  } finally {
    await mongoose.disconnect();
  }
}

/** Builds a short, unique, uppercase code from a department name. */
async function uniqueCodeFor(name: string): Promise<string> {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 12) || "DEPT";

  let code = base;
  let suffix = 2;

  while (await Department.exists({ code })) {
    code = `${base.slice(0, 10)}-${suffix}`;
    suffix += 1;
  }

  return code;
}

void main().catch((error: unknown) => {
  console.error("Department migration failed:", error);
  process.exit(1);
});
