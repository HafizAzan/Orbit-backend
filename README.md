# Orbit Backend

The API server for **Orbit** — a multi-tenant SaaS product for projects, tasks, teams, billing, AI helpers, and platform administration.

This is a **NestJS + TypeScript** application. It owns business rules, auth, PostgreSQL data, Stripe billing, email, optional Redis queues, Socket.IO realtime, and file uploads. The React frontend talks to it over REST (`/api/v1`) and the `/realtime` Socket.IO namespace.

| | |
|---|---|
| **Local API** | `http://localhost:5000/api/v1` |
| **Health** | `GET /api/v1/health` |
| **Uploads** | `/api/v1/uploads/...` |
| **Realtime** | Socket.IO namespace `/realtime` |
| **Database** | PostgreSQL (commonly Neon) |
| **Package manager** | npm |
| **Node** | 20+ (LTS recommended) |

---

## Table of contents

1. [What is this?](#what-is-this)
2. [Features](#features)
3. [Tech stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Quick start](#quick-start)
6. [Environment variables](#environment-variables)
7. [npm scripts](#npm-scripts)
8. [Project structure](#project-structure)
9. [How requests flow](#how-requests-flow)
10. [API surface (route groups)](#api-surface-route-groups)
11. [Auth, roles & guards](#auth-roles--guards)
12. [Feature modules](#feature-modules)
13. [Uploads, email, queues & realtime](#uploads-email-queues--realtime)
14. [Adding a new backend feature](#adding-a-new-backend-feature)
15. [Seeding & health](#seeding--health)
16. [Troubleshooting](#troubleshooting)
17. [Recommended local run order](#recommended-local-run-order)
18. [Related docs](#related-docs)

---

## What is this?

Orbit Backend is the server that powers:

| Area | What the backend does |
|------|------------------------|
| **Auth & identity** | Register/OTP, login, JWT, OAuth, 2FA, invites, profile, avatar |
| **Workspace** | Orgs, teams, projects, tasks, boards, calendar, activity, notifications |
| **Billing** | Stripe catalog, checkout, portal, invoices, webhooks |
| **Platform admin** | Users, orgs, subscriptions, settings, leads, activity review |
| **AI** | Workspace + platform AI helpers via Cursor API |
| **Integrations** | GitHub OAuth + webhooks, SMTP email, optional Redis/BullMQ |

If the **frontend** is the product UI, this **backend** is the source of truth for data and permissions.

---

## Features

### Authentication & security
- Email/password registration with OTP verification
- Login with access + refresh JWT
- Remember-me vs short session TTLs
- Google & GitHub OAuth
- Accept invite flow
- Forgot / reset password
- Personal TOTP 2FA (setup / enable / disable / challenge)
- Profile update, avatar upload, email change, password change, UI theme
- Unlink OAuth providers
- Global rate limiting (Throttler)
- Helmet + CORS + validation pipe (whitelist / forbid unknown)

### Workspace domain
- Organizations & member roles (owner, admin, manager, member)
- Team invites, role/status changes, presence
- Projects (CRUD, members via `memberIds`, comments, themes, GitHub link)
- Tasks, attachments, kanban/boards, dashboard metrics, reports
- Calendar events
- Activity logs
- In-app notifications + realtime events

### Billing
- Plan catalog
- Stripe Checkout / confirm
- Change / cancel plan
- Customer portal
- Invoices & refunds (window configurable)
- Stripe webhooks (`rawBody` enabled for signature verify)

### Platform admin
- Dashboard & system health
- Manage organizations, users, subscriptions
- Platform settings (general, branding, email, billing labels)
- Contact leads inbox
- Activity review / moderation helpers
- Platform AI endpoints

### AI & jobs
- Ask-workspace / ask-platform and related helpers
- Optional BullMQ workers for email / AI / digests
- Scheduled jobs module when queues are configured

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | NestJS 11 |
| Language | TypeScript |
| Database | PostgreSQL |
| ORM | TypeORM |
| Auth | Passport JWT + Argon2 + otplib (2FA) |
| Billing | Stripe |
| Email | Nodemailer (SMTP) |
| Queues | BullMQ + Redis (optional via `QUEUE_ENABLED`) |
| Realtime | Socket.IO |
| AI | Cursor SDK / API |
| Validation | class-validator + class-transformer + Joi (env) |
| Observability | Optional Sentry |
| Security | Helmet, Throttler |

---

## Prerequisites

1. **Node.js** 20+ and **npm**
2. **PostgreSQL** access (local or Neon cloud)
3. SMTP credentials (OTP, invites, password reset emails)
4. Stripe test keys (billing)
5. Cursor API key (AI routes)
6. Optional:
   - **Docker** + **Redis** if you set `QUEUE_ENABLED=true`
   - Google / GitHub OAuth app credentials

```bash
node -v
npm -v
```

---

## Quick start

```bash
# From repo root
cd backend

# Install dependencies
npm install

# Create env file
# Windows PowerShell:
Copy-Item .env.example .env.local
# macOS / Linux:
cp .env.example .env.local

# Edit .env.local — set DB_*, JWT_*, SMTP_*, Stripe, Cursor, CORS, FRONTEND_URL
# Prefer PORT=5000 so the frontend default (VITE_API_URL) matches

# Optional Redis (only if QUEUE_ENABLED=true)
docker run -d --name flow-sync-redis -p 6379:6379 redis:7-alpine
# or: docker start flow-sync-redis

# Start API in watch mode
npm run dev
```

Confirm:

```bash
curl http://localhost:5000/api/v1/health
```

First-time platform admin:

```bash
npm run seed:super-admin
```

Uses `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from env.

> Nest loads env from `.env.local` then `.env` (see `ConfigModule` in `app.module.ts`).

---

## Environment variables

Full template: [`.env.example`](./.env.example). Env is validated with Joi (`src/config/env.validation.ts`) — the app **will not boot** if required vars are missing/invalid.

### Core

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | Yes (default 3000) | HTTP port — use **`5000`** for local FE match |
| `NODE_ENV` | No | `development` / `production` / … |
| `CORS_ORIGIN` | Yes | Comma-separated frontend origins |
| `FRONTEND_URL` | Yes | Links in emails + OAuth redirects |

### Database

| Variable | Purpose |
|----------|---------|
| `DB_HOST` | Postgres / Neon hostname |
| `DB_PORT` | Usually `5432` |
| `DB_USERNAME` | DB user |
| `DB_PASSWORD` | DB password |
| `DB_NAME` | Database name |
| `DB_SSL` | `true` / `false` (Neon typically `true`) |

### Auth (JWT)

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Access token secret (**min 32 chars**) |
| `JWT_REFRESH_SECRET` | Refresh token secret (**min 32 chars**) |
| `JWT_EXPIRES_IN` | Access TTL (default `30m`) |
| `JWT_SESSION_EXPIRES_IN` | Session access TTL |
| `JWT_REMEMBER_EXPIRES_IN` | Remember-me access TTL (default `30d`) |
| `JWT_REFRESH_SESSION_EXPIRES_IN` | Refresh session TTL |
| `JWT_REFRESH_REMEMBER_EXPIRES_IN` | Refresh remember TTL |

### Email (SMTP)

| Variable | Purpose |
|----------|---------|
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | e.g. `587` |
| `SMTP_USER` | SMTP login email |
| `SMTP_PASSWORD` | App password / SMTP secret |
| `EMAIL_FROM` | From header, e..g. `Orbit <you@domain.com>` |

### Billing & AI

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `STRIPE_REFUND_WINDOW_DAYS` | Refund window (default `7`) |
| `CURSOR_API_KEY` | Cursor AI API key |
| `CURSOR_MODEL` | Model id (default `composer-2.5`) |

### Queues (optional)

| Variable | Purpose |
|----------|---------|
| `QUEUE_ENABLED` | `true` / `false` (default `false`) |
| `REDIS_HOST` | Redis host (default `127.0.0.1`) |
| `REDIS_PORT` | Redis port (default `6379`) |
| `REDIS_PASSWORD` | Optional Redis password |

When `QUEUE_ENABLED=false`, Redis is **not** required and queue-backed work runs inline where implemented.

### OAuth (optional)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Google login |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_CALLBACK_URL` | GitHub login |
| `GITHUB_TOKEN` | Optional GitHub API token for status/repo helpers |

Example callback URLs:

```text
http://localhost:5000/api/v1/auth/google/callback
http://localhost:5000/api/v1/auth/github/callback
```

### Platform seed & extras

| Variable | Purpose |
|----------|---------|
| `SUPER_ADMIN_EMAIL` | Seeded platform admin email |
| `SUPER_ADMIN_PASSWORD` | Seeded platform admin password |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | Global rate limit window |
| `SENTRY_DSN` | Optional error tracking |
| `LEADS_INBOX_EMAIL` | Optional sales inbox notify |

### Recommended local defaults

```env
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
FRONTEND_URL=http://localhost:5173
QUEUE_ENABLED=false
```

---

## npm scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | Nest watch mode (daily development) |
| `npm run start` | Nest start once |
| `npm run start:debug` | Debug + watch |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run start:prod` | Run `node dist/main` |
| `npm run seed:super-admin` | Create/update platform super admin |
| `npm run lint` | ESLint with auto-fix |
| `npm run format` | Prettier |
| `npm test` | Unit tests (Jest) |
| `npm run test:e2e` | E2E tests |
| `npm run test:cov` | Coverage |

---

## Project structure

```
backend/
├── src/
│   ├── main.ts                 # Bootstrap: CORS, Helmet, ValidationPipe, prefix, uploads, Socket adapter
│   ├── load-env.ts             # Early env load
│   ├── app.module.ts           # Wires all feature modules + TypeORM + throttler
│   ├── app.controller.ts       # GET /health
│   ├── app.service.ts          # Health checks (DB, Stripe, Redis when enabled)
│   │
│   ├── config/                 # Database config + Joi env validation
│   ├── database/               # Seeds (super admin runner)
│   ├── entities/               # TypeORM entities (tables)
│   ├── enum/                   # Shared enums
│   ├── dto/                    # Shared / cross-cutting DTOs
│   ├── common/                 # Shared helpers, mappers, uploads, Sentry, moderation
│   │
│   ├── auth/                   # Login, register, JWT, OAuth, 2FA, profile, guards
│   ├── organizations/          # Org settings, workspace org APIs
│   ├── teams/                  # Invites, members, presence
│   ├── projects/               # Projects, comments, themes, GitHub link
│   ├── tasks/                  # Tasks, boards, attachments, reports/dashboard
│   ├── calendar/               # Calendar events
│   ├── activity/               # Activity events / logs
│   ├── notifications/          # In-app notifications + gateway glue
│   ├── billing/                # Stripe checkout, portal, webhooks, invoices
│   ├── subscriptions/          # Admin subscription management
│   ├── admin/                  # Platform admin dashboards, users, settings
│   ├── ai/                     # Workspace + platform AI controllers
│   ├── leads/                  # Public contact form + admin inbox
│   ├── github/                 # GitHub webhooks / integrations
│   ├── email/                  # Nodemailer sending
│   ├── queues/                 # BullMQ registration
│   ├── jobs/                   # Scheduled digests / reports
│   ├── realtime/               # Socket.IO gateway (namespace /realtime)
│   └── integrations/           # Extra integration helpers
│
├── .env.example
├── .env.local                  # Your local secrets (gitignored)
├── package.json
└── backend.md                  # Extra long-form guide (EN + Roman Urdu)
```

### Important entities (`src/entities/`)

Examples of domain tables:

`user`, `organization`, `subscription`, `project`, `project-member`, `project-comment`, `project-user-theme`, `task`, `task-attachment`, `calendar-event`, `activity-event`, `notification`, `contact-lead`, `platform-settings`, `password-reset`, `pending-registration`, `pending-email-change`, `ai-credit-usage`, …

---

## How requests flow

```
HTTP / Socket client
    → Nest global prefix `/api/v1`
        → Guards (JWT, org member, subscription active, platform admin, …)
            → Controller (route + DTO validation)
                → Service (business rules)
                    → TypeORM repositories / entities (PostgreSQL)
                    → Stripe / SMTP / Cursor / Redis as needed
                ← response DTO / mapped public object
```

**Keep controllers thin.** Put rules in services.

Startup extras from `main.ts`:

- Global prefix: `api/v1`
- Static uploads under `/api/v1/uploads/`
- `rawBody: true` for Stripe webhooks
- Socket.IO via `IoAdapter`
- Shutdown hooks enabled

---

## API surface (route groups)

Base URL (local): `http://localhost:5000/api/v1`  
Auth header: `Authorization: Bearer <accessToken>`

| Group | Examples | Who |
|-------|----------|-----|
| **Health** | `GET /health` | Anyone |
| **Auth** | `/auth/login`, `/auth/me`, `/auth/refresh`, OAuth, 2FA, invites | Everyone / user |
| **Organizations** | Workspace org settings / members | Org members |
| **Teams** | Invites, roster, roles | Org members |
| **Projects** | CRUD, comments, themes, GitHub | Org members (+ subscription) |
| **Tasks** | CRUD, boards, attachments, reports | Org members (+ subscription) |
| **Calendar** | Events CRUD | Org members |
| **Activity** | Activity logs | Org members |
| **Notifications** | List / mark read | Authenticated users |
| **Billing** | Catalog, checkout, portal, invoices, webhook | Owner/admin (+ public catalog) |
| **Admin** | `/admin/users`, `/admin/settings`, dashboard | Platform admin |
| **Subscriptions** | Admin subscription APIs | Platform admin |
| **Leads** | Public `POST` contact + admin inbox | Guests / platform admin |
| **AI** | `/ai/ask-workspace`, platform AI | Workspace / platform |
| **GitHub** | Webhooks / status helpers | Integration |

### Auth endpoints (high level)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/register/send-otp` | Start registration |
| POST | `/auth/register/verify` | Complete registration |
| POST | `/auth/login` | Login |
| POST | `/auth/refresh` | Refresh tokens |
| GET | `/auth/me` | Current user |
| PATCH | `/auth/me/profile` | Update name/profile |
| POST | `/auth/me/avatar` | Upload avatar |
| POST | `/auth/forgot-password` | Request reset |
| POST | `/auth/reset-password` | Apply reset |
| GET/POST | `/auth/invites/*` | Validate / accept invite |
| GET/POST | `/auth/2fa/*` | 2FA status/setup/enable/disable/verify |
| GET | `/auth/google`, `/auth/github` | Start OAuth |
| GET | `/auth/*/callback` | OAuth return |

Use Postman / Thunder Client / curl against these after the server is healthy.

---

## Auth, roles & guards

### Roles

| Role | Typical powers |
|------|----------------|
| **Platform admin** (`isPlatformAdmin`) | Full `/admin/*` console |
| **Owner** | Org control, billing, settings; does **not** create/edit tasks by product design |
| **Admin** | Org management + delivery |
| **Manager** | Projects / tasks / boards |
| **Member** | My tasks, boards, limited project access |

### Typical auth journey

1. Register → OTP email → verify  
2. Login → access + refresh tokens  
3. Optional 2FA challenge  
4. Client sends Bearer access token  
5. On 401, client calls `/auth/refresh` then retries  

### Important guards

| Guard | Meaning |
|-------|---------|
| `JwtAuthGuard` | Must be logged in |
| `OrganizationMemberGuard` | Must belong to an organization |
| `OrganizationSubscriptionActiveGuard` | Org must have an active subscription (most workspace routes) |
| `PlatformAdminGuard` | Platform admin only |

Billing/plan-selection routes intentionally work even when a subscription is inactive, so owners can checkout.

---

## Feature modules

| Module | Responsibility |
|--------|----------------|
| `auth` | Identity, sessions, OAuth, 2FA, profile, org membership guards |
| `organizations` | Org settings & workspace org APIs |
| `teams` | Invites, roles, presence |
| `projects` | Projects, comments, themes, GitHub link |
| `tasks` | Tasks, boards, attachments, dashboard/reports |
| `calendar` | Calendar events |
| `activity` | Activity log writes / reads |
| `notifications` | In-app notifications |
| `billing` | Stripe lifecycle + webhooks |
| `subscriptions` | Admin subscription management |
| `admin` | Platform console APIs |
| `ai` | Workspace + platform AI |
| `leads` | Contact form + admin leads |
| `github` | Webhooks / repo helpers |
| `email` | Outbound mail |
| `queues` / `jobs` | Async + scheduled work |
| `realtime` | Socket.IO gateway |
| `common` | Shared utilities & asset helpers |

---

## Uploads, email, queues & realtime

### Uploads
- Files land under the task uploads root (avatars, branding, attachments)
- Served statically at **`/api/v1/uploads/...`**
- Avatar/branding URLs stored like `/api/v1/uploads/avatars/<file>`
- Frontend must resolve these with its asset helper (do not double-prefix `/api/v1`)

### Email
- Nodemailer via SMTP env vars
- Used for OTP, password reset, invites, optional lead notifications

### Queues
- `QUEUE_ENABLED=true` → BullMQ uses Redis (`REDIS_HOST` / `REDIS_PORT`)
- `QUEUE_ENABLED=false` → no Redis required; work runs inline where coded
- Health check reports Redis status when queues are enabled

### Realtime
- Namespace: **`/realtime`**
- Authenticated with JWT in the handshake (see frontend socket config)
- Powers presence, live comments, and notification-style events

---

## Adding a new backend feature

1. Create a module folder under `src/` (e.g. `src/notes/`)
2. Add a TypeORM **entity** in `src/entities/` if you need a table
3. Add **DTOs** with `class-validator`
4. Implement **service** business logic
5. Add **controller** routes under `/api/v1/...`
6. Register the module in `app.module.ts`
7. Protect routes with the correct **guards**
8. Test with Postman / curl
9. Update the frontend `api-routes` + `api-services` + hooks if the UI needs it

---

## Seeding & health

### Health

```bash
curl http://localhost:5000/api/v1/health
```

Health currently covers:

- Database connectivity
- Stripe key presence
- Queue / Redis config when `QUEUE_ENABLED=true`

### Super admin seed

```bash
npm run seed:super-admin
```

Creates or updates the platform admin from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| App won't boot (env validation) | Missing/invalid required env | Compare `.env.local` with `.env.example` |
| `ENOTFOUND` on Neon host | DNS / wrong `DB_HOST` / offline | Verify Neon hostname & network; restart |
| `ECONNREFUSED 127.0.0.1:6379` | Queues on, Redis down | Start Redis **or** set `QUEUE_ENABLED=false` |
| CORS errors in browser | FE origin not allowed | Add origin to `CORS_ORIGIN` |
| 401 everywhere | Bad/expired token | Login again; verify JWT secrets & refresh flow |
| OAuth fails | Callback / client mismatch | Align Google/GitHub console with `*_CALLBACK_URL` + `FRONTEND_URL` |
| Emails not arriving | SMTP misconfigured | Check `SMTP_*`, app passwords, spam folder |
| Stripe webhook fails | Wrong secret / no raw body | Use `STRIPE_WEBHOOK_SECRET`; app already enables `rawBody` |
| Port already in use | Old process on `PORT` | Kill process on that port and restart |

Kill port **5000** (Windows PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 5000 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

---

## Recommended local run order

1. Ensure Postgres/Neon is reachable  
2. Start Redis **only if** `QUEUE_ENABLED=true`  
3. Start backend: `cd backend && npm run dev`  
4. Confirm `GET /api/v1/health` is OK  
5. Seed admin if needed: `npm run seed:super-admin`  
6. Start frontend: `cd frontend && npm run dev`  
7. Point FE at `VITE_API_URL=http://localhost:5000/api/v1`

---

## Related docs

| Doc | Location | Contents |
|-----|----------|----------|
| This README | `backend/README.md` | Overview + day-1 setup (you are here) |
| Deep backend guide | [`backend.md`](./backend.md) | Longer walkthrough (English + Roman Urdu) |
| Env template | [`.env.example`](./.env.example) | All known variables |
| Frontend | `../frontend/README.md` + `../frontend/frontend.md` | React SPA |
| Manual test cases | `../test-cases/` | Auth, billing, permissions, etc. |

---

## License / notes

This package is private (`"private": true`, `UNLICENSED` in `package.json`). Do not commit `.env.local` or real secrets. Rotate JWT, Stripe, SMTP, and OAuth credentials if they leak.

---

**Happy shipping.** Get `/api/v1/health` green, seed the admin, then hit the API from the Orbit frontend or your HTTP client.
