import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import { getAuth, requireAuth } from "@digit-auth/node";
import { digitAuth } from "./lib/digit-auth.js";
import { HttpError } from "./lib/http-error.js";
import digitAuthWebhookRouter from "./routes/webhooks/digit-auth.js";
import departmentsRouter from "./routes/departments.js";
import employeesRouter from "./routes/employees.js";

export const app: express.Express = express();

app.use(
  cors({
    origin: "http://localhost:3000",
  }),
);

// DigitAuth webhook must receive the raw request body for HMAC verification.
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  digitAuthWebhookRouter,
);

// Parse JSON for all other API routes.
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "ikoshHSE API is running",
  });
});

// Verify the identity of the currently authenticated user.
app.get("/api/auth/me", requireAuth(digitAuth), (req, res) => {
  const authContext = getAuth(req);

  if (!authContext) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return;
  }

  const { id, email, firstName, lastName, role, status, emailVerified } =
    authContext.user;

  res.status(200).json({
    success: true,
    user: {
      id,
      email,
      firstName,
      lastName,
      role,
      status,
      emailVerified,
    },
  });
});

// Department management (employee directory foundation).
app.use("/api/departments", departmentsRouter);

// Employee directory and profiles.
app.use("/api/employees", employeesRouter);

// Centralized error handler: never expose internal stack traces to clients.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("API request error:", error);

  // Intentional application errors carry a safe, client-facing message.
  if (error instanceof HttpError) {
    res.status(error.status).json({
      success: false,
      message: error.message,
    });
    return;
  }

  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;

  console.error("API request error:", error);

  const message =
    status === 401
      ? "Authentication required."
      : status >= 400 && status < 500
        ? "Request could not be processed."
        : "Internal server error.";

  res.status(status).json({
    success: false,
    message,
  });
});
