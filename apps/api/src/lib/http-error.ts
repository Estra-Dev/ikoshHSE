/**
 * Application error carrying an explicit HTTP status code.
 *
 * Throwing this from route handlers or middleware lets the centralized
 * Express error handler respond with the intended status code and a safe,
 * client-facing message. Any other error keeps the existing masking behavior.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
