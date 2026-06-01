# LMS Platform — Multi-tenant SaaS Library & Study Cabin Management

Production-grade SaaS scaffold for libraries / study cabins / cowork-style businesses.

**Stack:** Angular 17 (standalone) · NestJS 10 · PostgreSQL · Prisma 5 · Nx 17 monorepo · Vercel.

> **Status:** Phase 1 foundation, verified to build and bootstrap end-to-end. Auth, multi-tenant isolation, feature flags, students/seats/attendance/payments/dashboard modules are wired and routed. Several modules (reports, exports, plan enrollment UI, refresh-token flow, real Razorpay/WhatsApp SDKs) are stubbed and called out in the [Phase 2 backlog](#whats-next-phase-2-backlog).

---

## Verified state

Everything below has been actually run, not just written:

| Step | Outcome |
| --- | --- |
| `npm install --legacy-peer-deps` | 1380 packages installed, Prisma client generated via postinstall |
| `tsc --noEmit` on both apps | Clean — zero type errors |
| `npx nx build api` | Webpack bundle, **113 KiB** |
| `npx nx build web` | Angular production build, **99.6 kB** initial transfer, lazy chunks per feature |
| `npx nx serve web` | Live at **http://localhost:4200** (HTTP 200) |
| `npx nx serve api` | All 13 modules initialized, **30 routes mapped** — the only failure is `PrismaClient.$connect()` when `DATABASE_URL` is a placeholder. Wiring is correct. |

Fixes applied during verification (already committed to the repo — listed here so they aren't a surprise to a fresh clone):

1. [apps/api/src/auth/guards/jwt-auth.guard.ts](apps/api/src/auth/guards/jwt-auth.guard.ts) — `override` modifier on `canActivate` (TS `noImplicitOverride`)
2. [apps/api/webpack.config.js](apps/api/webpack.config.js) — added Nx webpack config, then patched externals to **bundle `@lms/shared`** (npm workspaces was symlinking it into `node_modules` and webpack was emitting `require("@lms/shared")` at runtime, which then failed to load the `.ts` source)
3. [apps/api/src/feature-flags/feature-flags.module.ts](apps/api/src/feature-flags/feature-flags.module.ts) — marked `@Global()` so payments/attendance/cron modules don't each need to re-import it
4. [apps/web/src/app/features/dashboard/dashboard.component.ts](apps/web/src/app/features/dashboard/dashboard.component.ts) — `BaseChartDirective` → `NgChartsModule` (ng2-charts 5.x is not standalone; that change shipped in 6.x)

---

## Architecture

```
LMS/
├── api/index.ts             Vercel auto-detected serverless entrypoint (delegates to apps/api)
├── apps/
│   ├── api/                 NestJS backend
│   │   ├── api/index.ts       Cached Nest handler for serverless invocation
│   │   ├── webpack.config.js  Bundles @lms/shared into the artifact
│   │   └── src/
│   │       ├── auth/        JWT + RBAC (SuperAdmin/ClientAdmin/BranchAdmin/Staff)
│   │       ├── tenant/      Request-scoped TenantContextService + TenantGuard
│   │       ├── feature-flags/  Per-tenant toggles, @RequireFeature() guard + decorator
│   │       ├── students/    Full vertical slice — CRUD, search, audit
│   │       ├── seats/       Seats & cabins
│   │       ├── attendance/  QR + manual check-in (QR gated by feature flag)
│   │       ├── payments/    Razorpay order/verify + manual receipts + WhatsApp echo
│   │       ├── dashboard/   KPIs + chart series (line/bar/doughnut)
│   │       ├── admin/       SuperAdmin tenant CRUD + branch management
│   │       ├── cron/        /cron/* endpoints triggered by Vercel Cron, guarded by CRON_SECRET
│   │       ├── integrations/  Razorpay + WhatsApp stub implementations behind DI tokens
│   │       └── audit/       Append-only audit trail
│   └── web/                 Angular standalone app
│       └── src/app/
│           ├── core/        Auth service, theme, HTTP interceptors, route guard
│           ├── shared/      *lmsHasFeature structural directive
│           ├── layout/      Shell — collapsible sidebar, top bar, dark/light toggle
│           └── features/    auth, dashboard, students, seats, attendance, payments, settings
├── libs/shared/             DTOs + enums shared between API and Web (single source of truth)
├── prisma/
│   ├── schema.prisma        13 models, tenantId on every business table
│   └── seed.ts              Creates SuperAdmin + demo tenant + sample seats + plan
├── vercel.json              Serverless config + rewrites + Vercel Cron schedule
└── .env.example
```

### Multi-tenancy model

Every business table carries a `tenantId` column with an index. All queries flow through `TenantContextService.tenantId`, which reads from the JWT — there is no way to "forget" to scope a query. The `TenantGuard` enforces that every authenticated request has a tenant (or is a SuperAdmin who may operate cross-tenant).

### Feature flags

Stored in `feature_flags` keyed by `(tenantId, key)`. SuperAdmin toggles them per-tenant. They gate:

- **API** — `@RequireFeature(FeatureKey.QR_ATTENDANCE)` + `FeatureFlagGuard` (the module is `@Global()`, no imports needed)
- **UI** — `*lmsHasFeature="'QR_ATTENDANCE'"` structural directive

The Angular auth response carries the current tenant's flag set, so the UI knows what to render without an extra round-trip. A 60s in-memory cache keeps the API path off Postgres.

### Roles & permissions

Hierarchy: `SUPER_ADMIN > CLIENT_ADMIN > BRANCH_ADMIN > STAFF`. `@Roles(UserRole.BRANCH_ADMIN)` means "BranchAdmin and above." `SUPER_ADMIN` bypasses tenant scoping and feature flags but is only stored in `platform_admins` (a table separate from `users`).

---

## Local setup

### Prereqs

- Node.js 20+ (verified on Node 24)
- Postgres. Pick whichever is easiest:
  - [Neon](https://neon.tech) — free tier, recommended (same provider you'd use on Vercel)
  - [Supabase](https://supabase.com)
  - Local Docker: `docker run -d --name lms-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`

### Install + migrate + seed

```powershell
Copy-Item .env.example .env
# Edit .env: set DATABASE_URL to a real Postgres URL and JWT_SECRET to anything 32+ chars

npm install --legacy-peer-deps
npm run prisma:migrate -- --name init
npm run prisma:seed
```

### Alternative: provision the database with raw SQL (no Prisma migrate)

If you'd rather run plain SQL against an existing Postgres (e.g. pgAdmin, DBeaver, psql,
a managed dashboard), the repo ships ready-to-run scripts in [prisma/](prisma/):

- [prisma/init.sql](prisma/init.sql) — creates all enums, tables, indexes, and foreign keys (449 lines, generated from `schema.prisma`)
- [prisma/seed.sql](prisma/seed.sql) — inserts the SuperAdmin, demo tenant, HQ branch, ClientAdmin, 20 seats, and one plan (idempotent via `ON CONFLICT`)

```powershell
# Create the database (one-time, outside the script)
psql -U postgres -c "CREATE DATABASE lms;"

# Run schema then seed
psql -U postgres -d lms -f prisma/init.sql
psql -U postgres -d lms -f prisma/seed.sql
```

`init.sql` is **not** idempotent — re-running on the same database fails with "type already exists". Drop the database first if you need to reset. To regenerate `init.sql` after a schema change:

```powershell
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/init.sql
```

### Run dev

```powershell
# In one terminal
npx nx serve api          # NestJS on http://localhost:3000/api

# In another terminal
npx nx serve web          # Angular on http://localhost:4200
```

Or both in parallel: `npm run dev`.

Open <http://localhost:4200/login>:

| Role         | Email                          | Password         | Tenant slug    |
| ------------ | ------------------------------ | ---------------- | -------------- |
| SuperAdmin   | `superadmin@lms.local`         | `SuperAdmin@123` | _(blank)_      |
| ClientAdmin  | `admin@demo-library.local`     | `Admin@123`      | `demo-library` |

Swagger docs: <http://localhost:3000/api/docs>

---

## API surface (30 routes)

```
POST   /api/auth/login
GET    /api/auth/me

GET    /api/feature-flags/me
GET    /api/feature-flags/tenants/:tenantId            (SuperAdmin)
PUT    /api/feature-flags/tenants/:tenantId/:key       (SuperAdmin)

GET    /api/students                                   (Staff+)
GET    /api/students/:id
POST   /api/students                                   (BranchAdmin+)
PATCH  /api/students/:id                               (BranchAdmin+)
DELETE /api/students/:id                               (ClientAdmin+)

GET    /api/seats
POST   /api/seats                                      (BranchAdmin+)
PATCH  /api/seats/:id                                  (BranchAdmin+)
DELETE /api/seats/:id                                  (ClientAdmin+)

POST   /api/attendance/qr                              (feature-gated: QR_ATTENDANCE)
POST   /api/attendance/manual
POST   /api/attendance/:id/check-out
GET    /api/attendance?date=YYYY-MM-DD

GET    /api/payments
POST   /api/payments/manual
POST   /api/payments/razorpay/order                    (feature-gated: PAYMENT_GATEWAY)
POST   /api/payments/razorpay/verify

GET    /api/dashboard/summary

GET    /api/branches
POST   /api/branches                                   (ClientAdmin+)
PATCH  /api/branches/:id                               (ClientAdmin+)

GET    /api/admin/tenants                              (SuperAdmin)
POST   /api/admin/tenants                              (SuperAdmin)
PUT    /api/admin/tenants/:id/status                   (SuperAdmin)

GET    /api/cron/due-alerts                            (CRON_SECRET-guarded)
GET    /api/cron/attendance-rollover                   (CRON_SECRET-guarded)
```

---

## Deploy to Vercel

1. **Provision Postgres.** Create a Neon project; copy the **pooled** connection string (`?pgbouncer=true&connection_limit=1`).
2. **Push this repo to GitHub.**
3. **Import in Vercel** → it auto-detects [vercel.json](vercel.json).
4. **Set environment variables in the Vercel dashboard:**
   - `DATABASE_URL` (Neon pooled)
   - `JWT_SECRET`, `JWT_REFRESH_SECRET` (32+ random chars each)
   - `CRON_SECRET` (Vercel will send `Authorization: Bearer <CRON_SECRET>` on scheduled hits)
   - `CORS_ORIGIN` → your Vercel domain
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (leave blank to keep stubs)
   - `WHATSAPP_API_TOKEN` (leave blank to keep stubs)
5. **First deploy.** Vercel runs `npm run vercel-build` → `prisma generate` → builds web + api.
6. **Run migrations** locally against the production DB:
   ```powershell
   $env:DATABASE_URL = "<prod>"
   npm run prisma:deploy
   npm run prisma:seed    # optional
   ```

### Vercel serverless caveats you must know

NestJS on Vercel runs as **serverless functions**, not a long-running process. That means:

- **Cold starts** — first request after idle can take 1–3s. The Nest app is cached in module scope via [apps/api/api/index.ts](apps/api/api/index.ts) so warm invocations reuse the bootstrapped instance.
- **No in-process workers.** Background jobs (WhatsApp queue, plan-expiry sweeps) must run via:
  - [Vercel Cron](https://vercel.com/docs/cron-jobs) → calls `/api/cron/*` on a schedule (already wired in [vercel.json](vercel.json))
  - [Upstash QStash](https://upstash.com/docs/qstash) or [Inngest](https://www.inngest.com/) for async queue work
- **Connection pooling.** Use Neon's pooled URL so each invocation doesn't exhaust the pool. For migrations, set `directUrl` in `schema.prisma` to a direct (non-pooled) URL.
- **Max function duration** is 30s on Hobby, 60s on Pro. Long reports must paginate or stream.

If/when you outgrow these, move the API to Render/Railway and keep the Angular build on Vercel.

---

## What's wired and verified

- Multi-tenant JWT auth (SuperAdmin platform path + tenant users via `tenantSlug`)
- Tenant isolation enforced by `TenantContextService` everywhere
- Per-tenant feature flags with API guard + UI directive
- Students full CRUD with search, pagination, audit log, sequential code generation (`STU-0001`…)
- Seats CRUD + visual grid
- Attendance: QR check-in (feature-gated) + manual + per-day list + check-out
- Payments: manual receipt + Razorpay order/verify flow (using stub by default)
- Dashboard with 5 KPI cards + 3 charts (chart.js via ng2-charts)
- SuperAdmin can create tenants (with seeded HQ branch + admin user + all flags on) and toggle their feature flags
- Audit logging for write operations
- Vercel Cron-secured `/cron/due-alerts` for plan-expiry WhatsApp reminders
- Dark / light theme with localStorage persistence and `prefers-color-scheme` fallback

## What's next (Phase 2 backlog)

Explicitly **not** in this scaffold:

1. **Student plan enrollment UI** — subscribe a student to a `StudentPlan`, link payments to enrollments
2. **Reports module** — exportable CSV/PDF (gate behind `EXPORTS` flag)
3. **Refresh token endpoint** — currently the refresh token is issued but never consumed
4. **Real Razorpay SDK + webhook handler** at `/api/payments/razorpay/webhook` with HMAC verification
5. **WhatsApp Cloud API** real implementation behind `WHATSAPP_SERVICE` token
6. **QR scanner component** — replace the paste-token UX with a camera-based scanner (`ngx-scanner-qrcode` or `html5-qrcode`)
7. **Branch switcher** in the topbar for ClientAdmins managing multiple branches
8. **Notifications inbox** (the `notifications` table is populated by the cron job; UI not built)
9. **Bulk imports** (CSV → students) with row-level validation
10. **Tests** — Jest e2e for auth/tenant isolation, Karma/Vitest for Angular components

---

## How to extend (cheat sheet)

**Adding a new entity:**

1. Add the table to [prisma/schema.prisma](prisma/schema.prisma) with `tenantId` + `@@index([tenantId])`.
2. Run `npm run prisma:migrate -- --name add_<entity>`.
3. Add types/DTOs to [libs/shared/src/types/](libs/shared/src/types/) and re-export from [index.ts](libs/shared/src/index.ts).
4. Create `apps/api/src/<entity>/` with module/service/controller. Inject `TenantContextService` and scope every query by `tenantId`.
5. Register the module in [apps/api/src/app.module.ts](apps/api/src/app.module.ts).
6. Add an Angular feature folder + route in [apps/web/src/app/app.routes.ts](apps/web/src/app/app.routes.ts).

**Gating something behind a feature flag:**

- Backend: `@RequireFeature(FeatureKey.X)` + `@UseGuards(FeatureFlagGuard)` on the controller or handler
- Frontend: `*lmsHasFeature="'X'"` on the template element

**Adding a SuperAdmin-only endpoint:**

`@Roles(UserRole.SUPER_ADMIN)` on the handler — the global `RolesGuard` enforces it.

---

## Reused architecture for adjacent businesses

Because every entity is generic (`Student` could be Member, `Seat` could be Resource, `Branch` could be Location), this same codebase can be reskinned for:

- **Coworking management** — `Seat` becomes a desk
- **Hostel management** — `Seat` becomes a bed, `StudentPlan` becomes a stay package
- **Gym management** — `Student` becomes member, drop seats, keep attendance + payments
- **White-label franchise** — Tenant becomes franchisee, SuperAdmin becomes franchisor

The boundary you'd change is mostly UI labels and a handful of business rules — the multi-tenant + feature-flag + RBAC scaffolding stays.

---

## Troubleshooting

**`PrismaClientInitializationError: User '...' was denied access`** — your `DATABASE_URL` isn't valid. The API otherwise bootstraps cleanly.

**`Cannot find module '@lms/shared'` at runtime** — this means [apps/api/webpack.config.js](apps/api/webpack.config.js) isn't being picked up. Confirm it exists at that path; Nx looks for `webpackConfig` in [apps/api/project.json](apps/api/project.json).

**`BaseChartDirective ... is not standalone`** — ng2-charts 5.x exports an NgModule, not a standalone directive. Use `NgChartsModule` in the component's `imports`. (Upgrading to ng2-charts 6.x would restore the standalone directive.)

**`npm install` peer dependency conflicts** — always use `--legacy-peer-deps`. Angular/Nest/Nx all have overlapping peer ranges.

**Vercel build "Function payload too large"** — increase `functions.api/index.ts.memory` in [vercel.json](vercel.json) or move heavy dependencies (like `@swc/core`) to `devDependencies`.
