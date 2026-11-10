import { createHmac } from "node:crypto";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { User } from "../src/models/User.js";
import { createIkoshUser } from "./helpers.js";

/**
 * Regression coverage for the DigitAuth webhook integration, which this
 * milestone must preserve unchanged. Signs and posts real webhook events
 * through the production app and asserts the MongoDB sync outcome.
 */

const WEBHOOK_SECRET = "test_webhook_secret";

function buildSignedWebhook(event: object): request.Test {
  const rawBody = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature =
    "sha256=" +
    createHmac("sha256", WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex");

  const eventEnvelope = event as { id: string; type: string };

  return request(app)
    .post("/api/webhooks/digit-auth")
    .set("Content-Type", "application/json")
    .set("digitauth-timestamp", timestamp)
    .set("digitauth-signature", signature)
    .set("digitauth-event", eventEnvelope.type)
    .set("digitauth-delivery", eventEnvelope.id)
    .send(rawBody);
}

beforeAll(() => {
  // The webhook route reads the secret per request; the route itself is
  // untouched, only this test environment variable changes.
  process.env.DIGITAUTH_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

describe("DigitAuth webhook (preserved behavior)", () => {
  it("rejects unsigned deliveries (400)", async () => {
    const response = await request(app)
      .post("/api/webhooks/digit-auth")
      .set("Content-Type", "application/json")
      .send({ id: "evt_x", type: "user.created", data: {} });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid webhook request.");
  });

  it("rejects deliveries with an invalid signature (401)", async () => {
    const rawBody = JSON.stringify({
      id: "evt_bad_sig",
      type: "user.created",
      createdAt: new Date().toISOString(),
      data: {
        id: "da_user_bad_sig",
        applicationId: "da_app_test",
        email: "bad@ikosh.test",
      },
    });

    const response = await request(app)
      .post("/api/webhooks/digit-auth")
      .set("Content-Type", "application/json")
      .set("digitauth-timestamp", Math.floor(Date.now() / 1000).toString())
      .set("digitauth-signature", "sha256=deadbeef")
      .set("digitauth-event", "user.created")
      .set("digitauth-delivery", "evt_bad_sig")
      .send(rawBody);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid webhook signature.");
  });

  it("syncs user.created events into the IKOSH users collection", async () => {
    const response = await buildSignedWebhook({
      id: "evt_test_1",
      type: "user.created",
      createdAt: new Date().toISOString(),
      data: {
        id: "da_user_webhook",
        applicationId: "da_app_test",
        email: "Webhook.User@IKOSH.test",
        firstName: "Walter",
        lastName: "Webb",
        emailVerified: false,
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });

    const user = await User.findOne({ digitAuthUserId: "da_user_webhook" });

    expect(user).not.toBeNull();
    expect(user?.email).toBe("webhook.user@ikosh.test");
    expect(user?.firstName).toBe("Walter");
    expect(user?.lastName).toBe("Webb");
    expect(user?.emailVerified).toBe(false);
    // New users remain plain employees with active status.
    expect(user?.ikoshRole).toBe("EMPLOYEE");
    expect(user?.isActive).toBe(true);
  });

  it("treats duplicate deliveries as already processed", async () => {
    const event = {
      id: "evt_test_dup",
      type: "user.created",
      createdAt: new Date().toISOString(),
      data: {
        id: "da_user_dup",
        applicationId: "da_app_test",
        email: "dup@ikosh.test",
        firstName: "Dora",
        lastName: "Duplicate",
      },
    };

    const first = await buildSignedWebhook(event, "evt_test_dup");
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });

    const second = await buildSignedWebhook(event, "evt_test_dup");
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it("ignores unrecognized event types", async () => {
    const rawBody = JSON.stringify({
      id: "evt_unknown",
      type: "user.deleted",
      createdAt: new Date().toISOString(),
      data: { id: "da_user_webhook" },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature =
      "sha256=" +
      createHmac("sha256", WEBHOOK_SECRET)
        .update(`${timestamp}.${rawBody}`, "utf8")
        .digest("hex");

    const response = await request(app)
      .post("/api/webhooks/digit-auth")
      .set("Content-Type", "application/json")
      .set("digitauth-timestamp", timestamp)
      .set("digitauth-signature", signature)
      .set("digitauth-event", "user.deleted")
      .set("digitauth-delivery", "evt_unknown")
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, ignored: true });
  });

  it("keeps the webhook independent of IKOSH employee status", async () => {
    // Even a deactivated employee gets their synced profile fields updated,
    // and the webhook never flips IKOSH employment status back to active.
    await createIkoshUser({
      digitAuthUserId: "da_user_webhook_status",
      email: "Webhook.User@IKOSH.test",
      firstName: "Walter",
      lastName: "Webb",
      isActive: false,
    });

    const response = await buildSignedWebhook({
      id: "evt_test_2",
      type: "user.email_verified",
      createdAt: new Date().toISOString(),
      data: {
        id: "da_user_webhook_status",
        applicationId: "da_app_test",
        email: "Webhook.User@IKOSH.test",
        firstName: "Walter",
        lastName: "Webb",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });

    const user = await User.findOne({
      digitAuthUserId: "da_user_webhook_status",
    });
    expect(user?.emailVerified).toBe(true);
    // IKOSH employment status is untouched by the webhook.
    expect(user?.isActive).toBe(false);
  });
});

describe("webhook raw-body parser ordering (preserved behavior)", () => {
  it("still parses other routes as JSON", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
