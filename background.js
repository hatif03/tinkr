importScripts("tinkr-config.js");

const DEFAULTS = { apiUrl: TINKR_CONFIG.apiUrl, appUrl: TINKR_CONFIG.appUrl };
const SESSION_KEY = "tinkrSession";
const USER_KEY = "tinkrUser";
const CURSOR_COLORS = ["#b8ff37", "#7ce9ff", "#ff9da2", "#c4a1ff", "#ffb347", "#6ee7b7"];

chrome.runtime.onInstalled.addListener(async () => {
  chrome.storage.local.get(DEFAULTS, values => chrome.storage.local.set({ ...DEFAULTS, ...values }));
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function getSession() {
  const data = await chrome.storage.local.get(SESSION_KEY);
  return data[SESSION_KEY] || null;
}

async function setSession(session) {
  if (!session) {
    await chrome.storage.local.remove([SESSION_KEY, USER_KEY]);
    return;
  }
  await chrome.storage.local.set({
    [SESSION_KEY]: session,
    [USER_KEY]: session.user || null
  });
}

async function refreshSessionIfNeeded() {
  const session = await getSession();
  if (!session?.refresh_token) return session;
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  if (Date.now() < expiresAt - 60000) return session;
  const stored = await chrome.storage.local.get("tinkrSupabase");
  const supabaseConfig = stored.tinkrSupabase || {};
  const base = supabaseConfig.supabaseUrl;
  if (!base || !supabaseConfig.anonKey) return session;
  const response = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabaseConfig.anonKey },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });
  if (!response.ok) { await setSession(null); return null; }
  const data = await response.json();
  const next = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: session.user
  };
  await setSession(next);
  return next;
}

async function getAccessToken() {
  const session = await refreshSessionIfNeeded();
  return session?.access_token || null;
}

async function apiRequest(path, init = {}) {
  const { apiUrl } = await chrome.storage.local.get(DEFAULTS);
  const token = await getAccessToken();
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

let presenceTimer = null;
let activeProjectId = null;

function startPresenceLoop(projectId) {
  activeProjectId = projectId;
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = setInterval(async () => {
    if (!activeProjectId) return;
    const result = await apiRequest(`/api/projects/${activeProjectId}/presence`);
    if (result.ok) {
      chrome.tabs.query({}, tabs => tabs.forEach(tab => {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "TINKR_REALTIME", event: { type: "presence", state: result.data.presence } }).catch(() => {});
      }));
    }
  }, 800);
}

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TINKR_AUTH" && message.session) {
    setSession(message.session).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "TINKR_GET_AUTH") {
      const session = await refreshSessionIfNeeded();
      sendResponse({ signedIn: Boolean(session), user: session?.user || null });
      return;
    }
    if (message.type === "TINKR_SIGN_OUT") {
      await setSession(null);
      activeProjectId = null;
      if (presenceTimer) clearInterval(presenceTimer);
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "TINKR_GET_TOKEN") {
      sendResponse({ token: await getAccessToken() });
      return;
    }
    if (message.type === "TINKR_API") {
      const result = await apiRequest(message.path, { method: message.method || "GET", body: message.body ? JSON.stringify(message.body) : undefined });
      if (message.path.includes("/realtime") && result.ok) {
        await chrome.storage.local.set({ tinkrSupabase: { supabaseUrl: result.data.supabaseUrl, anonKey: result.data.anonKey } });
      }
      sendResponse(result);
      return;
    }
    if (message.type === "TINKR_REALTIME_JOIN") {
      startPresenceLoop(message.projectId);
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "TINKR_REALTIME_CURSOR") {
      const session = await refreshSessionIfNeeded();
      if (!session || !message.projectId) return sendResponse({ ok: false });
      const color = CURSOR_COLORS[(session.user?.id || "").charCodeAt(0) % CURSOR_COLORS.length];
      await apiRequest(`/api/projects/${message.projectId}/presence`, {
        method: "POST",
        body: JSON.stringify({ cursor: message.payload, message: message.payload?.message || null, color })
      });
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "TINKR_OPEN_LOGIN") {
      chrome.tabs.create({ url: `${TINKR_CONFIG.appUrl}/login?source=extension&ext_id=${chrome.runtime.id}` });
      sendResponse({ ok: true });
      return;
    }
  })();
  return true;
});

