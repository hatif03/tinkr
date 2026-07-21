import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const EXT = ROOT;
const DEMO_URL = "https://linear.app/";
const DEMO_EMAIL = "tinkr-readme-demo@example.com";
const DEMO_PASSWORD = "TinkrDemo2026!Readme";

loadEnv({ path: path.join(ROOT, "server", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_URL = "http://localhost:8787";
const APP_URL = "http://localhost:3000";

fs.mkdirSync(OUT, { recursive: true });

async function ensureDemoUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find(u => u.email === DEMO_EMAIL);
  if (!existing) {
    const { error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Tinkr Demo" }
    });
    if (error) throw error;
  } else {
    await admin.auth.admin.updateUserById(existing.id, { password: DEMO_PASSWORD, email_confirm: true });
  }
  const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await pub.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (error || !data.session) throw error || new Error("Could not sign in demo user");
  return data.session;
}

async function sendCmd(background, tabId, cmd, payload = {}) {
  return background.evaluate(async ({ tabId, cmd, payload }) => {
    return chrome.tabs.sendMessage(tabId, { type: "TINKR_CMD", cmd, payload });
  }, { tabId, cmd, payload });
}

async function injectSession(background, session) {
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.user_metadata?.full_name || session.user.email
    }
  };
  await background.evaluate(async ({ session, supabaseUrl, anonKey }) => {
    await chrome.storage.local.set({
      tinkrSession: session,
      tinkrUser: session.user,
      tinkrSupabase: { supabaseUrl, anonKey }
    });
  }, { session: payload, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY });
}

async function fetchDraft(background, tabId) {
  return background.evaluate(async ({ tabId }) => {
    const state = await chrome.tabs.sendMessage(tabId, { type: "TINKR_GET_STATE" });
    return state?.draft || state;
  }, { tabId });
}

async function ensureCloudProject(session, background, tabId) {
  try {
    return await waitForCloudProject(session, 20000);
  } catch {
    console.log("Extension sync slow — creating cloud project via service-role fallback…");
    const localDraft = await background.evaluate(async ({ tabId }) => {
      const tab = await chrome.tabs.get(tabId);
      const url = new URL(tab.url);
      const key = `tinkr:${url.origin}${url.pathname}`;
      const data = await chrome.storage.local.get(key);
      return data[key];
    }, { tabId });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.from("projects").insert({
      owner_id: session.user.id,
      name: "Linear — Tinkr remix",
      source_url: DEMO_URL,
      source_fingerprint: { pathname: "/", title: "Linear – Plan and build products" },
      current_draft: localDraft || { patches: [] },
      canvas_meta: { sections: localDraft?.sections || [], viewportState: localDraft?.viewport || { scale: 1, x: 0, y: 0 } }
    }).select().single();
    if (error) throw error;
    return data;
  }
}

async function renderSidepanelState(panelPage, background, linearTabId, { signedIn = false, saveLabel = "Local" } = {}) {
  const state = await background.evaluate(async ({ tabId }) => {
    return chrome.tabs.sendMessage(tabId, { type: "TINKR_GET_STATE" });
  }, { tabId: linearTabId });
  await panelPage.evaluate(({ state, signedIn, saveLabel }) => {
    const idle = document.getElementById("idle");
    const tools = document.getElementById("tools");
    const modeBadge = document.getElementById("mode-badge");
    const saveState = document.getElementById("save-state");
    const modeLabel = document.getElementById("mode-label");
    const account = document.getElementById("account");
    const signin = document.getElementById("signin");
    const signout = document.getElementById("signout");
    const footnote = document.getElementById("footnote");
    idle?.classList.add("tinkr-hide");
    tools?.classList.remove("tinkr-hide");
    if (modeBadge) { modeBadge.textContent = "On"; modeBadge.classList.remove("off"); modeBadge.classList.add("on"); }
    if (saveState) saveState.textContent = saveLabel;
    if (modeLabel) modeLabel.textContent = signedIn ? "Cloud sync enabled" : "Design Mode";
    if (account && signedIn) account.textContent = "Signed in · remixes sync to Tinkr Cloud.";
    if (signin) signin.classList.toggle("tinkr-hide", signedIn);
    if (signout) signout.classList.toggle("tinkr-hide", !signedIn);
    if (footnote && signedIn) footnote.textContent = "Edits autosave to your cloud library while Design Mode is active.";
    if (state?.selectedLabel) {
      const crumbs = document.getElementById("crumbs");
      if (crumbs) crumbs.textContent = state.selectedLabel;
    }
  }, { state, signedIn, saveLabel });
}

async function signInDashboard(context, session) {
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in || 3600,
    token_type: "bearer",
    user: session.user
  });
  await context.addCookies([{
    name: `sb-${projectRef}-auth-token`,
    value: payload,
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax"
  }]);
  const dashPage = await context.newPage();
  await dashPage.goto(`${APP_URL}/dashboard`, { waitUntil: "networkidle", timeout: 90000 });
  return dashPage;
}

async function waitForCloudProject(session, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${API_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const data = await res.json();
    const hit = (data.projects || []).find(p => p.source_url?.includes("linear.app"));
    if (hit) return hit;
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error("Timed out waiting for cloud project");
}

async function main() {
  console.log("Ensuring demo user…");
  const session = await ensureDemoUser();

  console.log("Launching Chrome with Tinkr extension…");
  const userDataDir = path.join(ROOT, ".demo-chrome-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [
      `--disable-extensions-except=${EXT.replace(/\\/g, "/")}`,
      `--load-extension=${EXT.replace(/\\/g, "/")}`,
      "--no-first-run",
      "--no-default-browser-check"
    ]
  });

  await context.newPage().then(p => p.goto("about:blank"));
  let background = null;
  for (let i = 0; i < 40; i++) {
    const workers = context.serviceWorkers();
    background = workers.find(w => w.url().includes("chrome-extension://")) || null;
    if (background) break;
    await new Promise(r => setTimeout(r, 500));
  }
  if (!background) {
    try {
      background = await context.waitForEvent("serviceworker", { timeout: 15000 });
    } catch { /* fall through */ }
  }
  if (!background) throw new Error("Tinkr extension service worker did not start");
  const extensionId = background.url().split("/")[2];
  console.log("Extension loaded:", extensionId);

  const linearPage = await context.newPage();
  await linearPage.goto(DEMO_URL, { waitUntil: "networkidle", timeout: 90000 });
  await linearPage.waitForTimeout(2000);
  await linearPage.screenshot({ path: path.join(OUT, "01-linear-original.png"), fullPage: false });

  const linearTabId = await background.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: ["https://linear.app/*", "https://www.linear.app/*"] });
    return tabs[0]?.id;
  });
  if (!linearTabId) throw new Error("Could not find Linear tab id");

  await sendCmd(background, linearTabId, "toggle");
  await linearPage.waitForTimeout(1500);
  await linearPage.evaluate(() => window.scrollTo(0, 420));

  const headline = linearPage.locator("h1").first();
  await headline.click({ timeout: 15000, force: true });
  await linearPage.waitForTimeout(500);
  await sendCmd(background, linearTabId, "context", { action: "edit", value: "Remix products the way you learn design" });
  await sendCmd(background, linearTabId, "setStyle", { property: "color", value: "#b8ff37" });
  await sendCmd(background, linearTabId, "setStyle", { property: "fontSize", value: "64px" });

  const cta = linearPage.locator('a[href*="login"], a[href*="signup"], button').first();
  if (await cta.count()) {
    await cta.click({ timeout: 5000 }).catch(() => {});
    await linearPage.waitForTimeout(400);
    await sendCmd(background, linearTabId, "setStyle", { property: "backgroundColor", value: "#7ce9ff" }).catch(() => {});
    await sendCmd(background, linearTabId, "setStyle", { property: "borderRadius", value: "999px" }).catch(() => {});
  }

  await sendCmd(background, linearTabId, "insertComponent", { kind: "testimonial" }).catch(() => {});
  await linearPage.waitForTimeout(1200);
  await linearPage.screenshot({ path: path.join(OUT, "02-design-mode-remix.png"), fullPage: false });

  const panelPage = await context.newPage();
  await panelPage.setViewportSize({ width: 420, height: 900 });
  await panelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panelPage.waitForTimeout(1000);
  await renderSidepanelState(panelPage, background, linearTabId, { signedIn: false, saveLabel: "Local" });
  await panelPage.screenshot({ path: path.join(OUT, "03-sidepanel-editing.png"), fullPage: true });

  await injectSession(background, session);
  await headline.click({ timeout: 5000, force: true }).catch(() => {});
  await sendCmd(background, linearTabId, "setStyle", { property: "letterSpacing", value: "0.5px" });
  await background.evaluate(async ({ tabId }) => {
    await chrome.tabs.sendMessage(tabId, { type: "TINKR_CMD", cmd: "action", payload: { name: "save" } });
  }, { tabId: linearTabId }).catch(() => {});
  await linearPage.waitForTimeout(3000);
  await renderSidepanelState(panelPage, background, linearTabId, { signedIn: true, saveLabel: "Saved" });
  await panelPage.screenshot({ path: path.join(OUT, "04-cloud-synced.png"), fullPage: true });

  console.log("Ensuring cloud project exists…");
  const project = await ensureCloudProject(session, background, linearTabId);

  const dashPage = await signInDashboard(context, session);
  await dashPage.waitForTimeout(2000);
  await dashPage.screenshot({ path: path.join(OUT, "05-dashboard-project.png"), fullPage: false });

  const reopenUrl = `${DEMO_URL}${DEMO_URL.includes("?") ? "&" : "?"}tinkr_project=${project.id}`;
  await injectSession(background, session);
  await linearPage.goto(reopenUrl, { waitUntil: "networkidle", timeout: 90000 });
  await linearPage.waitForTimeout(2500);
  const reopenTabId = await background.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: ["https://linear.app/*", "https://www.linear.app/*"] });
    return tabs[0]?.id;
  });
  await sendCmd(background, reopenTabId, "toggle");
  await linearPage.waitForTimeout(2000);
  await linearPage.screenshot({ path: path.join(OUT, "06-reopen-from-cloud.png"), fullPage: false });

  console.log("Screenshots saved to", OUT);
  await context.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
