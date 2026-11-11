# IKOSH HSE

Enterprise Health, Safety and Environment (HSE) management system for
IKOSH NIG LTD. Phase 1 covers employee management plus HSE reference data,
projects, sites, contractors, contractor personnel, secure attachments,
incident/near-miss reporting, a scoped dashboard and an append-only audit
trail.

## Repository layout

| Package     | Description                              |
| ----------- | ---------------------------------------- |
| `apps/web`  | Next.js 16 (App Router) frontend         |
| `apps/api`  | Express 5 + Mongoose REST API            |

Authentication is delegated to the hosted **DigitAuth** service: the frontend
uses `@digit-auth/react`, and the API syncs user identity through signed
DigitAuth webhooks and introspects bearer tokens through `@digit-auth/node`.
See [`apps/api/README.md`](apps/api/README.md) for endpoint-level API
documentation.

## Authentication and authorization

DigitAuth answers *who is this person*. The IKOSH MongoDB record answers
*what may they do here*. The two are deliberately separate:

- **Fail-closed access.** An authenticated DigitAuth identity with no IKOSH
  user record receives `403` on every application endpoint. Records are only
  created by the DigitAuth webhook or an administrator — never implicitly by
  middleware.
- **Employment status.** `isActive: false` blocks all application endpoints
  while leaving the DigitAuth account itself untouched (deactivated employees
  can still authenticate, they just cannot use IKOSH HSE).
- **IKOSH roles** (`EMPLOYEE`, `SUPERVISOR`, `HSE_OFFICER`, `HSE_MANAGER`,
  `ADMIN`) live only in MongoDB. DigitAuth roles never grant IKOSH access.
- **Site-level access.** `HSE_MANAGER` and `ADMIN` see all sites. Other roles
  are restricted to `User.assignedSites`; an employee with no assigned sites
  sees zero site-scoped records rather than everything.
- **Sensitive information.** Ordinary employees see only basic profile
  information (names, contact details, job title, department). Employment and
  administrative details (employee ID, hire date, employment type, manager,
  role, status, assigned sites) are visible to management roles and the
  employee themselves.
- **Admin-only actions.** Employment edits, role changes and
  activation/deactivation require `ADMIN`. Administrators cannot change their
  own role or deactivate themselves.

Frontend permission helpers in `apps/web/src/lib/permissions.ts` mirror these
rules for UI gating, but every rule is enforced again server-side in
`apps/api` (`attachIkoshUser` + `requireIkoshRole` middleware and the
site-access helpers).

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

## Phase 1 endpoints

All routes below except `/api/health` require a DigitAuth bearer token and an
active IKOSH employee record. `HSE_MANAGER`/`ADMIN` may manage HSE records
across all sites; other roles are site-scoped where noted.

| Area                 | Endpoints                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Health               | `GET /api/health` (public)                                                                                                       |
| Identity             | `GET /api/auth/me`                                                                                                               |
| Departments          | `GET /api/departments`; `POST`, `PATCH /:id`, `DELETE /:id` (ADMIN)                                                              |
| Employees            | `GET /api/employees`, `GET /api/employees/me`, `PATCH /api/employees/me`; `GET /:id`; `PATCH /:id`, `PATCH /:id/role`, `PATCH /:id/status` (ADMIN) |
| Projects             | `GET /api/projects`; `POST`, `PATCH /:id`, `DELETE /:id` (HSE_MANAGER/ADMIN)                                                     |
| Sites                | `GET /api/sites` (site-scoped); `POST`, `PATCH /:id`, `DELETE /:id` (HSE_MANAGER/ADMIN)                                          |
| Contractors          | `GET /api/contractors`; `POST`, `PATCH /:id`, `DELETE /:id` (HSE_MANAGER/ADMIN)                                                  |
| Contractor personnel | `GET /api/contractor-personnel` (site-scoped); `POST`, `PATCH /:id`, `DELETE /:id` (HSE_MANAGER/ADMIN)                           |
| Attachments          | `GET /api/attachments` (scoped); `POST /api/attachments` (multipart upload); `PATCH /:id` (HSE_MANAGER/ADMIN); `GET /:id/download` |
| Incidents            | `GET /api/incidents` (site-scoped); `POST /`; `GET /:id`; `PATCH /:id`; `PATCH /:id/classification`, `PATCH /:id/status` (HSE_MANAGER/ADMIN) |
| HSE data             | `GET /api/hse/reference`; `GET /api/hse/dashboard` (scoped); `GET /api/hse/audit-log` (HSE_MANAGER/ADMIN)                        |

The dashboard accepts `projectId`, `siteId`, `from` and `to` query parameters.
It returns `scope`, `totals` (projects, sites, contractors, contractor
personnel, attachments, incidents, near-misses), incident breakdowns by
status and category, an `unclassified` count, a daily trend, and
`lastUpdated`. Inaccessible project/site filters return `404`; invalid values
return `400`.

Incident status is strictly forward-only: `REPORTED → TRIAGED → CLOSED`.
Skipped, same-status, backward and reopened transitions return `409`.

## Secure attachments

Attachment bytes are stored privately on local disk under
`ATTACHMENT_STORAGE_DIR` (never inside MongoDB and never publicly served).
Uploads are accepted as multipart form data, validated against real file
signatures, capped at 10 MB, and stored under opaque server-generated keys.
SHA-256 checksums are calculated on upload and verified again on download.
Files linked to sites or incidents are only readable by HSE management, the
uploader, or employees assigned to the linked site.

Allowed MIME types: PNG, JPEG, GIF, WEBP, PDF, plain text, RTF, DOC/DOCX and
XLS/XLSX. Client-declared MIME types are accepted only when the uploaded bytes
match the expected file family. Original filenames are sanitized for display
only; they never influence the on-disk path.

## Incidents and near-misses

`/api/incidents` supports incident and near-miss reporting by employees at
their assigned sites. Reports start in `REPORTED` status with no category;
only `HSE_MANAGER` and `ADMIN` may classify or change management-controlled
fields. Reporters cannot set category or status. Reporters may edit their own
untriaged report content; incident responses expose only related record
identifiers, never employee personal data.

## Audit logging

Important HSE domain mutations (departments, employees, projects, sites,
contractors, contractor personnel, attachments and incidents) write an
append-only audit record in the same MongoDB transaction as the mutation. If
the audit insert fails, the transaction aborts and the domain change is rolled
back, so a successful response can never represent an unaudited write.

- The actor is always taken from `req.ikoshUser`, never from request input.
- Snapshots are explicitly whitelisted per entity; names, contact details,
  filenames, report descriptions and other unnecessary personal data are
  excluded.
- Audit records are readable only by `HSE_MANAGER` and `ADMIN` via
  `GET /api/hse/audit-log`.

### MongoDB replication requirement

MongoDB multi-document transactions require a replica set. Production
deployments (including MongoDB Atlas) must run as a replica set; a standalone
`mongod` cannot serve audited mutations. The test suite starts an in-memory
single-node replica set automatically (`MongoMemoryReplSet`).

## Environment variables

Copy the `.env.example` files in `apps/api` and `apps/web` and fill in the
credentials.

### API (`apps/api/.env`)

| Variable                   | Purpose                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `PORT`                     | HTTP port (default `4000`).                                                                 |
| `WEB_ORIGIN`               | Browser origin allowed by CORS (default `http://localhost:3000`).                            |
| `MONGODB_URI`              | MongoDB connection string. Must point at a **replica set**.                                 |
| `DIGIT_AUTH_API_URL`       | DigitAuth introspection API base URL.                                                       |
| `DIGIT_AUTH_CLIENT_ID`     | DigitAuth application client ID.                                                            |
| `DIGIT_AUTH_CLIENT_SECRET` | DigitAuth application client secret.                                                        |
| `DIGITAUTH_WEBHOOK_SECRET` | Shared HMAC secret used to verify DigitAuth webhook signatures.                             |
| `ATTACHMENT_STORAGE_DIR`   | Private, persistent directory for attachment bytes (default `./storage/attachments`).       |

### Web (`apps/web/.env`)

| Variable                                  | Purpose                                  |
| ----------------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_DIGIT_AUTH_API_URL`          | DigitAuth hosted API URL.                |
| `NEXT_PUBLIC_DIGIT_AUTH_PUBLISHABLE_KEY`  | DigitAuth publishable key.               |
| `NEXT_PUBLIC_API_URL`                     | Public base URL of the IKOSH HSE API.    |

## Development

```bash
pnpm install

pnpm dev:api   # Express API on http://localhost:4000
pnpm dev:web   # Next.js app on http://localhost:3000
```

### Quality gates

```bash
pnpm type-check:api
pnpm test:api          # vitest + in-memory MongoDB replica set
pnpm build:api

pnpm type-check:web
pnpm test:web          # URL/filter + permission rule tests
pnpm lint:web
pnpm build:web         # production build (also type-checks)
```

## Production deployment requirements

1. **MongoDB replica set.** Required for audited transactions. Enable
   authentication, TLS and least-privilege database users.
2. **Persistent private attachment storage.** `ATTACHMENT_STORAGE_DIR` must
   survive redeploys, be writable only by the API process, be excluded from
   the web root, and be included in backups. Do not place it on an ephemeral
   container filesystem.
3. **Secrets.** Set DigitAuth credentials and `DIGITAUTH_WEBHOOK_SECRET` via a
   secret manager, never in the repository. Rotate the webhook secret with
   the DigitAuth console.
4. **CORS.** Set `WEB_ORIGIN` to the exact public web origin. Requests from
   other browser origins receive no CORS permission.
5. **TLS and reverse proxy.** Terminate HTTPS in front of the API, keep the
   webhook route's raw request body untouched, and set a request-body limit at
   the proxy that is at least the 10 MB attachment limit.
6. **Webhook delivery.** Route `POST /api/webhooks/digit-auth` from DigitAuth
   to the API over HTTPS. Keep timestamps within the five-minute tolerance.
7. **Indexes.** Mongoose creates declared indexes automatically in
   development. In production, run `syncIndexes()` (or apply the equivalent
   migration) during a controlled deployment window.
8. **Backups and monitoring.** Back up MongoDB and attachment storage
   together so metadata and bytes stay consistent. Monitor webhook failures
   (`WebhookEvent.status = FAILED`) and audit-write errors.
9. **Edge protections.** Rate limiting, WAF rules and HSTS are expected at the
   reverse proxy/load balancer (see limitations).

## Known limitations

- **Local-disk attachment storage only.** No object storage, replication or
  CDN integration is implemented.
- **No malware scanning.** File-signature and size checks reject spoofed
  content, but uploaded files are not virus-scanned. Production should add an
  antivirus scanning step before files are made downloadable.
- **Family-level file validation.** DOC/XLS are recognized as OLE containers
  and DOCX/XLSX as ZIP containers; their internal contents are not deeply
  inspected.
- **Daily UTC dashboard trends.** Trend buckets are calendar days in UTC.
  Weekly/monthly rollups and timezone-local buckets are not implemented.
- **No rate limiting or security headers in the application.** These must be
  provided by the deployment edge (reverse proxy, WAF).
- **Audit immutability is application-level.** No update/delete endpoints
  exist; database permissions should additionally deny updates and deletes on
  the audit collection.
- **Future modules.** Inspections, training, CAPA, permits and environmental
  records are not part of Phase 1.
- **Frontend scope.** Phase 1 does not redesign the frontend around HSE
  workflows; existing employee/department screens are preserved.
