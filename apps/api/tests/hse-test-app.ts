import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { HttpError } from "../src/lib/http-error.js";
import contractorPersonnelRouter from "../src/routes/contractor-personnel.js";
import contractorsRouter from "../src/routes/contractors.js";
import projectsRouter from "../src/routes/projects.js";
import sitesRouter from "../src/routes/sites.js";

/**
 * Isolated app for HSE routes that are not yet registered in src/app.ts.
 * Mirrors the production error-handling contract without changing global
 * route registration.
 */
export function buildHseTestApp(): express.Express {
  const testApp = express();

  testApp.use(express.json());
  testApp.use("/api/projects", projectsRouter);
  testApp.use("/api/sites", sitesRouter);
  testApp.use("/api/contractors", contractorsRouter);
  testApp.use("/api/contractor-personnel", contractorPersonnelRouter);

  testApp.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
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

      res.status(status).json({
        success: false,
        message:
          status >= 400 && status < 500
            ? "Request could not be processed."
            : "Internal server error.",
      });
    },
  );

  return testApp;
}
