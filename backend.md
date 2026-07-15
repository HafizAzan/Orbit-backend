# Orbit Backend Guide

This document has **two versions**:

1. [English](#english-version)
2. [Roman English (Roman Urdu)](#roman-english-version)

---

# English Version

## 1. What is the Orbit backend?

Orbit backend is a **NestJS + TypeScript** API that powers the Orbit SaaS product (project/task workspace, billing, admin console, AI helpers).

- Framework: **NestJS**
- Language: **TypeScript**
- Database: **PostgreSQL** (commonly Neon)
- ORM: **TypeORM**
- Auth: **JWT** (access + refresh) + optional Google/GitHub OAuth + 2FA
- Billing: **Stripe**
- Queues (optional): **BullMQ + Redis**
- Realtime: **Socket.IO** (`/realtime`)
- AI: **Cursor API**
- Global API prefix: **`/api/v1`**
- Default local port: **`5000`** (set via `PORT` in `.env.local`)

Folder: `orbit/backend`

---

## 2. Prerequisites (install first)

Before running the API, install:

1. **Node.js** (LTS recommended, e.g. 20+)
2. **npm** (comes with Node)
3. **PostgreSQL** access (local DB or Neon account)
4. Optional but useful:
   - **Docker** (to run Redis for queues)
   - **Redis** if you set `QUEUE_ENABLED=true`

Check versions:

```bash
node -v
npm -v
```

---

## 3. Step-by-step setup

### Step 1 — Open backend folder

```bash
cd orbit/backend
```

### Step 2 — Install dependencies

```bash
npm install
```

This installs NestJS, TypeORM, Stripe, BullMQ, Passport/JWT, Socket.IO, etc.

### Step 3 — Create environment file

Copy example env:

```bash
# Windows PowerShell
Copy-Item .env.example .env.local

# macOS / Linux
cp .env.example .env.local
```

Nest loads env from `.env.local` then `.env`.

### Step 4 — Fill required environment variables

Open `.env.local` and set at least:

| Variable | Purpose |
|---|---|
| `PORT` | API port (use `5000` for local FE match) |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` | PostgreSQL / Neon |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Auth tokens (min 32 chars) |
| `SMTP_*`, `EMAIL_FROM` | Emails (OTP, invites, reset) |
| `FRONTEND_URL` | Links in emails + OAuth redirects |
| `CORS_ORIGIN` | Allowed frontend origins (comma-separated) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing |
| `CURSOR_API_KEY` | AI features |

Recommended local values:

```env
PORT=5000
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
FRONTEND_URL=http://localhost:5173
QUEUE_ENABLED=false
```

When Redis is running:

```env
QUEUE_ENABLED=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### Step 5 — Start Redis (only if queues enabled)

```bash
docker start flow-sync-redis
# or create:
docker run -d --name flow-sync-redis -p 6379:6379 redis:7-alpine
```

If queues are off (`QUEUE_ENABLED=false`), Redis is not required.

### Step 6 — Start the API in watch mode

```bash
npm run dev
```

Success looks like:

- Nest compiles with 0 errors
- App listens on your `PORT`
- Health endpoint works: `GET http://localhost:5000/api/v1/health`

### Step 7 — Seed platform super admin (first time)

```bash
npm run seed:super-admin
```

Uses `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from env.

---

## 4. Important npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Nest watch mode (daily development) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run start:prod` | Run compiled production build |
| `npm run seed:super-admin` | Create/update platform admin |
| `npm run lint` | ESLint |
| `npm test` | Unit tests |

---

## 5. Architecture overview (how code is organized)

```
backend/src/
  main.ts              → boots Nest app, CORS, Helmet, ValidationPipe, prefix api/v1
  app.module.ts        → wires all feature modules
  config/              → DB config + Joi env validation
  entities/            → TypeORM entities (tables)
  auth/                → login, register OTP, JWT, OAuth, 2FA, profile
  organizations/       → workspace org settings / members
  teams/               → invites, roles, presence
  projects/            → projects, members sync via memberIds, comments, GitHub link
  tasks/               → tasks, boards, dashboard, reports, attachments
  calendar/            → calendar events
  activity/            → activity logs
  notifications/       → in-app notifications + realtime gateway
  billing/             → Stripe checkout, portal, webhooks, invoices
  subscriptions/       → admin subscription management
  admin/               → platform admin dashboards/settings/users/orgs
  ai/                  → workspace + platform AI endpoints
  leads/               → public contact form + admin leads inbox
  queues/              → BullMQ (email / AI / digest jobs)
  jobs/                → scheduled digests/reports
  github/              → GitHub webhook + project repo status
  email/               → nodemailer sending
  common/              → shared helpers (moderation, mappers, assets)
```

**Mental model**

1. HTTP request hits a **Controller**
2. Controller calls a **Service**
3. Service uses **Repositories/Entities** (DB)
4. Guards decide who can access (JWT, org member, subscription active, platform admin)

---

## 6. API basics

- Base URL (local): `http://localhost:5000/api/v1`
- Auth header: `Authorization: Bearer <accessToken>`
- Health: `GET /api/v1/health`
- Uploads served at: `/api/v1/uploads/...`
- Realtime socket namespace: `/realtime` (JWT in handshake)

### Major route groups

| Group | Example | Who uses it |
|---|---|---|
| Auth | `/auth/login`, `/auth/me` | Everyone |
| Workspace | `/projects`, `/tasks`, `/teams` | Org users |
| Billing | `/billing/checkout`, `/billing/catalog` | Owner/admin (+ public catalog) |
| Admin | `/admin/users`, `/admin/leads` | Platform admin |
| AI | `/ai/ask-workspace`, `/ai/ask-platform` | Workspace / platform |
| Public | `/leads`, `/billing/catalog` | Visitors |

---

## 7. Auth & roles (explained)

### User roles

- **Platform admin** (`isPlatformAdmin` / `super_admin`) → Admin console
- **Owner** → org control + billing/settings (does not create/edit tasks by design)
- **Admin** → org management + delivery
- **Manager** → projects/tasks/boards delivery
- **Member** → my tasks, boards, limited project view

### Typical auth flow

1. Register → OTP email → verify
2. Login → access + refresh tokens
3. Optional 2FA challenge
4. Frontend sends Bearer token on API calls
5. On 401, frontend refreshes via `/auth/refresh`

### Important guards

- `JwtAuthGuard` — must be logged in
- `OrganizationMemberGuard` — must belong to an org
- `OrganizationSubscriptionActiveGuard` — org must have active plan (workspace routes)
- `PlatformAdminGuard` — platform admin only

Billing routes intentionally allow plan selection even when subscription is inactive.

---

## 8. Feature modules (what each area does)

### Auth
Register, login, OAuth, password reset, invites, profile/avatar, email change, 2FA.

### Projects & Tasks
Projects CRUD, squad via `memberIds` on create/update, comments, themes, GitHub repo link, task CRUD, kanban boards, dashboards/reports, attachments.

### Teams & Organizations
Invite members, change roles/status, workspace settings, org-level 2FA, ownership transfer.

### Billing
Stripe catalog, checkout, confirm, change/cancel plan, portal, invoices, refunds, webhook.

### Admin
Dashboard, users, organizations, subscriptions, activity review, settings (general/branding/email/billing), contact leads inbox.

### AI
Work breakdown, drafts, summaries, ask-workspace, ask-platform, org-health, activity describe.

### Queues
If enabled, email/AI/digest jobs go through Redis. If disabled, those paths run inline.

---

## 9. How to add a new backend feature (step-by-step)

1. Create module folder under `src/` (e.g. `src/notes/`)
2. Add entity in `entities/` if you need a table
3. Add DTO with `class-validator`
4. Add service business logic
5. Add controller routes
6. Register module in `app.module.ts`
7. Protect routes with correct guards
8. Test with Postman/Thunder Client against `/api/v1/...`
9. Update frontend API service if UI needs it

Keep controllers thin. Put rules in services.

---

## 10. Testing & health checks

```bash
# health
curl http://localhost:5000/api/v1/health

# unit tests
npm test
```

Health checks currently cover:

- database connectivity
- Stripe key presence
- queue config (`REDIS_HOST`/`REDIS_PORT` when enabled)

---

## 11. Common problems & fixes

| Problem | Likely cause | Fix |
|---|---|---|
| `ENOTFOUND` Neon host | DNS / wrong `DB_HOST` / offline | Check Neon hostname, internet |
| `ECONNREFUSED 6379` | Redis not running but queues on | Start Redis or set `QUEUE_ENABLED=false` |
| App won't boot (env validation) | Missing/invalid required env | Compare with `.env.example` |
| CORS errors in browser | Frontend origin not in `CORS_ORIGIN` | Add `http://localhost:5173` (or your FE URL) |
| 401 everywhere | Token missing/expired | Login again / check refresh flow |
| Port already in use | Old Nest process | Kill process on port 5000, restart |

Kill port 5000 (Windows PowerShell example):

```powershell
Get-NetTCPConnection -LocalPort 5000 | Select OwningProcess
Stop-Process -Id <PID> -Force
```

---

## 12. Recommended local run order

1. Start Redis (if queues enabled)
2. Start backend: `cd backend && npm run dev`
3. Confirm `/api/v1/health` is `ok`
4. Start frontend (`cd frontend && npm run dev`)
5. Login / use app against `http://localhost:5000/api/v1`

---

# Roman English Version

## 1. Orbit backend kya hai?

Orbit backend ek **NestJS + TypeScript** API hai jo Orbit SaaS app chalata hai (projects/tasks workspace, billing, admin panel, AI tools).

- Framework: **NestJS**
- Language: **TypeScript**
- Database: **PostgreSQL** (aksar Neon)
- ORM: **TypeORM**
- Auth: **JWT** + optional Google/GitHub OAuth + 2FA
- Billing: **Stripe**
- Optional queues: **BullMQ + Redis**
- Realtime: **Socket.IO** (`/realtime`)
- AI: **Cursor API**
- Global prefix: **`/api/v1`**
- Local port: aksar **`5000`**

Folder: `orbit/backend`

---

## 2. Pehle kya install karna hai?

1. **Node.js** (LTS, e.g. 20+)
2. **npm**
3. **PostgreSQL / Neon** access
4. Optional:
   - **Docker** (Redis ke liye)
   - **Redis** agar queues on karni hain

Check:

```bash
node -v
npm -v
```

---

## 3. Setup — step by step

### Step 1 — Backend folder open karo

```bash
cd orbit/backend
```

### Step 2 — Packages install

```bash
npm install
```

### Step 3 — Env file banao

```bash
# Windows PowerShell
Copy-Item .env.example .env.local

# macOS / Linux
cp .env.example .env.local
```

App pehle `.env.local` phir `.env` load karti hai.

### Step 4 — Zaroori values bharo

`.env.local` mein yeh important hain:

- `PORT` → API port (`5000` rakho local FE ke saath)
- `DB_*` → database connection
- `JWT_SECRET`, `JWT_REFRESH_SECRET` → auth tokens (32+ chars)
- `SMTP_*`, `EMAIL_FROM` → OTP / invite / reset emails
- `FRONTEND_URL` → email links + OAuth
- `CORS_ORIGIN` → frontend URLs (comma-separated)
- `STRIPE_*` → billing
- `CURSOR_API_KEY` → AI

Local recommendation:

```env
PORT=5000
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
FRONTEND_URL=http://localhost:5173
QUEUE_ENABLED=false
```

Redis chal raha ho to:

```env
QUEUE_ENABLED=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### Step 5 — Redis (sirf queues ke liye)

```bash
docker start flow-sync-redis
# ya naya container:
docker run -d --name flow-sync-redis -p 6379:6379 redis:7-alpine
```

Agar `QUEUE_ENABLED=false` hai to Redis ki zaroorat nahi.

### Step 6 — Backend start

```bash
npm run dev
```

Check:

- compile clean
- server `PORT` pe listen kar raha hai
- `http://localhost:5000/api/v1/health` chal raha hai

### Step 7 — Super admin seed (pehli dafa)

```bash
npm run seed:super-admin
```

Email/password env se aate hain: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`.

---

## 4. Important commands

| Command | Matlab |
|---|---|
| `npm run dev` | Daily development (watch mode) |
| `npm run build` | Production build |
| `npm run start:prod` | Built app run |
| `npm run seed:super-admin` | Platform admin create/update |
| `npm run lint` | Lint |
| `npm test` | Tests |

---

## 5. Architecture — code kaise organize hai?

```
backend/src/
  main.ts           → app boot, CORS, validation, prefix
  app.module.ts     → saare modules connect
  config/           → DB + env validation
  entities/         → DB tables
  auth/             → login/register/JWT/OAuth/2FA
  organizations/    → workspace org settings
  teams/            → invites + roles
  projects/         → projects + comments + GitHub
  tasks/            → tasks/boards/reports
  calendar/         → events
  activity/         → activity logs
  notifications/    → notifications + realtime
  billing/          → Stripe
  admin/            → platform admin APIs
  ai/               → AI endpoints
  leads/            → contact leads
  queues/           → Redis jobs
  jobs/             → cron digests
```

Simple flow:

**Request → Controller → Service → Database**  
Beech mein **Guards** access control karte hain.

---

## 6. API basics (easy words)

- Local base URL: `http://localhost:5000/api/v1`
- Auth: `Authorization: Bearer <token>`
- Health: `/api/v1/health`
- Uploads: `/api/v1/uploads/...`
- Socket: `/realtime`

Badi groups:

- `/auth/*` — login/register
- `/projects`, `/tasks`, `/teams` — workspace
- `/billing/*` — plans + Stripe
- `/admin/*` — platform admin
- `/ai/*` — AI features
- `/leads` — contact form

---

## 7. Auth aur roles samajho

Roles:

- **Platform admin** → pura admin console
- **Owner** → billing/settings (tasks create/edit intentionally block)
- **Admin** → org + delivery
- **Manager** → projects/tasks run karta hai
- **Member** → my tasks / boards

Flow:

1. Register + OTP verify
2. Login → tokens
3. API pe Bearer token
4. 401 pe refresh token

Guards:

- JWT required
- Org member required
- Active subscription required (workspace)
- Platform admin required (admin APIs)

---

## 8. Features short explanation

- **Auth**: OTP, OAuth, 2FA, invites, profile
- **Projects/Tasks**: CRUD, boards, reports, attachments, GitHub link
- **Teams/Org**: invites, roles, workspace settings
- **Billing**: Stripe checkout, invoices, portal
- **Admin**: users/orgs/subs/activity/settings/leads
- **AI**: drafts, WBS, ask workspace/platform
- **Queues**: Redis pe email/AI/digest (optional)

---

## 9. Nayi backend feature kaise add karein?

1. Naya module folder banao (`src/...`)
2. Zarurat ho to entity add karo
3. DTO + validation likho
4. Service mein logic likho
5. Controller routes banao
6. `app.module.ts` mein register karo
7. Correct guards lagaao
8. `/api/v1/...` pe test karo
9. Frontend service update karo (agar UI chahiye)

Controller thin rakho, business logic service mein.

---

## 10. Health check aur tests

```bash
curl http://localhost:5000/api/v1/health
npm test
```

Health check karta hai:

- DB connected hai ya nahi
- Stripe key set hai ya nahi
- Queue/Redis config theek hai ya nahi (jab enabled ho)

---

## 11. Common errors aur fixes

| Error | Wajah | Fix |
|---|---|---|
| Neon `ENOTFOUND` | Galat host / DNS / internet | DB host check + net check |
| `ECONNREFUSED 6379` | Redis band + queues on | Redis start ya queues off |
| Boot fail (validation) | Env missing | `.env.example` se match karo |
| CORS error | FE origin allow nahi | `CORS_ORIGIN` update |
| Continuous 401 | Token issue | Dubara login / refresh check |
| Port busy | Purana process | Port 5000 kill karke restart |

Port kill (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 5000 | Select OwningProcess
Stop-Process -Id <PID> -Force
```

---

## 12. Best local run order

1. Redis start (agar queues on hain)
2. Backend: `cd backend && npm run dev`
3. Health `ok` confirm
4. Frontend start
5. App use karo

---

## Related docs

- Frontend guide: [`frontend.md`](./frontend.md)
