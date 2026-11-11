# IKOSH HSE API

Express 5 + Mongoose REST API for the IKOSH HSE Phase 1 backend.

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
# Fill in MongoDB, DigitAuth and webhook values.

pnpm --filter @ikosh/api dev        # http://localhost:4000
pnpm --filter @ikosh/api type-check
pnpm --filter @ikosh/api test       # vitest + in-memory MongoDB replica set
pnpm --filter @ikosh/api build
pnpm --filter @ikosh/api start      # runs dist/server.js
```

The API refuses to start without `MONGODB_URI`, and `src/lib/digit-auth.ts`
refuses to load without the three DigitAuth credentials.

## Authentication

- Every application route calls `requireAuth(digitAuth)` followed by
  `attachIkoshUser`.
- DigitAuth establishes identity only. Authorization uses the MongoDB user
  record (`req.ikoshUser`), so a DigitAuth account without an IKOSH record is
  denied with `403`.
- `isActive: false` denies access to all application routes.
- IKOSH roles are `EMPLOYEE`, `SUPERVISOR`, `HSE_OFFICER`, `HSE_MANAGER` and
  `ADMIN`.
- `HSE_MANAGER`/`ADMIN` see all sites. All other roles are restricted to
  `User.assignedSites`; empty assignments match zero records.

### DigitAuth webhook

`POST /api/webhooks/digit-auth` is mounted **before** `express.json()` so the
route receives the raw request body required for HMAC verification.

- Headers: `digitauth-timestamp`, `digitauth-signature`,
  `digitauth-event`, `digitauth-delivery`.
- Signature: `sha256=` HMAC-SHA256 of `timestamp + "." + rawBody` using
  `DIGITAUTH_WEBHOOK_SECRET`, compared in constant time.
- Timestamps older/newer than five minutes are rejected.
- Delivery IDs are deduplicated in `WebhookEvent`. Duplicate processed
  deliveries return `200 { duplicate: true }`; concurrent in-flight
  deliveries return `503`; failed deliveries are retried with a lock.
- Only `user.created` and `user.email_verified` are processed; other event
  types are acknowledged and ignored.

## Response conventions

Successful responses include `success: true`. Lists use
`pagination: { page, limit, total, totalPages }`. Errors are
`{ success: false, message }`; stack traces and internal details are never
returned. Pagination is validated: `page` must be a positive integer,
`limit` is `1–100`, and malformed values return `400`.

## Endpoints

### Health and identity

| Method | Path            | Access | Notes                         |
| ------ | --------------- | ------ | ----------------------------- |
| GET    | `/api/health`   | Public | Liveness check.               |
| GET    | `/api/auth/me`  | Auth   | DigitAuth identity projection.|

### Departments

| Method | Path                 | Access |
| ------ | -------------------- | ------ |
| GET    | `/api/departments`   | Auth   |
| POST   | `/api/departments`   | ADMIN  |
| PATCH  | `/api/departments/:id` | ADMIN |
| DELETE | `/api/departments/:id` | ADMIN |

`includeInactive=true` is honoured for `ADMIN` only. Departments with
assigned employees cannot be deleted.

### Employees

| Method | Path                        | Access                         |
| ------ | --------------------------- | ------------------------------ |
| GET    | `/api/employees`            | Auth (basic profiles)          |
| GET    | `/api/employees/me`         | Auth (own full profile)        |
| PATCH  | `/api/employees/me`         | Auth (phone/location only)     |
| GET    | `/api/employees/:id`        | Auth (full for self/management)|
| PATCH  | `/api/employees/:id`        | ADMIN                          |
| PATCH  | `/api/employees/:id/role`   | ADMIN (never self)             |
| PATCH  | `/api/employees/:id/status` | ADMIN (never self-deactivate)  |

Basic profiles exclude employee ID, hire date, employment type, manager,
role, status and site assignments. Inactive employees are hidden from
ordinary employees.

### Projects and sites

| Method | Path                 | Access                  |
| ------ | -------------------- | ----------------------- |
| GET    | `/api/projects`      | Auth                    |
| POST   | `/api/projects`      | HSE_MANAGER / ADMIN     |
| PATCH  | `/api/projects/:id`  | HSE_MANAGER / ADMIN     |
| DELETE | `/api/projects/:id`  | HSE_MANAGER / ADMIN     |
| GET    | `/api/sites`         | Auth, site-scoped       |
| POST   | `/api/sites`         | HSE_MANAGER / ADMIN     |
| PATCH  | `/api/sites/:id`     | HSE_MANAGER / ADMIN     |
| DELETE | `/api/sites/:id`     | HSE_MANAGER / ADMIN     |

Sites accept `projectId`, `includeInactive`, `page` and `limit`. Deleting a
project is blocked while sites exist; deleting a site is blocked while
employees or contractor personnel are assigned.

### Contractors and contractor personnel

| Method | Path                                  | Access                  |
| ------ | ------------------------------------- | ----------------------- |
| GET    | `/api/contractors`                    | Auth                    |
| POST   | `/api/contractors`                    | HSE_MANAGER / ADMIN     |
| PATCH  | `/api/contractors/:id`                | HSE_MANAGER / ADMIN     |
| DELETE | `/api/contractors/:id`                | HSE_MANAGER / ADMIN     |
| GET    | `/api/contractor-personnel`           | Auth, site-scoped       |
| POST   | `/api/contractor-personnel`           | HSE_MANAGER / ADMIN     |
| PATCH  | `/api/contractor-personnel/:id`       | HSE_MANAGER / ADMIN     |
| DELETE | `/api/contractor-personnel/:id`       | HSE_MANAGER / ADMIN     |

Contractor personnel accept `contractorId`, `siteId`, `includeInactive`,
`page` and `limit`. Non-management users never see personnel at unassigned
sites, including personnel with no site assignment.

### Attachments

| Method | Path                            | Access                                      |
| ------ | ------------------------------- | ------------------------------------------- |
| GET    | `/api/attachments`              | Auth, scoped by ownership/site/incident     |
| POST   | `/api/attachments`              | Auth, with access to the linked site/incident|
| PATCH  | `/api/attachments/:id`          | HSE_MANAGER / ADMIN                         |
| GET    | `/api/attachments/:id/download` | Owner, HSE management, or assigned site     |

`POST /api/attachments` is `multipart/form-data` with a single `file` field
and optional `entityType` (`site` or `incident`), `entityId`, `description`
and `checksum` fields. `entityType` and `entityId` must be supplied together.

- Maximum size: 10 MB.
- Allowed MIME types: PNG, JPEG, GIF, WEBP, PDF, plain text, RTF, DOC, DOCX,
  XLS, XLSX.
- The server verifies magic bytes against the declared MIME family,
  recalculates SHA-256, and rejects a mismatched client checksum.
- Bytes are written under a 64-character opaque key with private permissions.
  Client filenames cannot influence the storage path.
- If the audited database write fails, the stored file is deleted.
- Downloads verify the checksum before streaming and return `409` if the
  stored bytes no longer match.
- Responses never include storage keys or filesystem paths.

### Incidents

| Method | Path                                | Access                                  |
| ------ | ----------------------------------- | --------------------------------------- |
| GET    | `/api/incidents`                    | Auth, site-scoped                       |
| POST   | `/api/incidents`                    | Employees with `reportIncident`         |
| GET    | `/api/incidents/:id`                | Auth, site-scoped                       |
| PATCH  | `/api/incidents/:id`                | Reporter while `REPORTED`, or management|
| PATCH  | `/api/incidents/:id/classification` | HSE_MANAGER / ADMIN                     |
| PATCH  | `/api/incidents/:id/status`         | HSE_MANAGER / ADMIN                     |

Create fields: `siteId`, optional `type` (`INCIDENT` or `NEAR_MISS`),
`title`, `description`, `occurredAt`, optional `location` and
`immediateActions`. Requests are strict: reporter-supplied `category` or
`status` is rejected with `400`.

Statuses are `REPORTED`, `TRIAGED` and `CLOSED`. Transitions are
forward-only; invalid, skipped, backward or repeated transitions return
`409`. Lists accept `siteId`, `status`, `type`, `page` and `limit`.

### HSE reference, dashboard and audit log

| Method | Path                   | Access               |
| ------ | ---------------------- | -------------------- |
| GET    | `/api/hse/reference`   | Auth                 |
| GET    | `/api/hse/dashboard`   | Auth, site-scoped    |
| GET    | `/api/hse/audit-log`   | HSE_MANAGER / ADMIN  |

`/api/hse/reference` returns the server constants for incident categories,
types and statuses, injured body parts, permit-to-work types, waste types,
project statuses and site statuses.

`/api/hse/dashboard` accepts `projectId`, `siteId`, `from` and `to`
(ISO-8601). It returns:

```json
{
  "scope": { "projectId": null, "siteId": null, "from": null, "to": null },
  "totals": {
    "projects": 0,
    "sites": 0,
    "contractors": 0,
    "contractorPersonnel": 0,
    "attachments": 0,
    "incidents": 0,
    "nearMisses": 0
  },
  "incidents": {
    "total": 0,
    "nearMisses": 0,
    "byStatus": { "REPORTED": 0, "TRIAGED": 0, "CLOSED": 0 },
    "byCategory": [],
    "unclassified": 0,
    "trend": []
  },
  "lastUpdated": "2026-01-01T00:00:00.000Z"
}
```

`/api/hse/audit-log` accepts `entityType`, `entityId`, `action` and `limit`
(1–100, default 50). Audit documents are append-only and expose whitelisted
snapshots only.

## Database indexes

Declared indexes cover authentication lookup, employee directory filtering
and sorting, site assignment lookups, unique codes/registration numbers,
project and site relationships, contractor personnel uniqueness, attachment
access patterns, incident site/date listing, and audit-log entity/action
queries. Run `syncIndexes()` in a controlled deployment window.

## Audit transactions and replication

Every audited mutation runs its domain write and audit insert inside a
MongoDB transaction (`runAuditedMutation`). If the audit insert fails, the
transaction aborts and the mutation is rolled back. This requires a
**replica set**; a standalone `mongod` is not supported. MongoDB Atlas
clusters satisfy this requirement.

## Production checklist

- Replica-set MongoDB with authentication and TLS.
- Persistent private `ATTACHMENT_STORAGE_DIR`, backed up alongside MongoDB.
- `WEB_ORIGIN` set to the exact web origin.
- DigitAuth credentials and webhook secret supplied from a secret manager.
- HTTPS reverse proxy with a body limit of at least 10 MB and no request-body
  rewriting on the webhook route.
- Index synchronization, monitoring for failed webhook events and audit
  write errors.

## Known limitations

- Attachment bytes are stored on local disk only; no object storage or
  malware scanning.
- DOC/XLS and DOCX/XLSX validation is family-level, not deep content
  inspection.
- Dashboard trends are daily UTC buckets.
- Rate limiting, WAF and HSTS are deployment-edge concerns.
- Inspections, training, CAPA, permits and environmental records are future
  modules.
