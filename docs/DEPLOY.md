# Tinkr production deployment

## Prerequisites

- Supabase project with `supabase/schema.sql` and all files in `supabase/migrations/` applied
- Vercel account linked to this repository
- `OPENAI_API_KEY` for AI patch generation

## Vercel projects

Create **two** Vercel projects from the same GitHub repo:

| Project | Root directory | Example URL |
|---------|----------------|-------------|
| `tinkr-api` | `server` | `https://tinkr-api.vercel.app` |
| `tinkr-web` | `web` | `https://tinkr-web-henna.vercel.app` |

## Supabase auth URLs

In Supabase → Authentication → URL configuration:

- **Site URL:** `https://tinkr-web-henna.vercel.app`
- **Redirect URLs:**
  - `https://tinkr-web-henna.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`

## API environment (`tinkr-api`)

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.k2think.ai/v1
OPENAI_MODEL=MBZUAI-IFM/K2-Think-v2
PUBLIC_APP_URL=https://tinkr-web-henna.vercel.app
ALLOWED_ORIGINS=https://tinkr-web-henna.vercel.app,http://localhost:3000
```

## Web environment (`tinkr-web`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_TINKR_API_URL=https://tinkr-api.vercel.app
NEXT_PUBLIC_TINKR_APP_URL=https://tinkr-web-henna.vercel.app
NEXT_PUBLIC_TINKR_EXTENSION_ID=
NEXT_PUBLIC_TINKR_GITHUB_REPO=https://github.com/hatif03/tinkr/releases/latest
```

Set `NEXT_PUBLIC_TINKR_EXTENSION_ID` after packing the extension (see below).

## Pack and release extension

```bash
openssl genrsa -out scripts/extension.pem 2048
node scripts/derive-extension-key.mjs

TINKR_APP_URL=https://tinkr-web-henna.vercel.app \
TINKR_API_URL=https://tinkr-api.vercel.app \
node scripts/pack-extension.mjs
```

Publish:

```bash
git tag v0.3.0
git push origin v0.3.0
```

The GitHub Actions release workflow attaches `dist/tinkr-v0.3.0.zip` and refreshes `web/public/downloads/tinkr-extension.zip`.

Store `scripts/extension.pem` in the GitHub secret `EXTENSION_PEM`.

## Tester install

Share `https://tinkr-web-henna.vercel.app/install` — testers only need Chrome and the downloaded zip.

## Local contributor setup

```bash
node scripts/setup.mjs
```
