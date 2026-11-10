import type { AuthenticatedUser } from "@digit-auth/node";

/**
 * Token registry backing the `@digit-auth/node` mock installed in
 * `tests/setup.ts`. Test files register DigitAuth identities against
 * bearer tokens via `signInAs` in `tests/helpers.ts`.
 *
 * Kept in its own module (with no vitest imports) so the `vi.mock` factory
 * can dynamically import it and test files can share the same instance.
 */
const usersByToken = new Map<string, AuthenticatedUser>();

export function registerDigitAuthUser(
  token: string,
  user: AuthenticatedUser,
): void {
  usersByToken.set(token, user);
}

export function findDigitAuthUser(token: string): AuthenticatedUser | undefined {
  return usersByToken.get(token);
}

export function clearDigitAuthUsers(): void {
  usersByToken.clear();
}
