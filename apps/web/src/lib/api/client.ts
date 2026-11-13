"use client";

import { useMemo } from "react";
import { useAuth } from "@digit-auth/react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Access-token getter from the DigitAuth SDK. Returns the token synchronously
 * today; async getters are tolerated in case the SDK changes.
 */
type GetAccessToken = () => string | null | Promise<string | null>;

interface RequestConfig {
  method: ApiMethod;
  path: string;
  body?: unknown;
  formData?: FormData;
  searchParams?: URLSearchParams;
}

interface ApiEnvelope {
  success: boolean;
  message?: string;
}

/**
 * Thin fetch wrapper for the IKOSH Express API. Requests are authenticated
 * with the DigitAuth access token from the React SDK. All authorization is
 * enforced server-side; this client only surfaces the API's responses.
 */
async function request<T>(
  getAccessToken: GetAccessToken,
  config: RequestConfig,
): Promise<T> {
  const token = await getAccessToken();

  const url = new URL(config.path, API_BASE_URL);

  if (config.searchParams) {
    for (const [key, value] of config.searchParams.entries()) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (config.body !== undefined && config.formData === undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: config.method,
      headers,
      body:
        config.formData ??
        (config.body === undefined ? undefined : JSON.stringify(config.body)),
    });
  } catch {
    throw new ApiError(
      0,
      "Unable to reach the IKOSH API. Check your connection and try again.",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | (ApiEnvelope & Partial<T>)
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.message ??
        (response.status === 401
          ? "Authentication required."
          : "Request could not be processed."),
    );
  }

  return payload as T;
}

/**
 * Authenticated binary download. The API protects attachment downloads with
 * the same Bearer token as JSON endpoints; errors are still JSON envelopes.
 */
async function requestBlob(
  getAccessToken: GetAccessToken,
  path: string,
): Promise<Blob> {
  const token = await getAccessToken();
  const url = new URL(path, API_BASE_URL);
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(url, { method: "GET", headers });
  } catch {
    throw new ApiError(
      0,
      "Unable to reach the IKOSH API. Check your connection and try again.",
    );
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | ApiEnvelope
      | null;

    throw new ApiError(
      response.status,
      payload?.message ??
        (response.status === 401
          ? "Authentication required."
          : "The file could not be downloaded."),
    );
  }

  return response.blob();
}

/** Bound API client scoped to the current authenticated session. */
export function useApi() {
  const { getAccessToken } = useAuth();

  return useMemo(
    () => ({
      get: <T>(path: string, searchParams?: URLSearchParams) =>
        request<T>(getAccessToken, { method: "GET", path, searchParams }),
      post: <T>(path: string, body?: unknown) =>
        request<T>(getAccessToken, { method: "POST", path, body }),
      postForm: <T>(path: string, formData: FormData) =>
        request<T>(getAccessToken, { method: "POST", path, formData }),
      patch: <T>(path: string, body?: unknown) =>
        request<T>(getAccessToken, { method: "PATCH", path, body }),
      delete: <T>(path: string) =>
        request<T>(getAccessToken, { method: "DELETE", path }),
      getBlob: (path: string) => requestBlob(getAccessToken, path),
    }),
    [getAccessToken],
  );
}
