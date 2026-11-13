/**
 * Backfill legacy contractor personnel site values into explicit site
 * assignment records.
 *
 * Before this batch, `ContractorPersonnel.site` held a single site reference.
 * The new assignment collection preserves history. This script converts each
 * non-null legacy value into an active assignment without deleting or changing
 * the legacy `site` field, so existing reads remain compatible.
 *
 * Safe by default: it only reports what would change. Pass `--apply` to write.
 * The script is idempotent: an existing active assignment for the same
 * personnel/site pair is left untouched.
 *
 * Usage:
 *   pnpm --filter @ikosh/api backfill-contractor-personnel-site-assignments
 *   pnpm --filter @ikosh/api backfill-contractor-personnel-site-assignments -- --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { ContractorPersonnelSiteAssignment } from "../src/models/ContractorPersonnelSiteAssignment.js";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");

  if (args.includes("--help")) {
    console.log(
      "Usage: backfill-contractor-personnel-site-assignments [--apply]",
    );
    return;
  }

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error("Missing MONGODB_URI environment variable.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(mongoUri);

  try {
    const personnel = await ContractorPersonnel.find({
      site: { $ne: null },
    }).lean();

    console.log(
      `Found ${personnel.length} personnel record(s) with a legacy site value.`,
    );

    if (!apply) {
      console.log(
        "Dry run: no changes will be written. Re-run with --apply to backfill.",
      );
    }

    let created = 0;
    let alreadyPresent = 0;
    let skipped = 0;

    for (const record of personnel) {
      const siteId = record.site;

      if (!siteId) {
        skipped += 1;
        continue;
      }

      const existing = await ContractorPersonnelSiteAssignment.findOne({
        personnel: record._id,
        site: siteId,
        isActive: true,
      }).lean();

      if (existing) {
        alreadyPresent += 1;
        continue;
      }

      const assignedAt = record.createdAt ?? new Date();

      if (!apply) {
        created += 1;
        console.log(
          `[dry-run] ${String(record._id)} -> site ${String(siteId)} (assignedAt ${assignedAt.toISOString()})`,
        );
        continue;
      }

      try {
        await ContractorPersonnelSiteAssignment.updateOne(
          {
            personnel: record._id,
            site: siteId,
            isActive: true,
          },
          {
            $setOnInsert: {
              personnel: record._id,
              contractor: record.contractor,
              site: siteId,
              assignedAt,
              assignedBy: null,
              endedAt: null,
              endedBy: null,
              isActive: true,
            },
          },
          { upsert: true },
        );

        created += 1;
        console.log(
          `Assigned ${String(record._id)} -> site ${String(siteId)}.`,
        );
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          alreadyPresent += 1;
          continue;
        }

        skipped += 1;
        console.error(
          `Failed to backfill ${String(record._id)} -> ${String(siteId)}:`,
          error,
        );
      }
    }

    console.log(
      `Summary: ${apply ? "created" : "would create"}=${created}, already present=${alreadyPresent}, skipped=${skipped}.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error("Contractor personnel assignment backfill failed:", error);
  process.exit(1);
});
