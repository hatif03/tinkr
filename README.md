# Tinkr

Tinkr is a Chrome extension for remixing a live webpage locally. It edits the loaded DOM in the current browser tab; it never publishes or sends changes to the page's source site.

## For end users

1. Install the extension from the Chrome Web Store (or load unpacked from this repo in Developer mode).
2. Visit any `http` or `https` page, click the Tinkr icon to open the **side panel**, then click **Enter Design Mode** — no account required.
3. Use the **floating toolbar** at the bottom of the page for tools (move, shapes, pen, text, Dev Mode `</>`). Properties and styles live in the side panel.
4. Edit locally; changes autosave to your browser.
5. Click **Sign in to save & collaborate** to sync projects to [Tinkr Cloud](http://localhost:3000), open the **in-browser editor**, or manage your library dashboard.
5. Share visual review links and collaborate with live cursors and pinned comments when signed in.

Nothing is published to the source website.

## Architecture

```
Extension (Design Mode)  ←→  api.tinkr.com  ←→  Supabase
        ↓                           ↑
   Local storage              app.tinkr.com (dashboard, login, review)
```

- **Guest-first:** local editing works without sign-in (Loom-style).
- **Cloud save:** sign-in syncs patches, sections, tokens, Code Labs, and comments.
- **Floating toolbar:** Figma-like tool bar on the page canvas (move/hand/scale, frames, shapes, pen, text, comments, Dev Mode).
- **Dev Mode:** Inspect CSS, box model, and copy specs from extension or dashboard.
- **Infinite canvas:** the page scroll plane is the canvas; sections, vectors, wireframes, and pins overlay on top.
- **Dashboard editor:** `/projects/[id]/edit` for iframe canvas + cloud autosave; `/projects/[id]/present` for prototype preview.

## Operator setup (one-time)

End users never configure Supabase, API keys, or `.env` files. Operators deploy:

| Service | Path | Default local URL |
|---------|------|-------------------|
| API server | `server/` | http://localhost:8787 |
| Web dashboard | `web/` | http://localhost:3000 |
| Database | Single Supabase project | Apply `supabase/migrations/` |

### 1. Supabase

Create one Supabase project. Apply migrations in order:

```powershell
# In Supabase SQL editor, run:
# supabase/schema.sql (initial bootstrap)
# supabase/migrations/20260718000000_canvas_meta.sql
# supabase/migrations/20260720000000_figma_features.sql
```

Enable Google OAuth and email magic links. Set redirect URLs to `http://localhost:3000/auth/callback` (and production URLs when deployed).

### 2. API server

```powershell
cd server
Copy-Item .env.example .env
# Set OPENAI_API_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

### 3. Web dashboard

```powershell
cd web
Copy-Item .env.local.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 4. Extension (local dev)

[`tinkr-config.js`](tinkr-config.js) points to `localhost:3000` and `localhost:8787`. Load unpacked in Chrome.

## Tinkr Studio features

- **Design Mode:** semantic cursor, element inspector, responsive breakpoint overrides, AI patches, Code Labs
- **Canvas:** labeled sections, wireframe frames, design tokens/variables, pan/zoom viewport mode
- **Dev Mode:** computed CSS, inline diff, Tailwind-ish export, patch JSON export
- **Prototyping:** hotspots linking to scroll targets or URLs; CSS motion keyframes
- **Collaboration:** live cursors, presence avatars, pinned comments (when signed in)

## Code Labs

Open **Code Lab** after selecting an element. Scripts run in a sandbox with no page DOM, cookies, or network access. Applied patches are reversible and sync to cloud when signed in.

## Deployment

| Service | Production host |
|---------|-----------------|
| Web | Vercel → `app.tinkr.com` |
| API | Railway/Fly → `api.tinkr.com` |
| Extension | Chrome Web Store (update `tinkr-config.js` URLs) |

Update `externally_connectable` and `host_permissions` in [`manifest.json`](manifest.json) for production domains.
