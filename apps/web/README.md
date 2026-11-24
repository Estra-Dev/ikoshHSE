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

## Permit detail (M7.4)

The permit detail screen includes two informational sections:

- **Readiness — A03 draft preview.** The API evaluates the A03 candidate as a
  `DRAFT_PREVIEW`. The notice “A03 DRAFT PREVIEW — informational only; it does
  not approve, activate, resume, or block a permit.” is shown verbatim, and the
  preview never gates workflow actions. The canonical 14-item decision register
  is not supplied, so that panel remains blocked. Evidence capture is available
  only while the permit is `DRAFT` and only to the creator, responsible person
  or HSE management.
- **Operational records.** Monitoring checks and revalidations are append-only
  evidence. New records can be added only on `APPROVED`, `ACTIVE` or
  `SUSPENDED` permits by permitted operators; history stays readable in every
  status. The client sends only the record type, notes and optional attachment
  IDs. The server stamps the actor and timestamp and remains authoritative for
  scope, status and attachments.

All writes invalidate the relevant queries so the server response refreshes the
preview and timeline. No readiness or operational-record state changes the
existing submit, approve, activate, suspend, resume, cancel or close actions.
