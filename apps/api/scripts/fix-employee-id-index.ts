import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI.");
  }

  await mongoose.connect(mongoUri);

  const collection = mongoose.connection.collection("users");
  const indexName = "employeeId_1";

  const expectedPartialFilter = {
    employeeId: { $type: "string" },
  };

  const indexes = await collection.indexes();
  const existingIndex = indexes.find((index) => index.name === indexName);

  const isCorrect =
    existingIndex?.key?.employeeId === 1 &&
    existingIndex.unique === true &&
    JSON.stringify(existingIndex.partialFilterExpression) ===
      JSON.stringify(expectedPartialFilter);

  if (isCorrect) {
    console.log("Correct employeeId index already exists. No changes needed.");
    console.log(existingIndex);
    return;
  }

  if (existingIndex) {
    await collection.dropIndex(indexName);
    console.log("Removed outdated employeeId index.");
  }

  await collection.createIndex(
    { employeeId: 1 },
    {
      name: indexName,
      unique: true,
      partialFilterExpression: expectedPartialFilter,
    },
  );

  console.log("Correct employeeId index created.");

  const updatedIndexes = await collection.indexes();
  console.log(updatedIndexes.find((index) => index.name === indexName));
}

main()
  .catch((error) => {
    console.error("Index migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
