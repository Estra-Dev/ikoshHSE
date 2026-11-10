/**
 * One-off bootstrap script: promotes an existing IKOSH user to the ADMIN
 * application role. Run once after deployment to grant the first
 * administrator, e.g.:
 *
 *   pnpm --filter @ikosh/api promote-admin -- admin@ikosh.example
 *
 * The user must already exist in MongoDB (synced by the DigitAuth webhook
 * when they registered); this script never creates records and never
 * touches DigitAuth itself.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../src/models/User.js";

async function main(): Promise<void> {
  // Depending on the package manager version, `pnpm ... -- <email>` may
  // forward the `--` separator itself to the script, so separators are
  // skipped when locating the email argument.
  const positionalArgs = process.argv
    .slice(2)
    .filter((arg) => arg !== "--");

  const email = positionalArgs[0]?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    console.error("Usage: pnpm --filter @ikosh/api promote-admin -- <email>");
    process.exitCode = 1;
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
    const user = await User.findOne({ email });

    if (!user) {
      console.error(
        `No IKOSH user record found for ${email}. Ask the user to sign in to ` +
          "IKOSH HSE first (the DigitAuth webhook will sync their record), " +
          "then run this script again.",
      );
      process.exitCode = 1;
      return;
    }

    if (user.ikoshRole === "ADMIN") {
      console.log(`${email} is already an IKOSH ADMIN. No changes made.`);
      return;
    }

    const previousRole = user.ikoshRole;
    user.ikoshRole = "ADMIN";
    await user.save();

    console.log(
      `Promoted ${email} (id ${String(user._id)}) from ${previousRole} to IKOSH ADMIN.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Unable to promote admin:", error);
  process.exit(1);
});
