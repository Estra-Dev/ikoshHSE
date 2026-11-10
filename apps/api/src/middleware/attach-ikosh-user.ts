import { getAuth } from "@digit-auth/node";
import type { NextFunction, Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import { User, type UserDocument } from "../models/User.js";
import { HttpError } from "../lib/http-error.js";

/**
 * Loads the IKOSH employee record for the authenticated DigitAuth identity
 * and attaches it to `req.ikoshUser`.
 *
 * Must run after `requireAuth(digitAuth)`.
 *
 * Authorization policy:
 * - Fails closed: a DigitAuth identity with no corresponding IKOSH MongoDB
 *   user record is denied access. Records are only created by the DigitAuth
 *   webhook (or an administrator); this middleware never creates one.
 * - IKOSH employment status (`isActive`) is independent of DigitAuth
 *   authentication status: an inactive employee may still authenticate with
 *   DigitAuth, but is denied access to all application endpoints.
 */
export async function attachIkoshUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authContext = getAuth(req);

  if (!authContext) {
    next(new HttpError(401, "Authentication required."));
    return;
  }

  let ikoshUser;

  try {
    ikoshUser = await User.findOne({
      digitAuthUserId: authContext.user.id,
    });
  } catch {
    next(new HttpError(500, "Internal server error."));
    return;
  }

  if (!ikoshUser) {
    next(
      new HttpError(
        403,
        "No IKOSH employee record exists for this account. Contact an administrator.",
      ),
    );
    return;
  }

  if (!ikoshUser.isActive) {
    next(
      new HttpError(
        403,
        "This employee record is inactive. Contact an administrator.",
      ),
    );
    return;
  }

  req.ikoshUser = ikoshUser;
  next();
}

/**
 * Returns the IKOSH employee record attached by `attachIkoshUser`, throwing
 * a 403 if the middleware did not run for this request.
 */
export function getIkoshUser(
  req: Request,
): HydratedDocument<UserDocument> {
  if (!req.ikoshUser) {
    throw new HttpError(403, "IKOSH employee context is required.");
  }

  return req.ikoshUser;
}
