import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import { canViewReports } from "../lib/hse-permissions.js";
import { buildHseReport } from "../lib/hse-reports.js";
import { hseReportQuerySchema } from "../lib/validation/report.js";
import { firstValidationIssue } from "../lib/validation/common.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";

const router: Router = Router();

router.use(requireAuth(digitAuth), attachIkoshUser);

/**
 * Cross-module HSE report. Aggregates are built from the same operational
 * records and scope filters used by the individual registers.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canViewReports(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to view HSE reports.");
  }

  const parsed = hseReportQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = await buildHseReport(viewer, parsed.data);

  res.status(200).json({ success: true, data });
});

export default router;
