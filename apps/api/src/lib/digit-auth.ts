import { createDigitAuth } from "@digit-auth/node";

const apiUrl = process.env.DIGIT_AUTH_API_URL;
const clientId = process.env.DIGIT_AUTH_CLIENT_ID;
const clientSecret = process.env.DIGIT_AUTH_CLIENT_SECRET;

if (!apiUrl || !clientId || !clientSecret) {
  throw new Error(
    "Missing DigitAuth configuration. Check the API environment variables.",
  );
}

export const digitAuth = createDigitAuth({
  apiUrl,
  clientId,
  clientSecret,
});
