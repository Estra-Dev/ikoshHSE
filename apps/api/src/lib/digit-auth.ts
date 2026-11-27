import { createDigitAuth } from "@digit-auth/node";

const apiUrl = process.env.DIGIT_AUTH_API_URL;
const clientId = process.env.DIGIT_AUTH_CLIENT_ID;
const clientSecret = process.env.DIGIT_AUTH_CLIENT_SECRET;

if (!apiUrl || !clientId || !clientSecret) {
  throw new Error(
    "Missing DigitAuth configuration. Check the API environment variables.",
  );
}

/** Upstream authentication calls are given more headroom than the SDK default. */
const DEFAULT_TIMEOUT_MS = 20_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;

/**
 * Reads `DIGIT_AUTH_TIMEOUT_MS`, defaulting to 20 seconds.
 *
 * The hosted DigitAuth service can be slow to cold-start. A configurable
 * timeout keeps authentication deterministic without weakening the checks:
 * requests still fail closed when the service is unavailable. Invalid values
 * fail fast at startup so a typo cannot silently disable the bound.
 */
function resolveTimeoutMs(): number {
  const raw = process.env.DIGIT_AUTH_TIMEOUT_MS?.trim();

  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }

  const value = Number(raw);

  if (
    !Number.isInteger(value) ||
    value < MIN_TIMEOUT_MS ||
    value > MAX_TIMEOUT_MS
  ) {
    throw new Error(
      `Invalid DIGIT_AUTH_TIMEOUT_MS "${raw}". Expected an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} milliseconds.`,
    );
  }

  return value;
}

export const digitAuth = createDigitAuth({
  apiUrl,
  clientId,
  clientSecret,
  timeoutMs: resolveTimeoutMs(),
});
