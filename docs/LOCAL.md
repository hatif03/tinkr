# Local development

Run the full tinkr stack on your machine: local Supabase, API, dashboard, and the Chrome extension loaded from this repo.

For production deployment, see [DEPLOY.md](DEPLOY.md).

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose) | latest | Runs API and dashboard containers |
| [Node.js](https://nodejs.org/) | 20+ | Runs setup/dev scripts |
| Google Chrome | latest | Extension sideload |

The Supabase CLI is invoked automatically via `npx supabase` if it is not installed globally.

## Quick start (Docker — recommended)

```bash
cp .env.docker.example .env.docker   # first time only
node scripts/dev-docker.mjs
```

Then load the extension:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this repository root
4. Open any website → tinkr side panel → **Enter Design Mode**

### What starts

| Service | URL | How |
|---------|-----|-----|
| Dashboard | http://localhost:3000 | Docker (`web`) |
| API | http://localhost:8787 | Docker (`api`) |
| Supabase API | http://127.0.0.1:54321 | Supabase CLI |
| Supabase Studio | http://127.0.0.1:54323 | Supabase CLI |
| Magic-link inbox | http://127.0.0.1:54324 | Inbucket (local email) |

The Chrome extension runs on your **host** (not in Docker). [tinkr-config.js](../tinkr-config.js) already points at `http://localhost:3000` and `http://localhost:8787`.

### Local sign-in

1. Open http://localhost:3000/login
2. Create an account with any email (e.g. `you@local.test`)
3. For magic links, open http://127.0.0.1:54324 — no real email is sent
4. For extension sign-in on localhost, confirm the one-time “Connect this local extension” prompt after login

Leave `NEXT_PUBLIC_TINKR_EXTENSION_ID` blank in `.env.docker` for unpacked local development.

### Optional: AI patches

Add your provider key to `.env.docker`:

```
OPENAI_API_KEY=your-key-here
```

Restart containers after editing:

```bash
docker compose down
node scripts/dev-docker.mjs
```

Core canvas and cloud-sync workflows work without an AI key.

## Stop the stack

```bash
# Stop API + dashboard (from repo root)
docker compose down

# Stop Supabase
supabase stop
```

## Reset the database

Reapply schema and migrations:

```bash
node scripts/dev-docker.mjs --reset-db
```

Or manually:

```bash
supabase db reset
```

## Manual setup (no Docker)

If you prefer running Node processes directly:

```bash
node scripts/setup.mjs --manual
```

Then:

1. Fill in `server/.env` and `web/.env.local` (see `.env.example` files)
2. From repo root: `supabase start` then `supabase db reset`
3. Terminal A: `cd server && npm run dev`
4. Terminal B: `cd web && npm run dev`
5. Load the unpacked extension from the repo root

Use these Supabase URLs in your env files when Supabase runs locally:

```
SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

Default local anon and service-role keys are documented in [.env.docker.example](../.env.docker.example).

## Extension-only (no backend)

You can load the unpacked extension UI without services running, but the current product requires a tinkr session to enter Design Mode. Start the local stack above to sign in, edit pages, save work, or use cloud features.

## Use hosted Supabase instead

Edit `.env.docker` (or `server/.env` / `web/.env.local` for manual setup) with your cloud Supabase URL and keys. Keep browser-facing URLs on `localhost` for local API/web.

## Troubleshooting

### Port already in use

| Port | Service |
|------|---------|
| 3000 | Dashboard |
| 8787 | API |
| 54321 | Supabase API |
| 54322 | Postgres |

Stop conflicting processes or change ports in [docker-compose.yml](../docker-compose.yml) and [supabase/config.toml](../supabase/config.toml).

### API cannot reach Supabase from Docker

`.env.docker` uses `http://host.docker.internal:54321` for container → host Supabase access. On Linux, `extra_hosts: host-gateway` in compose handles this. If issues persist, run `supabase status` and verify Supabase is up.

### Windows notes

- Use Docker Desktop with WSL2 backend for best performance
- Paths with spaces in the repo location can break volume mounts — prefer a short path like `D:\tinkr`

### `supabase db reset` fails

Ensure Docker has enough disk space. Run from the repository root where [supabase/config.toml](../supabase/config.toml) lives.

### Extension sign-in fails

- Reload the extension on `chrome://extensions`
- Confirm API health: http://localhost:8787/health
- For localhost, use the manual extension pairing confirmation on the callback page

## Project layout

| Path | Role |
|------|------|
| `server/` | Express API |
| `web/` | Next.js dashboard |
| `supabase/` | Schema, migrations, local config |
| `scripts/dev-docker.mjs` | One-command local stack |
| `docker-compose.yml` | API + web containers |
| `.env.docker.example` | Local env template |
