# IKOSH HSE Web

Next.js 16 (App Router) frontend for the IKOSH HSE system. Authentication is
provided by the hosted DigitAuth service; all authorization is enforced by the
API in `apps/api`.

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# Fill in DigitAuth and API values.

pnpm --filter web dev        # http://localhost:3000
pnpm --filter web type-check
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web start
```

## Environment

| Variable                                 | Purpose                               |
| ---------------------------------------- | ------------------------------------- |
| `NEXT_PUBLIC_DIGIT_AUTH_API_URL`         | DigitAuth hosted API URL.             |
| `NEXT_PUBLIC_DIGIT_AUTH_PUBLISHABLE_KEY` | DigitAuth publishable key.            |
| `NEXT_PUBLIC_API_URL`                    | Public base URL of the IKOSH HSE API. |

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:4000` in development.
Production deployments must use the API's public HTTPS origin, and the API's
`WEB_ORIGIN` must match this web app's origin.

## Phase 1 screens

The current frontend covers the employee directory, employee profiles,
self-service contact updates, department management, sign-in/sign-up and
password reset. HSE incident, attachment and dashboard workflows are exposed
by the API but are not yet given dedicated screens; Phase 1 does not redesign
the frontend.

Client-side helpers in `src/lib/permissions.ts` only control visible
affordances. The API re-checks every action against the MongoDB employee
record and site assignments.
