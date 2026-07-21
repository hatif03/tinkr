importScripts("tinkr-config.js");

const DEFAULTS = { apiUrl: TINKR_CONFIG.apiUrl, appUrl: TINKR_CONFIG.appUrl };
const SESSION_KEY = "tinkrSession";
const USER_KEY = "tinkrUser";
const SESSION_RECONCILE_ALARM = "tinkr-session-reconcile";
const SESSION_RECHECK_MS = 3 * 60 * 1000;
const PRESENCE_POLL_MS = 3_000;
const API_REQUEST_TIMEOUT_MS = 25_000;
const ASSET_UPLOAD_TIMEOUT_MS = 45_000;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const CURSOR_COLORS = ["#b8ff37", "#7ce9ff", "#ff9da2", "#c4a1ff", "#ffb347", "#6ee7b7"];
const activeApiRequests = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  chrome.storage.local.get(DEFAULTS, values => chrome.storage.local.set({ ...DEFAULTS, ...values }));
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.alarms.create(SESSION_RECONCILE_ALARM, { periodInMinutes: 1 });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.alarms.create(SESSION_RECONCILE_ALARM, { periodInMinutes: 1 });

async function getSession() {
  const data = await chrome.storage.local.get(SESSION_KEY);
  return data[SESSION_KEY] || null;
}

async function setSession(session) {
  if (!session) {
    await chrome.storage.local.remove([SESSION_KEY, USER_KEY]);
    return;
  }
  const next = {
    ...session,
    tinkr_refresh_after: Number(session.tinkr_refresh_after) || Date.now() + SESSION_RECHECK_MS
  };
  await chrome.storage.local.set({
    [SESSION_KEY]: next,
    [USER_KEY]: next.user || null
  });
}

async function refreshSessionIfNeeded(force = false) {
  const session = await getSession();
  if (!session?.refresh_token) return session;
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  const refreshAfter = Number(session.tinkr_refresh_after) || 0;
  const tokenFresh = !expiresAt || Date.now() < expiresAt - 60000;
  const recheckDue = !refreshAfter || Date.now() >= refreshAfter;
  if (!force && tokenFresh && !recheckDue) return session;
  const stored = await chrome.storage.local.get("tinkrSupabase");
  const supabaseConfig = stored.tinkrSupabase || {};
  const base = supabaseConfig.supabaseUrl;
  if (!base || !supabaseConfig.anonKey) return session;
  try {
    const response = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: supabaseConfig.anonKey },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        await setSession(null);
        await notifyAuthChanged();
        return null;
      }
      return session;
    }
    const data = await response.json();
    const next = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: session.user,
      tinkr_refresh_after: Date.now() + SESSION_RECHECK_MS
    };
    await setSession(next);
    return next;
  } catch {
    return session;
  }
}

async function getAccessToken() {
  const session = await refreshSessionIfNeeded();
  return session?.access_token || null;
}

async function revokeRemoteSession(session) {
  if (!session?.access_token) return false;
  const stored = await chrome.storage.local.get("tinkrSupabase");
  const config = stored.tinkrSupabase || {};
  const base = config.supabaseUrl?.replace(/\/$/, "");
  if (!base || !config.anonKey) return false;
  try {
    const response = await fetch(`${base}/auth/v1/logout?scope=global`, {
      method: "POST",
      headers: { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}` }
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function apiRequest(path, init = {}) {
  const { apiUrl } = await chrome.storage.local.get(DEFAULTS);
  const token = await getAccessToken();
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const requestId = init.requestId ? String(init.requestId) : "";
  if (requestId) activeApiRequests.set(requestId, controller);
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);

  // Keep this transport cancellable for future callers without allowing a caller
  // to bypass the bounded background-request timeout.
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener?.("abort", abortFromCaller, { once: true });
  if (init.signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${apiUrl}${path}`, { ...init, headers, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await setSession(null);
      await notifyAuthChanged();
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (timedOut) {
      return {
        ok: false,
        status: 408,
        data: {
          error: "Request timed out. Please try again.",
          code: "REQUEST_TIMEOUT",
          retryable: true
        }
      };
    }
    return {
      ok: false,
      status: 0,
      data: {
        error: error?.message || "Network request failed",
        code: "NETWORK_ERROR",
        retryable: true
      }
    };
  } finally {
    clearTimeout(timeoutId);
    init.signal?.removeEventListener?.("abort", abortFromCaller);
    if (requestId && activeApiRequests.get(requestId) === controller) activeApiRequests.delete(requestId);
  }
}

function assetUploadError(error, code = "ASSET_UPLOAD_FAILED", retryable = true) {
  return { ok: false, status: 0, data: { error, code, retryable } };
}

function dataUrlToBlob(dataUrl, expectedMimeType) {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("The selected asset could not be read.");
  const mimeType = String(match[1] || expectedMimeType || "application/octet-stream").toLowerCase();
  if (!mimeType.startsWith("image/")) throw new Error("Only image assets can be inserted into the tinkr canvas.");
  const encoded = match[3] || "";
  let bytes;
  if (match[2]) {
    const binary = atob(encoded);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(encoded));
  }
  if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error("Assets larger than 8 MB stay local. Choose a smaller image to sync it to tinkr Cloud.");
  return new Blob([bytes], { type: mimeType });
}

async function uploadSignedAsset(uploadUrl, blob, mimeType) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ASSET_UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType, "x-upsert": "true" },
      body: blob,
      signal: controller.signal
    });
    if (response.ok) return { ok: true };
    const data = await response.json().catch(() => ({}));
    return { ok: false, status: response.status, data: { error: data?.message || data?.error || "Storage rejected this asset.", code: "ASSET_STORAGE_UPLOAD_FAILED", retryable: response.status >= 500 } };
  } catch (error) {
    return assetUploadError(controller.signal.aborted ? "Asset upload timed out. The local copy is still safe." : error?.message || "Asset upload failed.");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function uploadAsset(message) {
  const projectId = String(message.projectId || "");
  const assetId = String(message.assetId || "");
  const mimeType = String(message.mimeType || "").toLowerCase();
  const byteSize = Number(message.byteSize || 0);
  if (!projectId || !assetId) return assetUploadError("A project and asset identifier are required.", "ASSET_UPLOAD_INVALID", false);
  if (!mimeType.startsWith("image/")) return assetUploadError("Only image assets can be inserted into the tinkr canvas.", "ASSET_TYPE_UNSUPPORTED", false);
  if (!Number.isFinite(byteSize) || byteSize < 0 || byteSize > MAX_ASSET_BYTES) return assetUploadError("Assets larger than 8 MB stay local. Choose a smaller image to sync it to tinkr Cloud.", "ASSET_TOO_LARGE", false);

  let blob;
  try {
    blob = dataUrlToBlob(message.dataUrl, mimeType);
  } catch (error) {
    return assetUploadError(error?.message || "The selected asset could not be read.", "ASSET_READ_FAILED", false);
  }
  if (blob.size !== byteSize) return assetUploadError("The selected asset changed while it was being uploaded.", "ASSET_SIZE_MISMATCH", false);

  const upload = await apiRequest(`/api/projects/${encodeURIComponent(projectId)}/assets/upload-url`, {
    method: "POST",
    body: JSON.stringify({ assetId, mimeType, byteSize })
  });
  if (!upload.ok) return upload;

  const storage = await uploadSignedAsset(upload.data?.uploadUrl, blob, mimeType);
  if (!storage.ok) return storage;

  return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/assets/complete`, {
    method: "POST",
    body: JSON.stringify({ assetId, path: upload.data?.path, mimeType, byteSize })
  });
}

let presenceTimer = null;
let activeProjectId = null;
let designTabId = null;
let panelPort = null;

chrome.storage.session?.get?.("tinkrDesignTabId").then(data => {
  if (Number.isInteger(data?.tinkrDesignTabId)) designTabId = data.tinkrDesignTabId;
}).catch(() => {});

function setDesignTabId(tabId) {
  designTabId = tabId ?? null;
  chrome.storage.session?.set?.({ tinkrDesignTabId: designTabId }).catch(() => {});
}

async function deactivateTab(tabId, flush = true) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "TINKR_CMD", cmd: "deactivate", payload: { flush } });
  } catch {
    /* tab may be gone */
  }
  if (designTabId === tabId) setDesignTabId(null);
}

async function notifyAuthChanged() {
  try {
    panelPort?.postMessage({ type: "TINKR_AUTH_CHANGED" });
  } catch {
    /* side panel disconnected */
  }
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    chrome.tabs.sendMessage(tab.id, { type: "TINKR_AUTH_CHANGED" }).catch(() => {});
  }
}

function isTinkrAppSender(sender) {
  try {
    const expected = new URL(TINKR_CONFIG.appUrl).origin;
    const candidate = sender?.url || sender?.origin || "";
    return new URL(candidate).origin === expected;
  } catch {
    return false;
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "tinkr-panel") return;
  panelPort = port;
  port.onDisconnect.addListener(() => {
    panelPort = null;
  });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== SESSION_RECONCILE_ALARM) return;
  refreshSessionIfNeeded().catch(() => {});
});

async function captureVisiblePng(windowId) {
  return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}

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
  }, PRESENCE_POLL_MS);
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // `externally_connectable` is a useful first boundary, but validate the
  // actual sender too. A session hand-off must only ever originate from this
  // tinkr web app, never another extension or an arbitrary page.
  if (message?.type === "TINKR_AUTH" && message.session && !isTinkrAppSender(sender)) {
    sendResponse({ ok: false, error: "Session hand-off was rejected because it did not come from the tinkr app." });
    return false;
  }
  if (message?.type === "TINKR_AUTH" && message.session) {
    (async () => {
      await setSession(message.session);
      if (message.supabaseUrl && message.anonKey) {
        await chrome.storage.local.set({ tinkrSupabase: { supabaseUrl: message.supabaseUrl, anonKey: message.anonKey } });
      }
      await notifyAuthChanged();
      sendResponse({ ok: true });
    })();
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const asyncTypes = new Set([
    "TINKR_GET_AUTH", "TINKR_SIGN_OUT", "TINKR_GET_TOKEN", "TINKR_API", "TINKR_CANCEL_API",
    "TINKR_ASSET_UPLOAD",
    "TINKR_REALTIME_JOIN", "TINKR_REALTIME_CURSOR", "TINKR_OPEN_LOGIN",
    "TINKR_DESIGN_ACTIVE", "TINKR_DESIGN_INACTIVE", "TINKR_GET_DESIGN_TAB", "TINKR_CAPTURE_SLICE"
  ]);
  if (!asyncTypes.has(message.type)) return false;

  (async () => {
    try {
      if (message.type === "TINKR_GET_AUTH") {
        let session = null;
        try {
          session = await refreshSessionIfNeeded();
        } catch {
          session = await getSession();
        }
        if (!session) session = await getSession();
        sendResponse({ signedIn: Boolean(session?.access_token), user: session?.user || null });
        return;
      }
      if (message.type === "TINKR_SIGN_OUT") {
        const session = await getSession();
        await revokeRemoteSession(session);
        await setSession(null);
        await chrome.storage.local.remove("tinkrSupabase");
        setDesignTabId(null);
        activeProjectId = null;
        if (presenceTimer) clearInterval(presenceTimer);
        await notifyAuthChanged();
        chrome.tabs.create({ url: `${TINKR_CONFIG.appUrl}/auth/signout`, active: false }).then(tab => {
          if (tab?.id) setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 3000);
        }).catch(() => {});
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "TINKR_GET_TOKEN") {
        sendResponse({ token: await getAccessToken() });
        return;
      }
      if (message.type === "TINKR_CANCEL_API") {
        const controller = activeApiRequests.get(String(message.requestId || ""));
        if (controller) controller.abort();
        sendResponse({ ok: Boolean(controller) });
        return;
      }
      if (message.type === "TINKR_API") {
        const result = await apiRequest(message.path, { method: message.method || "GET", body: message.body ? JSON.stringify(message.body) : undefined, requestId: message.requestId });
        if (message.path.includes("/realtime") && result.ok) {
          await chrome.storage.local.set({ tinkrSupabase: { supabaseUrl: result.data.supabaseUrl, anonKey: result.data.anonKey } });
        }
        sendResponse(result);
        return;
      }
      if (message.type === "TINKR_ASSET_UPLOAD") {
        sendResponse(await uploadAsset(message));
        return;
      }
      if (message.type === "TINKR_REALTIME_JOIN") {
        startPresenceLoop(message.projectId);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "TINKR_REALTIME_CURSOR") {
        const session = await refreshSessionIfNeeded();
        if (!session || !message.projectId) { sendResponse({ ok: false }); return; }
        const color = CURSOR_COLORS[(session.user?.id || "").charCodeAt(0) % CURSOR_COLORS.length];
        await apiRequest(`/api/projects/${message.projectId}/presence`, {
          method: "POST",
          body: JSON.stringify({ cursor: message.payload, message: message.payload?.message || null, color })
        });
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "TINKR_OPEN_LOGIN") {
        const loginUrl = new URL("/login", TINKR_CONFIG.appUrl);
        loginUrl.searchParams.set("source", "extension");
        loginUrl.searchParams.set("ext_id", chrome.runtime.id);
        // This is intentionally not enough to hand a session to an arbitrary
        // extension. In a blank-ID localhost build it selects the manual
        // confirmation path on the web callback; configured releases remain
        // automatic only for their exact allowlisted ID.
        loginUrl.searchParams.set("dev_pair", "1");
        chrome.tabs.create({ url: loginUrl.toString() });
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "TINKR_DESIGN_ACTIVE") {
        setDesignTabId(_sender.tab?.id ?? null);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "TINKR_DESIGN_INACTIVE") {
        if (_sender.tab?.id === designTabId) setDesignTabId(null);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "TINKR_GET_DESIGN_TAB") {
        sendResponse({ tabId: designTabId });
        return;
      }
      if (message.type === "TINKR_CAPTURE_SLICE") {
        const tabId = message.tabId || _sender.tab?.id;
        if (!tabId) { sendResponse({ ok: false, error: "no tab" }); return; }
        const tab = await chrome.tabs.get(tabId);
        const dataUrl = await captureVisiblePng(tab.windowId);
        if (message.download) {
          const filename = message.filename || `tinkr-slice-${Date.now()}.png`;
          await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
        }
        sendResponse({ ok: true, dataUrl });
        return;
      }
      sendResponse({ ok: false, error: "Unhandled message" });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "Background handler failed" });
    }
  })();
  return true;
});
