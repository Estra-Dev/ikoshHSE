import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_TIMESTAMP_AGE_SECONDS = 300;

interface VerifyWebhookSignatureOptions {
  rawBody: Buffer;
  timestamp: string;
  signature: string;
  secret: string;
}

export function verifyWebhookSignature({
  rawBody,
  timestamp,
  signature,
  secret,
}: VerifyWebhookSignatureOptions): boolean {
  if (!timestamp || !signature || !secret || !Buffer.isBuffer(rawBody)) {
    return false;
  }

  const timestampSeconds = Number(timestamp);

  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const age = Math.abs(Date.now() / 1000 - timestampSeconds);

  if (age > MAX_TIMESTAMP_AGE_SECONDS) {
    return false;
  }

  const expectedSignature =
    "sha256=" +
    createHmac("sha256", secret)
      .update(timestamp + "." + rawBody.toString("utf8"), "utf8")
      .digest("hex");

  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
