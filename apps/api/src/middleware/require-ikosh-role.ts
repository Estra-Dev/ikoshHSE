import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error.js";
import type { IkoshRole } from "../lib/ikosh-constants.js";

/**
 * Guards a route so only the given IKOSH roles may proceed.
 *
 * Must run after `requireAuth(digitAuth)` and `attachIkoshUser`, since the
 * IKOSH role is read from the MongoDB employee record (`req.ikoshUser`),
 * never from the DigitAuth authentication context.
 */
export function requireIkoshRole(...roles: readonly IkoshRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ikoshUser = req.ikoshUser;

    if (!ikoshUser) {
      next(new HttpError(403, "IKOSH employee context is required."));
      return;
    }

    if (!roles.includes(ikoshUser.ikoshRole as IkoshRole)) {
      next(
        new HttpError(
          403,
          "You do not have permission to perform this action.",
        ),
      );
      return;
    }

    next();
  };
}
