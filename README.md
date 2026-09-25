# Velozity Project Workspace

A full stack project dashboard for a small agency. It includes a React/TypeScript client, an Express API, PostgreSQL persistence through Prisma, JWT sessions with rotating HttpOnly refresh cookies, server-enforced role and project ownership checks, Socket.IO live updates, database-backed activity and notifications, and a scheduled overdue task job.

## Start locally

Requirements: Node.js 20+, npm, and Docker Desktop (with Docker Compose). On a Mac, install and launch Docker Desktop once; verify `docker --version` and `docker compose version` work in a new terminal. See the [official Docker Desktop for Mac installation guide](https://docs.docker.com/desktop/setup/install/mac-install/).

1. Copy `api/.env.example` to `api/.env`. Keep the local database URL for Docker and replace both token secrets with random values of at least 32 characters.
2. Install packages: `npm install`. Wait for it to finish successfully before running any other project command; Prisma, tsx, and concurrently are installed by this step.
3. Start Docker Desktop and the database: `npm run db:up`
4. Apply schema and seed demo data: `npm run db:migrate -- --name init`, then `npm run db:seed`
5. Start both apps: `npm run dev` (or `npm start`)
6. Open http://localhost:5173. API health is at http://localhost:4000/api/health.

The refresh token lives only in an HttpOnly, SameSite=Lax cookie scoped to `/api/auth`; the short-lived access token is held in browser localStorage and sent as a bearer token. Refresh rotation and revocation state are stored in PostgreSQL. In production, use HTTPS, set `NODE_ENV=production`, and configure `CLIENT_ORIGIN` and `VITE_API_URL` to the deployed origins.

### If npm install times out

The install downloads packages from `registry.npmjs.org`; a timeout usually means the network/proxy interrupted that download. Retry on a stable network, then run:

```bash
npm config set fetch-retries 5
npm config set fetch-timeout 300000
npm ping
npm install
```

If `npm ping` cannot reach the registry, check the current Wi-Fi/VPN/proxy or ask your network administrator to allow HTTPS access to `registry.npmjs.org`. Do not run the database, seed, or development commands until `npm install` completes successfully.

## Demo accounts

All seeded accounts use password `VelozityDemo2026!`:

| Role | Email |
| --- | --- |
| Admin | `admin@velozity.demo` |
| Project Manager 1 | `pm1@velozity.demo` |
| Project Manager 2 | `pm2@velozity.demo` |
| Developer 1–4 | `dev1@velozity.demo` through `dev4@velozity.demo` |

The seed creates 3 client projects with 18 tasks in varied states, past due dates, assigned developers, notifications, and existing activity history. Admin creates projects and clients; PMs can manage only projects they own; developers can retrieve and change only tasks assigned to them. API authorization is authoritative; Socket.IO derives room membership from the authenticated role and current database ownership/assignments.

## Architecture

- **API:** Express with middleware, Zod request validation, consistent JSON errors, Helmet, CORS credentials, and login rate limiting. Routes live in `api/src/index.ts`; data access uses Prisma.
- **Database:** PostgreSQL relational schema in `api/prisma/schema.prisma`. Projects reference a client and owner; tasks reference a project and optional developer; activities and notifications are durable rows; refresh sessions are revocable rows.
- **Indexes:** Unique email and refresh JTI support identity/session lookups. Project owner/client indexes scope authorization and project lists. Task `(projectId,status)`, `(assigneeId,status,priority,dueDate)`, and `(dueDate,status)` indexes support boards, developer task lists, and the overdue scheduler. Activity `(projectId,createdAt)` and `(userId,createdAt)` support feeds. Notification `(userId,readAt,createdAt)` supports unread badge queries.
- **Live events:** Socket.IO provides authenticated rooms for each visible project and each user. Status changes are persisted as activity before they are broadcast. Admins join all project rooms and get the global activity feed; PM and developer memberships are scoped by database records. On reconnect, the UI fetches the latest 20 authorized feed entries from PostgreSQL.
- **Overdue work:** `node-cron` checks hourly for due, unfinished tasks, updates their status, writes an audit entry, and broadcasts the result. This is appropriate for a single API process and avoids operating a separate queue service. Use a distributed queue/lock if deploying multiple API replicas.
- **Client:** React and TypeScript, URL query parameters for status and priority filters, cookie credentials for refresh, and Socket.IO for live feed, badge, and presence updates.

### Schema outline

```text
User 1 ── * Project (owner)
Client 1 ── * Project
Project 1 ── * Task
User 1 ── * Task (assignee)
Project 1 ── * Activity * ── 1 User
Task 1 ── * Activity
User 1 ── * Notification
User 1 ── * RefreshToken
```

## Deploying on Vercel

Deploy this repository as **two Vercel projects**, both connected to the same GitHub repository:

1. Create the **API** project with `api` as its Root Directory. Vercel detects the Express entry point at `src/index.ts`; the app exports its HTTP server for Vercel Functions and uses Socket.IO WebSocket support. The API project's `vercel.json` runs database migrations during the build and configures the overdue-task cron route.
2. Create the **web** project with `web` as its Root Directory. Its `vercel.json` builds the Vite app into `dist`.
3. Deploy the API first, copy its production URL, then set `VITE_API_URL` in the web project to that URL (for example, `https://velozity-api.vercel.app`) and deploy the web project.
4. Set `CLIENT_ORIGIN` in the API project to the web project's exact production URL. Redeploy the API after changing it.

Set the following API environment variables in Vercel for Production, Preview, and Development as appropriate:

```text
DATABASE_URL=postgresql://...your-managed-postgres-connection...
ACCESS_TOKEN_SECRET=<random value, at least 32 characters>
REFRESH_TOKEN_SECRET=<different random value, at least 32 characters>
CLIENT_ORIGIN=https://your-web-project.vercel.app
COOKIE_SAME_SITE=lax
CRON_SECRET=<random value, at least 16 characters>
```

Use a managed PostgreSQL provider and a pooled/serverless connection URL when the provider offers one. `CRON_SECRET` protects the scheduled endpoint; Vercel sends it as a bearer token to `/api/cron/overdue`. The configured hourly cron requires a Vercel Pro or Enterprise plan. On the Hobby plan, change the schedule in `api/vercel.json` to a once-daily expression before deploying.

The API build applies committed Prisma migrations. For this assessment's demo accounts and sample projects, run `npm --workspace api run db:seed` **once** from a trusted machine with `DATABASE_URL` set to the hosted database; do not add seeding to the Vercel build command.

For separate custom domains that are cross-site, set `COOKIE_SAME_SITE=none`; cookies will remain secure in production. Do not expose any API secret in the web project's environment variables. Only `VITE_API_URL` belongs in the web project.

## Known limitations

- Presence reflects currently connected Socket.IO clients in one API process; multi-instance deployments need a Socket.IO Redis adapter and shared presence coordination.
- PM and Admin can create projects and tasks; task editing and assignment are available through the API, while the current dashboard focuses on status changes and project creation.
- Client management has a minimal API and seeded records; a dedicated client administration screen is not included.
- Refresh cookie uses SameSite=Lax; deployments that require cross-site embedding need an explicit secure cookie and CSRF strategy.
- The hourly scheduler runs inside the API process. Use a distributed queue/lock for replicated workers.

## Assessment explanation (190 words)
The hardest part was keeping the live feed useful without letting realtime delivery bypass the application’s role rules. I treated authorization as a server concern at both boundaries: REST handlers scope each query to the authenticated user, while Socket.IO validates the access token and joins the user only to rooms derived from current project ownership or task assignment in PostgreSQL. Task status changes are written to the task row and to a durable activity record before the event is broadcast. That gives the interface immediate updates while preserving an audit trail. On reconnect, the client requests the latest 20 events from the database using the same role-scoped query rules, so an offline user does not depend on process memory. PMs see only projects they own, and developers see only work assigned to them. I chose Socket.IO because its room model fits this access pattern and it provides reconnection behavior with less custom protocol code. I chose node-cron for the overdue sweep because this assessment runs as a single API service and the job is periodic; I would move it to a distributed queue if the API scaled horizontally. I would also add automated authorization tests and a shared adapter before production deployment.
