# tinkr

> Learn design by changing what you can already see.

I started tinkr because learning design often creates a frustrating gap: I would find a landing page, product screen, or interaction I loved, then have to open a blank Figma file and try to rebuild it before I could experiment. I did not want to copy a whole website or publish someone else's work. I just wanted to move a headline, try a different CTA, borrow the rhythm of a card, layer something over a hero, and learn by playing.

tinkr turns that impulse into a workspace. It is a Chrome extension that turns the webpage currently open in your browser into a private, remixable design canvas. Select what you see, move it, restyle it, add your own components, layer ideas on top, and save the remix to continue later.

The original website is never published from tinkr and its backend is never changed.

## What it is

tinkr is a live-web design layer for founders, builders, and people learning design.

- Open a public webpage and enter **Design Mode**.
- Select visible text, images, buttons, cards, or sections.
- Move and layer elements freely on the visual canvas, or use structural mode to reorder compatible source-layout siblings.
- Edit copy, type, color, spacing, radius, image treatment, and layout properties.
- Add tinkr-owned CTAs, feature cards, testimonials, wireframes, vectors, comments, and assets.
- Save changes locally first; sign in only when you want cloud projects, reviews, collaboration, or history.

tinkr is intentionally not a website copier, publisher, or production-code editor. It is a place to explore an idea quickly and keep the work you make.

## How the canvas works

tinkr uses the HTML, CSS, assets, and layout already loaded in the current tab. It records reversible patches instead of changing the source site.

When possible, a change is applied directly to the selected DOM element: text updates, CSS overrides, `translate`, `z-index`, and compatible reorder operations. When an element is hard to manipulate safely because of clipping or stacking rules, tinkr can create a **visual copy**: a sanitized, tinkr-owned canvas layer that sits above the source element. This keeps experimentation expressive without cloning the whole page.

Every remix is private by default and can be reopened against the original URL. If a page changes and an old target no longer matches, tinkr should ask you to reattach the edit instead of applying it to the wrong element.

## Try it

1. Load the extension in Chrome, then open any `http` or `https` webpage.
2. Open the tinkr side panel and choose **Enter Design Mode**. Guest mode works without an account.
3. Use the floating toolbar to select, move, pan, scale, add text, draw shapes, comment, prototype, or inspect.
4. Drag an element to move it freely. Drop it over another layer to place it above that layer.
5. Use the **Arrange** controls in the side panel to bring a layer forward/backward, place it on top of another layer, switch to structural reorder mode, or create a visual copy.
6. Changes autosave locally. Sign in when you want to sync a project to tinkr, reopen it from the dashboard, share a review, or collaborate.

Normal browser actions are blocked only while Design Mode is active, so you do not accidentally submit a form or navigate away while remixing.

See [Screenshots](#screenshots) for a full walkthrough on [linear.app](https://linear.app/).

## Screenshots

Demo remix of [linear.app](https://linear.app/) — the original site is never modified.

| Step | Preview |
| --- | --- |
| Original landing page | ![Original landing page](docs/screenshots/01-linear-original.png) |
| Design Mode remix with floating toolbar | ![Design Mode remix with toolbar](docs/screenshots/02-design-mode-remix.png) |
| Side panel editing controls | ![Side panel editing controls](docs/screenshots/03-sidepanel-editing.png) |
| Cloud sync after sign-in | ![Cloud sync after sign-in](docs/screenshots/04-cloud-synced.png) |
| Project saved in tinkr dashboard | ![Project saved in tinkr dashboard](docs/screenshots/05-dashboard-project.png) |
| Reopened from cloud via dashboard | ![Reopened from cloud via dashboard](docs/screenshots/06-reopen-from-cloud.png) |

## Studio capabilities

| Area | What you can do |
| --- | --- |
| Visual canvas | Free move, layer ordering, overlap, resize, hide, duplicate, visual copies, sections, notes, wireframes, vectors, and uploaded assets. |
| Live-DOM editing | Change text, typography, colors, spacing, radius, opacity, images, filters, responsive overrides, and compatible flex/grid layouts. |
| Components and variables | Save sanitized components, insert reusable variants, create color/spacing/radius/type variables, and apply tokens. |
| Dev Mode | Inspect computed styles, box model, accessibility details, patch diffs, CSS-like output, and patch JSON. |
| Prototyping | Add hotspots, safe CSS motion, comments, and review-ready annotations. |
| Cloud workspace | Private projects, autosave, checkpoints, visual review links, comments, presence, and a dashboard when signed in. |
| Code Labs | Run sandboxed JavaScript that emits reversible design operations; no cookies, network, page DOM, or credentials are exposed. |

## Boundaries

tinkr is built for exploration, not for changing another person's live product.

- It never publishes edits to the source website.
- Forms, payments, authenticated flows, browser-internal pages, cross-origin iframe internals, and canvas/WebGL interfaces are protected from direct interaction.
- tinkr can annotate or create a visual layer around unsupported content, but it does not claim to edit third-party rendered graphics as source vectors.
- Advanced code remains sandboxed and declarative; tinkr does not run arbitrary page JavaScript.

## Architecture

```text
Chrome extension (live Design Mode)
        |                  \
        | local drafts       \ cloud sync when signed in
        v                    v
Chrome storage          tinkr API -> Supabase
        |                         |
        +-------------------------+
                    |
          tinkr dashboard, editor, and review pages
```

- The extension is the authoritative live-page editor.
- The dashboard is where saved projects, revisions, visual reviews, and collaboration live.
- Cloud configuration belongs to tinkr operators, never extension users.

## Brand assets

The supplied tinkr mark is available as [PNG](assets/brand/tinkr-logo.png) and [JPEG](assets/brand/tinkr-logo.jpg). The extension also ships the required 16, 32, 48, and 128 px PNG icons from `assets/brand/`; the dashboard uses the matching PNG in `web/public/brand/`.

## Local development

### Extension

Load this repository as an unpacked extension from `chrome://extensions` with Developer mode enabled. The local URLs are configured in [tinkr-config.js](tinkr-config.js).

### Services

| Service | Directory | Default local URL |
| --- | --- | --- |
| API | `server/` | `http://localhost:8787` |
| Dashboard | `web/` | `http://localhost:3000` |
| Database | `supabase/` | A single operator-managed Supabase project |

```powershell
# API
cd server
Copy-Item .env.example .env
# Set OPENAI_API_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev

# Dashboard (separate terminal)
cd web
Copy-Item .env.local.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Apply [supabase/schema.sql](supabase/schema.sql), then the migrations in `supabase/migrations/`—including `20260721000000_fix_projects_rls_recursion.sql`—to the managed Supabase project before testing authenticated project access. Enable Google OAuth and email magic links with the local callback URL `http://localhost:3000/auth/callback`.

## Project status

tinkr is an experimental creative tool. Its core promise is simple: when a design on the web sparks an idea, you should be able to start playing immediately instead of rebuilding it from scratch.
