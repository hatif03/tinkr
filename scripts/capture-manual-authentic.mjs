/**
 * Authentic capture: real extension + sidePanel.open, clean edits, user account via admin magic link.
 */
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
const USER_EMAIL = "md.hatifosmani15@gmail.com";
const VIEWPORT = { width: 1100, height: 900 };
const PANEL_W = 420;

loadEnv({ path: path.join(ROOT, "server", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = "http://localhost:3000";

fs.mkdirSync(OUT, { recursive: true });

async function sendCmd(background, tabId, cmd, payload = {}) {
  return background.evaluate(async ({ tabId, cmd, payload }) => {
    return chrome.tabs.sendMessage(tabId, { type: "TINKR_CMD", cmd, payload });
  }, { tabId, cmd, payload });
}

async function getLinearTabId(background) {
  return background.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: ["https://linear.app/*", "https://www.linear.app/*"] });
    return tabs[0]?.id;
  });
}

async function openSidePanel(background, tabId) {
  await background.evaluate(async (tabId) => {
    await chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true });
    await chrome.sidePanel.open({ tabId });
  }, tabId);
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

async function ensureUser(admin) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  let user = list?.users?.find(u => u.email === USER_EMAIL);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: USER_EMAIL,
      email_confirm: true,
      user_metadata: { full_name: "Tinkr User" }
    });
    if (error) throw error;
    user = data.user;
  }
  return user;
}

async function signInExtension(context, background, extensionId, admin) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: USER_EMAIL,
    options: { redirectTo: `${APP_URL}/auth/callback?source=extension&ext_id=${extensionId}` }
  });
  if (error || !data?.properties?.action_link) throw error || new Error("generateLink failed");

  const authPage = await context.newPage();
  await authPage.goto(data.properties.action_link, { waitUntil: "networkidle", timeout: 90000 });
  await authPage.waitForTimeout(3000);
  const url = authPage.url();
  if (url.includes("extension-callback")) {
    await authPage.waitForTimeout(2000);
  }
  await authPage.close();
}

async function captureCombo(linearPage, context, extensionId, outPath, tmpDir) {
  const tmpPage = path.join(tmpDir, "page.png");
  const tmpPanel = path.join(tmpDir, "panel.png");
  await linearPage.screenshot({ path: tmpPage, fullPage: false });

  const panelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
  let panelPage = context.pages().find(p => p.url().includes("sidepanel.html"));
  if (!panelPage) {
    panelPage = await context.newPage();
    await panelPage.goto(panelUrl);
  }
  await panelPage.setViewportSize({ width: PANEL_W, height: 900 });
  await panelPage.waitForTimeout(800);
  await panelPage.screenshot({ path: tmpPanel, fullPage: true });

  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const left = await loadImage(tmpPage);
    const right = await loadImage(tmpPanel);
    const h = Math.max(left.height, right.height);
    const canvas = createCanvas(left.width + PANEL_W, h);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b0b0f";
    ctx.fillRect(0, 0, canvas.width, h);
    ctx.drawImage(left, 0, 0);
    ctx.drawImage(right, 0, 0, PANEL_W, right.height, left.width, 0, PANEL_W, right.height);
    fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  } catch {
    fs.copyFileSync(tmpPage, outPath);
  }
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
}

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await ensureUser(admin);

  const pub = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signInData } = await admin.auth.admin.generateLink({ type: "magiclink", email: USER_EMAIL });
  // We'll get session after extension auth flow; also prepare passwordless session via verify OTP URL
  const userDataDir = path.join(ROOT, ".demo-chrome-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: VIEWPORT,
    args: [
      `--disable-extensions-except=${EXT.replace(/\\/g, "/")}`,
      `--load-extension=${EXT.replace(/\\/g, "/")}`,
      "--no-first-run"
    ]
  });

  let background = null;
  for (let i = 0; i < 40; i++) {
    background = context.serviceWorkers().find(w => w.url().includes("chrome-extension://")) || null;
    if (background) break;
    await new Promise(r => setTimeout(r, 400));
  }
  if (!background) throw new Error("Extension service worker not found");
  const extensionId = background.url().split("/")[2];
  console.log("Extension:", extensionId);

  const linearPage = await context.newPage();
  await linearPage.goto(DEMO_URL, { waitUntil: "networkidle", timeout: 90000 });
  await linearPage.waitForTimeout(2000);
  await linearPage.screenshot({ path: path.join(OUT, "01-linear-original.png"), fullPage: false });

  let tabId = await getLinearTabId(background);
  await sendCmd(background, tabId, "toggle");
  await linearPage.waitForTimeout(1200);
  await linearPage.evaluate(() => window.scrollTo(0, 420));

  const headline = linearPage.locator("h1").first();
  await headline.click({ force: true, timeout: 15000 });
  await sendCmd(background, tabId, "context", { action: "edit", value: "Learn design by remixing the live web" });
  await sendCmd(background, tabId, "setStyle", { property: "color", value: "#b8ff37" });
  await sendCmd(background, tabId, "setStyle", { property: "fontSize", value: "60" });

  const signup = linearPage.locator('a[href*="signup"], a:has-text("Sign up")').first();
  if (await signup.count()) {
    await signup.click({ force: true, timeout: 5000 }).catch(() => {});
    await sendCmd(background, tabId, "setStyle", { property: "backgroundColor", value: "#7ce9ff" });
    await sendCmd(background, tabId, "setStyle", { property: "borderRadius", value: "999px" });
  }
  await linearPage.waitForTimeout(800);
  await linearPage.screenshot({ path: path.join(OUT, "02-design-mode-remix.png"), fullPage: false });

  tabId = await getLinearTabId(background);
  await openSidePanel(background, tabId);
  await linearPage.bringToFront();
  await headline.click({ force: true }).catch(() => {});
  await linearPage.waitForTimeout(1500);
  const tmpDir = path.join(OUT, "_tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  await captureCombo(linearPage, context, extensionId, path.join(OUT, "03-sidepanel-editing.png"), tmpDir);

  await signInExtension(context, background, extensionId, admin);
  await linearPage.bringToFront();
  tabId = await getLinearTabId(background);
  await headline.click({ force: true }).catch(() => {});
  await sendCmd(background, tabId, "setStyle", { property: "letterSpacing", value: "0.5px" });
  await linearPage.waitForTimeout(3000);
  await captureCombo(linearPage, context, extensionId, path.join(OUT, "04-cloud-synced.png"), tmpDir);

  const { data: linkData } = await admin.auth.admin.generateLink({ type: "magiclink", email: USER_EMAIL });
  const verifyPage = await context.newPage();
  await verifyPage.goto(linkData.properties.action_link, { waitUntil: "networkidle", timeout: 90000 });
  await verifyPage.waitForTimeout(2000);
  const sessionRes = await pub.auth.getSession();
  let session = sessionRes.data.session;
  if (!session) {
    const cookies = await context.cookies();
    const authCookie = cookies.find(c => c.name.includes("auth-token"));
    if (authCookie) {
      try {
        const parsed = JSON.parse(decodeURIComponent(authCookie.value));
        session = parsed;
      } catch { /* fall through */ }
    }
  }
  if (!session) {
    const { data: pw } = await pub.auth.signInWithOtp({ email: USER_EMAIL, options: { emailRedirectTo: `${APP_URL}/dashboard` } });
    console.warn("Session fallback needed");
  }
  await verifyPage.goto(`${APP_URL}/dashboard`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await verifyPage.waitForTimeout(2000);
  await verifyPage.screenshot({ path: path.join(OUT, "05-dashboard-project.png"), fullPage: false });

  const projectsRes = await fetch(`${APP_URL.replace('3000','8787')}/api/projects`, {
    headers: { Authorization: `Bearer ${(await pub.auth.getSession()).data.session?.access_token || ''}` }
  }).catch(() => null);

  let projectId = null;
  if (projectsRes?.ok) {
    const body = await projectsRes.json();
    projectId = body.projects?.find(p => p.source_url?.includes("linear.app"))?.id;
  }
  if (!projectId) {
    const { data: rows } = await admin.from("projects").select("id").eq("source_url", DEMO_URL).order("updated_at", { ascending: false }).limit(1);
    projectId = rows?.[0]?.id;
  }

  if (projectId) {
    await linearPage.goto(`${DEMO_URL}?tinkr_project=${projectId}`, { waitUntil: "networkidle", timeout: 90000 });
    await linearPage.waitForTimeout(2500);
    tabId = await getLinearTabId(background);
    const state = await background.evaluate(async ({ tabId }) => chrome.tabs.sendMessage(tabId, { type: "TINKR_GET_STATE" }), { tabId });
    if (!state?.active) {
      await sendCmd(background, tabId, "toggle");
      await linearPage.waitForTimeout(1500);
    }
    await linearPage.screenshot({ path: path.join(OUT, "06-reopen-from-cloud.png"), fullPage: false });
  }

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  console.log("Screenshots saved to", OUT);
  await context.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
