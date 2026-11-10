import "dotenv/config";
import { app } from "./app.js";
import { connectToDatabase } from "./db/connect.js";

const PORT = process.env.PORT || 4000;

async function startServer(): Promise<void> {
  try {
    await connectToDatabase();

    app.listen(PORT, () => {
      console.log(`ikoshHSE API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Unable to start ikoshHSE API:", error);
    process.exit(1);
  }
}

void startServer();
