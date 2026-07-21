# Install and test tinkr

tinkr is a **Chrome desktop extension and web workspace**. The extension is the live-page editor; the dashboard stores projects, reviews, and account data.

## Supported platforms

| Platform | Support |
| --- | --- |
| Google Chrome on Windows, macOS, or Linux | Supported for local testing |
| Chromium browsers without Chrome's Side Panel APIs | Not supported/tested |
| Firefox and Safari | Not supported |
| Mobile browsers | Not supported |

Use a recent desktop version of Google Chrome and load tinkr as an unpacked Manifest V3 extension.

## What judges need

- Git
- Node.js 20+
- Docker Desktop (or Docker Engine with Compose)
- Google Chrome

The startup script uses an installed Supabase CLI when available and otherwise invokes it through `npx`.

## Quick local setup

From the repository root:

```powershell
git clone https://github.com/hatif03/tinkr.git
cd tinkr
Copy-Item .env.docker.example .env.docker
node scripts/dev-docker.mjs
```

On macOS or Linux, replace the `Copy-Item` line with:

```bash
cp .env.docker.example .env.docker
```

On first run, the script starts local Supabase, applies the local schema/migrations, and starts:

| Service | Local URL |
| --- | --- |
| tinkr dashboard | http://localhost:3000 |
| tinkr API health | http://localhost:8787/health |
| Supabase Studio | http://127.0.0.1:54323 |
| Local magic-link inbox | http://127.0.0.1:54324 |

Keep the terminal running while you test.

## Load the Chrome extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository root (`tinkr/`), not the `web/` or `server/` folder.
5. Pin the tinkr extension if you want quick access to the side panel.

If you make extension-file changes during development, click **Reload** for tinkr on `chrome://extensions` before testing again.

## Create an account and pair the local extension

1. Open [http://localhost:3000/login](http://localhost:3000/login).
2. Use **Sign in**, **Create account**, or **Magic link**.
3. For a local magic link, open the Inbucket URL above instead of waiting for a real email.
4. Open the tinkr side panel on any public webpage and choose **Sign in to start editing**.
5. Local unpacked extensions intentionally show one **Connect this local extension** confirmation. Approve it once, then return to the side panel.

The explicit local confirmation is expected. It keeps a browser session from being silently handed to an arbitrary unpacked extension. A packaged production extension uses its configured extension ID for automatic pairing.

## Judge test flow

1. Open a public `http` or `https` landing page in Chrome.
2. Open the tinkr side panel and choose **Enter Design Mode**.
3. Select a heading, button, image, card, or section.
4. Try a text/style edit, move a layer, use Arrange to put one layer above another, or add a tinkr-owned component/vector.
5. Save the remix, then open the dashboard at [http://localhost:3000/dashboard](http://localhost:3000/dashboard).
6. Open the project in tinkr to replay the saved remix on its source URL.

The original webpage is never published or changed. Design Mode blocks ordinary page actions while it is active to avoid accidental navigation or form submission.

## Optional AI testing

AI patch previews are optional. Add a provider key to `.env.docker` and restart the stack:

```text
OPENAI_API_KEY=your-key-here
```

Without a key, the core canvas, local editing, saving, dashboard, and review flows still work. The runtime AI path only receives selected context and returns structured patch proposals; it does not execute arbitrary page JavaScript.

## Verification commands

```powershell
# API tests
Set-Location server
npm test

# Dashboard production build
Set-Location ..\web
npm run build
```

## Troubleshooting

### The side panel still says signed out

- Reload the unpacked extension at `chrome://extensions`.
- Confirm the dashboard is running at `http://localhost:3000`.
- Open the side panel sign-in flow and approve **Connect this local extension**.

### The extension cannot enter Design Mode

- Confirm you are on a normal `http` or `https` webpage, not `chrome://`, a browser PDF viewer, or a browser-internal page.
- Sign in before enabling Design Mode.
- Reload the webpage after loading/reloading the extension.

### Docker or Supabase fails to start

- Start Docker Desktop, then run `node scripts/dev-docker.mjs` again.
- Check that ports `3000`, `8787`, `54321`, `54322`, `54323`, and `54324` are free.
- For a complete contributor guide and manual non-Docker setup, see [docs/LOCAL.md](docs/LOCAL.md).

## Hosted beta

When the deployment is enabled, the dashboard beta is available at [tinkr-web-henna.vercel.app](https://tinkr-web-henna.vercel.app). A hosted dashboard alone cannot edit webpages; judges still need the Chrome extension installed to use live Design Mode.
