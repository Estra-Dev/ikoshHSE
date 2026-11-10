import mongoose from "mongoose";

export async function connectToDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB Atlas");
  } catch (error) {
    console.error("Failed to connect to MongoDB Atlas:", error);
    throw error;
  }
}
