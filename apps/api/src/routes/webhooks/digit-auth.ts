import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { User } from "../../models/User.js";
import { WebhookEvent } from "../../models/WebhookEvent.js";
import { verifyWebhookSignature } from "../../lib/verify-webhook-signature.js";

const router: Router = Router();

const PROCESSING_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

interface DigitAuthWebhookEvent {
  id: string;
  type: string;
  createdAt: string;
  data: {
    id?: string;
    applicationId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    emailVerified?: boolean;
    createdAt?: string;
    emailVerifiedAt?: string;
  };
}

router.post(
  "/digit-auth",
  async (req: Request, res: Response): Promise<void> => {
    const secret = process.env.DIGITAUTH_WEBHOOK_SECRET;
    const timestamp = req.header("digitauth-timestamp");
    const signature = req.header("digitauth-signature");
    const eventHeader = req.header("digitauth-event");
    const deliveryHeader = req.header("digitauth-delivery");

    if (!secret) {
      res.status(500).json({ message: "Webhook is not configured." });
      return;
    }

    if (
      !timestamp ||
      !signature ||
      !eventHeader ||
      !deliveryHeader ||
      !Buffer.isBuffer(req.body)
    ) {
      res.status(400).json({ message: "Invalid webhook request." });
      return;
    }

    const valid = verifyWebhookSignature({
      rawBody: req.body,
      timestamp,
      signature,
      secret,
    });

    if (!valid) {
      res.status(401).json({ message: "Invalid webhook signature." });
      return;
    }

    let event: DigitAuthWebhookEvent;

    try {
      event = JSON.parse(req.body.toString("utf8")) as DigitAuthWebhookEvent;
    } catch {
      res.status(400).json({ message: "Invalid webhook payload." });
      return;
    }

    if (
      !event ||
      typeof event.id !== "string" ||
      typeof event.type !== "string" ||
      !event.data ||
      typeof event.data !== "object" ||
      event.id !== deliveryHeader ||
      event.type !== eventHeader
    ) {
      res.status(400).json({ message: "Invalid webhook event envelope." });
      return;
    }

    if (!["user.created", "user.email_verified"].includes(event.type)) {
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const now = new Date();
    const staleLock = new Date(now.getTime() - PROCESSING_LOCK_TIMEOUT_MS);
    const processingToken = randomUUID();

    let claimedEvent;

    try {
      claimedEvent = await WebhookEvent.findOneAndUpdate(
        {
          deliveryId: event.id,
          $or: [
            { status: "FAILED" },
            {
              status: "PROCESSING",
              processingStartedAt: { $lt: staleLock },
            },
            {
              status: "PROCESSING",
              processingStartedAt: null,
            },
          ],
        },
        {
          $set: {
            status: "PROCESSING",
            eventType: event.type,
            processingToken,
            processingStartedAt: now,
            lastError: null,
          },
          $inc: {
            attempts: 1,
          },
        },
        {
          new: true,
        },
      );
    } catch {
      res.status(500).json({ message: "Unable to claim webhook event." });
      return;
    }

    if (!claimedEvent) {
      try {
        await WebhookEvent.create({
          deliveryId: event.id,
          eventType: event.type,
          status: "PROCESSING",
          attempts: 1,
          processingToken,
          processingStartedAt: now,
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === 11000
        ) {
          const existing = await WebhookEvent.findOne({
            deliveryId: event.id,
          }).select("+processingToken");

          if (existing?.status === "PROCESSED") {
            res.status(200).json({
              received: true,
              duplicate: true,
            });
            return;
          }

          res.status(503).json({
            message: "Webhook delivery is already being processed.",
          });
          return;
        }

        res.status(500).json({
          message: "Unable to accept webhook event.",
        });
        return;
      }
    }

    try {
      const data = event.data;
      const digitAuthUserId = data.id;
      const applicationId = data.applicationId;

      if (
        !digitAuthUserId ||
        !applicationId ||
        !data.email ||
        typeof data.email !== "string"
      ) {
        throw new Error("Required user fields are missing from the event.");
      }

      const userUpdate: Record<string, unknown> = {
        email: data.email,
        firstName: data.firstName ?? "",
        lastName: data.lastName ?? "",
      };

      if (event.type === "user.created") {
        userUpdate.emailVerified = data.emailVerified ?? false;
      } else {
        userUpdate.emailVerified = true;
      }

      await User.findOneAndUpdate(
        {
          digitAuthUserId,
          digitAuthApplicationId: applicationId,
        },
        {
          $set: userUpdate,
          $setOnInsert: {
            digitAuthUserId,
            digitAuthApplicationId: applicationId,
            ikoshRole: "EMPLOYEE",
            isActive: true,
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      );

      const completed = await WebhookEvent.updateOne(
        {
          deliveryId: event.id,
          processingToken,
          status: "PROCESSING",
        },
        {
          $set: {
            status: "PROCESSED",
            processedAt: new Date(),
            processingToken: null,
            processingStartedAt: null,
            lastError: null,
          },
        },
      );

      if (completed.modifiedCount !== 1) {
        throw new Error("Webhook processing lock was lost.");
      }

      res.status(200).json({ received: true });
    } catch (error) {
      await WebhookEvent.updateOne(
        {
          deliveryId: event.id,
          processingToken,
          status: "PROCESSING",
        },
        {
          $set: {
            status: "FAILED",
            processingToken: null,
            processingStartedAt: null,
            lastError:
              error instanceof Error
                ? error.message
                : "Unknown processing error",
          },
        },
      );

      res.status(500).json({ message: "Webhook processing failed." });
    }
  },
);

export default router;
