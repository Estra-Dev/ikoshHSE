import type { HydratedDocument } from "mongoose";
import type { UserDocument } from "../models/User.js";

declare global {
  namespace Express {
    interface Request {
      /**
       * IKOSH employee record for the authenticated DigitAuth identity,
       * populated by the `attachIkoshUser` middleware. Optional because
       * only routes mounted behind that middleware can rely on it.
       */
      ikoshUser?: HydratedDocument<UserDocument>;
    }
  }
}

export {};
