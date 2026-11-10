# IKOSH HSE

Enterprise Health, Safety and Environment (HSE) management system for
IKOSH NIG LTD.

## Repository layout

| Package          | Description                                        |
| ---------------- | -------------------------------------------------- |
| `apps/web`       | Next.js 16 (App Router) frontend                   |
| `apps/api`       | Express 5 + Mongoose REST API                       |

Authentication is delegated to the hosted **DigitAuth** service: the frontend
uses `@digit-auth/react`, and the API syncs user identity through signed
DigitAuth webhooks and introspects bearer tokens through `@digit-auth/node`.

## Employee Management

DigitAuth answers *who is this person*. The IKOSH MongoDB record answers
*what may they do here*. The two are deliberately separate:

- **Fail-closed access.** An authenticated DigitAuth identity with no IKOSH
  user record receives `403` on every application endpoint. Records are only
  created by the DigitAuth webhook or an administrator — never implicitly by
  middleware.
- **Employment status.** `isActive: false` blocks all application endpoints
  while leaving the DigitAuth account itself untouched (deactivated employees
  can still authenticate, they just cannot use IKOSH HSE).
- **IKOSH roles** (`EMPLOYEE`, `SUPERVISOR`, `HSE_OFFICER`, `ADMIN`) live only
  in MongoDB. DigitAuth roles never grant IKOSH access.
- **Sensitive information.** Ordinary employees see only basic profile
  information (names, contact details, job title, department). Employment and
  administrative details (employee ID, hire date, employment type, manager,
  role, status) are visible to management roles and the employee themselves.
- **Admin-only actions.** Employment edits, role changes and
  activation/deactivation require `ADMIN`. Administrators cannot change their
  own role or deactivate themselves.

Frontend permission helpers in `apps/web/src/lib/permissions.ts` mirror these
rules for UI gating, but every rule is enforced again server-side in
`apps/api` (`attachIkoshUser` + `requireIkoshRole` middleware).

### First administrator

Users synced by the webhook default to `EMPLOYEE`. Promote the first admin
once the user has signed in at least once (so their record exists):

```bash
pnpm --filter @ikosh/api promote-admin -- admin@example.com
```

### Legacy department data

If users were created before this milestone with free-text `department`
values, convert them into department references:

```bash
pnpm --filter @ikosh/api migrate-departments
```

## Development

```bash
pnpm install

pnpm dev:api   # Express API on http://localhost:4000
pnpm dev:web   # Next.js app on http://localhost:3000
```

### Environment

Copy the `.env.example` files in `apps/api` and `apps/web` and fill in the
DigitAuth and MongoDB credentials. The web app additionally needs
`NEXT_PUBLIC_API_URL` pointing at the API.

### Quality gates

```bash
pnpm test:api          # API tests (vitest + in-memory MongoDB)
pnpm --filter @ikosh/api type-check

pnpm test:web          # Web unit tests (URL/filter + permission rules)
pnpm lint:web          # Web ESLint
pnpm build:web         # Web production build (also type-checks)
```
