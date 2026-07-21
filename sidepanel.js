const appUrl = TINKR_CONFIG.appUrl;
let pageState = null;
let lastTabId = null;
let fetchGen = 0;

const $ = id => document.getElementById(id);
const tools = $("tools");
const idle = $("idle");
const account = $("account");
const signin = $("signin");
const signout = $("signout");
const dashboard = $("dashboard");
const footnote = $("footnote");
const toggle = $("toggle");
const exitMode = $("exit-mode");
const modeLabel = $("mode-label");
const modeBadge = $("mode-badge");
const statusEl = $("status");
const saveState = $("save-state");
const crossTabHint = $("cross-tab-hint");

chrome.runtime.connect({ name: "tinkr-panel" });

async function tabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function send(cmd, payload = {}) {
  const id = await tabId();
  if (!id) throw new Error("No active tab");
  return chrome.tabs.sendMessage(id, { type: "TINKR_CMD", cmd, payload });
}

async function fetchStateForTab(id) {
  if (!id) return null;
  try {
    return await chrome.tabs.sendMessage(id, { type: "TINKR_GET_STATE" });
  } catch {
    return null;
  }
}

async function getDesignTabInfo() {
  try {
    return await chrome.runtime.sendMessage({ type: "TINKR_GET_DESIGN_TAB" });
  } catch {
    return { tabId: null };
  }
}

function resetPanelUi(reason) {
  pageState = null;
  setModeUi(false);
  if (statusEl) statusEl.textContent = reason || "Ready — open a page and enter Design Mode.";
  $("tool-active")?.classList.add("tinkr-hide");
  crossTabHint?.classList.add("tinkr-hide");
}

function showCrossTabHint(remoteTabId) {
  if (!crossTabHint) return;
  crossTabHint.classList.remove("tinkr-hide");
  crossTabHint.innerHTML = `Design Mode is active on another tab. Return there to edit, or switch now. <button type="button" id="switch-design-tab">Switch to tab</button>`;
  $("switch-design-tab")?.addEventListener("click", () => {
    chrome.tabs.update(remoteTabId, { active: true });
  }, { once: true });
}

async function refreshPanelState() {
  const gen = ++fetchGen;
  const id = await tabId();
  if (!id) {
    resetPanelUi("No active tab.");
    return;
  }
  lastTabId = id;
  const s = await fetchStateForTab(id);
  if (gen !== fetchGen) return;

  if (s?.active) {
    renderFromState(s);
    crossTabHint?.classList.add("tinkr-hide");
    return;
  }

  const remote = await getDesignTabInfo();
  if (gen !== fetchGen) return;

  if (remote?.tabId && remote.tabId !== id) {
    resetPanelUi("Design Mode is on another tab.");
    showCrossTabHint(remote.tabId);
    return;
  }

  resetPanelUi(s ? "Design Mode is off on this page — enter again to resume editing." : "Reload the page if tinkr tools don't appear.");
}

function setModeUi(active) {
  modeBadge.textContent = active ? "On" : "Off";
  modeBadge.classList.toggle("on", active);
  modeBadge.classList.toggle("off", !active);
  modeLabel.textContent = active ? "Design mode active" : "Ready to remix";
  tools.classList.toggle("tinkr-hide", !active);
  idle.classList.toggle("tinkr-hide", active);
  exitMode.classList.toggle("tinkr-hide", !active);
}

function switchPanel(name) {
  document.querySelectorAll("[data-panel]").forEach(b => b.classList.toggle("active", b.dataset.panel === name));
  document.querySelectorAll(".panel").forEach(p => p.classList.add("tinkr-hide"));
  $(`panel-${name}`)?.classList.remove("tinkr-hide");
  if (name === "design" || name === "canvas") {
    document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === "design"));
  } else if (name === "inspect") {
    document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === "dev"));
  }
  send("setPanel", { panel: name }).catch(() => {});
}

function setUiMode(mode) {
  document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  if (mode === "dev") send("setDevMode", { on: true }).catch(() => {});
  else if (mode === "proto") send("setProtoMode", { on: true }).catch(() => {});
  else send("setDevMode", { on: false }).catch(() => {});
}

function renderFromState(s) {
  if (!s) return;
  pageState = s;
  setModeUi(s.active);
  crossTabHint?.classList.add("tinkr-hide");
  if (!s.active) return;

  statusEl.textContent = s.status || "Use the floating toolbar on the page.";
  const toolActive = $("tool-active");
  if (s.activeToolLabel && s.tool && !s.tool.devMode) {
    toolActive.textContent = s.activeToolLabel;
    toolActive.classList.remove("tinkr-hide");
  } else toolActive.classList.add("tinkr-hide");
  const st = s.status || "";
  const cloudSynced = /synced to tinkr cloud|created cloud project and synced/i.test(st);
  const syncing = /saving draft|saved locally|saving/i.test(st) && !cloudSynced;
  const warning = /failed|offline|reattach|attention|local only/i.test(st);
  const saveLabel = warning ? "Needs attention" : syncing ? "Saving" : cloudSynced ? "Saved" : s.signedIn ? "Signed in" : "Local";
  saveState.textContent = saveLabel;
  saveState.className = `save-state ${warning ? "warning" : syncing ? "saving" : cloudSynced ? "saved" : ""}`;
  if (s.pinCommentMode) statusEl.innerHTML = '<span class="pin-mode">Click the page to pin a comment</span>';

  const uiMode = s.tool?.devMode ? "dev" : s.tool?.protoMode ? "proto" : "design";
  document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === uiMode));

  document.querySelectorAll("[data-breakpoint]").forEach(b => b.classList.toggle("active", b.dataset.breakpoint === s.breakpoint));

  const crumbs = $("crumbs");
  if (s.selection?.crumbs?.length) {
    crumbs.innerHTML = s.selection.crumbs.map(c => `<button class="crumb" data-crumb="${c.index}">${c.tag}</button>`).join("");
    crumbs.querySelectorAll("[data-crumb]").forEach(b => b.onclick = () => send("selectCrumb", { index: Number(b.dataset.crumb) }));
  } else crumbs.innerHTML = "";

  $("presence").innerHTML = (s.presence || []).map(p => `<span class="avatar" style="background:${p.color || "#7ce9ff"}">${(p.email || "?")[0].toUpperCase()}</span>`).join("");

  if (s.selection?.styles) {
    document.querySelectorAll("[data-style]").forEach(input => {
      const v = s.selection.styles[input.dataset.style];
      if (v !== undefined) input.value = v;
    });
  }

  const ctx = $("context");
  if (s.selection) {
    const sel = s.selection;
    const pickHint = s.layerPick ? `<p class="arrange-pick-hint">Click a layer on the page to place ${s.layerPick}.</p>` : "";
    ctx.innerHTML = `<h4>${sel.type} · parent ${sel.parentDisplay}</h4>
      ${pickHint}
      <div class="arrange-title">Arrange · ${s.moveMode === "structural" ? "source layout" : "visual canvas"}</div>
      <div class="arrange-grid"><button data-context="move-visual" class="${s.moveMode !== "structural" ? "active" : ""}">Free move</button><button data-context="move-structural" class="${s.moveMode === "structural" ? "active" : ""}">Reorder layout</button><button data-context="front">Front</button><button data-context="forward">Forward</button><button data-context="backward">Backward</button><button data-context="back">Back</button><button data-context="above" class="${s.layerPick === "above" ? "active" : ""}">Place above</button><button data-context="below" class="${s.layerPick === "below" ? "active" : ""}">Place below</button></div>
      ${!sel.proxy ? '<button data-context="visual-copy">Create visual copy</button>' : ""}
      ${sel.context.text ? '<button data-context="edit">Edit text</button><button data-context="upper">Uppercase</button>' : ""}
      ${sel.context.image ? '<button data-context="cover">Cover</button><button data-context="contain">Contain</button><button data-context="alt">Set alt</button>' : ""}
      <button data-context="copy-style">Copy style</button>
      <button data-context="paste-style">Paste style</button>
      <button data-context="extract-tokens">Extract tokens</button>
      <button data-context="make-component">Make component</button>
      <button data-context="ready">Ready for build</button>
      <button data-context="note">Annotate</button>`;
    ctx.querySelectorAll("[data-context]").forEach(b => b.onclick = () => {
      let value;
      if (b.dataset.context === "edit") value = prompt("Edit text");
      else if (b.dataset.context === "alt") value = prompt("Accessible image description");
      else if (b.dataset.context === "note") value = prompt("Design note");
      if (b.dataset.context === "edit" && value === null) return;
      if (b.dataset.context === "alt" && value === null) return;
      if (b.dataset.context === "note" && !value) return;
      send("context", { action: b.dataset.context, value }).catch(() => {});
    });
  } else ctx.innerHTML = "";

  $("text-styles").innerHTML = (s.styles?.text || []).map(st => `<button class="style-chip" data-apply-text="${st.id}">${st.name}</button>`).join("");
  $("text-styles").querySelectorAll("[data-apply-text]").forEach(b => b.onclick = () => send("context", { action: "apply-text-style", value: b.dataset.applyText }));
  $("color-styles").innerHTML = (s.styles?.colors || []).map(c => `<button class="style-chip color" data-apply-color="${c.id}" style="--swatch:${c.value}"><span></span>${c.name}</button>`).join("");
  $("color-styles").querySelectorAll("[data-apply-color]").forEach(b => b.onclick = () => send("context", { action: "apply-color-style", value: b.dataset.applyColor }));

  const vectorItems = (s.vectorLayers || []).map(v => `<li><button data-vector="${v.id}">${v.type} · ${v.id.slice(0, 8)}</button></li>`).join("");
  const visualItems = (s.visualLayers || []).map(v => `<li class="canvas-item"><span>Visual copy · z ${v.zIndex}</span><button data-proxy="${v.id}">Select</button></li>`).join("");
  $("layers").innerHTML = visualItems + vectorItems || "<li>No canvas layers yet</li>";
  $("layers").querySelectorAll("[data-proxy]").forEach(b => b.onclick = () => send("selectProxy", { id: b.dataset.proxy }));
  $("layers").querySelectorAll("[data-vector]").forEach(b => b.onclick = () => send("selectVector", { id: b.dataset.vector }));

  $("assets-list").innerHTML = (s.assets || []).map(a => `<li class="canvas-item"><span title="${a.name}">${a.name}</span><button data-asset-insert="${a.id}">Insert</button></li>`).join("") || "<li>No uploaded assets</li>";
  $("components-list").innerHTML = (s.components || []).map(c => `<li class="canvas-item"><span>${c.name}</span><button data-component-insert="${c.id}">Insert</button></li>`).join("") || "<li>No saved components</li>";
  $("variables-list").innerHTML = (s.variables || []).map(v => `<li class="canvas-item"><span>${v.name} · ${v.value}</span><button data-variable-apply="${v.id}">Apply</button></li>`).join("") || "<li>No variables yet</li>";
  $("assets-list").querySelectorAll("[data-asset-insert]").forEach(b => b.onclick = () => send("insertAssetById", { id: b.dataset.assetInsert }));
  $("components-list").querySelectorAll("[data-component-insert]").forEach(b => b.onclick = () => send("insertComponentById", { id: b.dataset.componentInsert }));
  $("variables-list").querySelectorAll("[data-variable-apply]").forEach(b => b.onclick = () => send("applyVariable", { id: b.dataset.variableApply }));

  $("sections").innerHTML = (s.sections || []).map(sec => `<li><button data-section="${sec.id}">${sec.label}</button></li>`).join("") || "<li>No sections yet</li>";
  $("sections").querySelectorAll("[data-section]").forEach(b => b.onclick = () => send("scrollSection", { id: b.dataset.section }));

  $("token-list").innerHTML = Object.entries(s.tokens || {}).map(([key, value]) => `<label>${key}<input data-token="${key}" value="${value}" /></label>`).join("");
  $("token-list").querySelectorAll("[data-token]").forEach(input => input.onchange = () => send("setToken", { key: input.dataset.token, value: input.value }));

  $("proto-list").innerHTML = (s.prototypeLinks || []).map(l => `<li>${l.label} → ${l.target}</li>`).join("") || "<li>No prototype links</li>";
  $("motion-list").innerHTML = (s.motion || []).map(m => `<li>${m.selector || m.targetId} · ${m.property} ${m.duration}</li>`).join("") || "<li>No motion keyframes</li>";

  if (s.a11ySnapshot) $("a11y-output").textContent = s.a11ySnapshot;
  if (s.devOutput) $("dev-output").textContent = s.devOutput;

  const undoBtn = $("btn-undo");
  const redoBtn = $("btn-redo");
  if (undoBtn) {
    undoBtn.disabled = !s.canUndo;
    undoBtn.textContent = s.canUndo ? `Undo (${s.editCount})` : "Undo";
  }
  if (redoBtn) redoBtn.disabled = !s.canRedo;

  if (s.preview) {
    $("preview").textContent = JSON.stringify(s.preview, null, 2);
    $("preview").classList.remove("tinkr-hide");
    document.querySelector('[data-action="apply"]').disabled = false;
  }
  if (s.labOutput) {
    $("lab-output").textContent = s.labOutput;
    $("lab-output").classList.remove("tinkr-hide");
    document.querySelector('[data-action="apply-lab"]').disabled = !s.labHasOps;
  }

  const panel = s.tool?.devMode ? "inspect" : (s.panel || "design");
  document.querySelectorAll("[data-panel]").forEach(b => b.classList.toggle("active", b.dataset.panel === panel));
  document.querySelectorAll(".panel").forEach(p => p.classList.add("tinkr-hide"));
  $(`panel-${panel}`)?.classList.remove("tinkr-hide");
}

async function refreshAuth() {
  const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
  if (auth?.signedIn) {
    account.textContent = `Signed in as ${auth.user?.email || auth.user?.name || "tinkr creator"}`;
    signin.textContent = "Manage account";
    signin.classList.remove("tinkr-hide");
    dashboard.classList.remove("tinkr-hide");
    signout.classList.remove("tinkr-hide");
    footnote.textContent = "Changes autosync to your tinkr library when Design Mode is active.";
  } else {
    account.textContent = "Guest mode — local edits only.";
    signin.textContent = "Sign in to save & collaborate";
    signin.classList.remove("tinkr-hide");
    dashboard.classList.add("tinkr-hide");
    signout.classList.add("tinkr-hide");
    footnote.textContent = "Local edits stay on this device until you sign in and sync to tinkr.";
  }
}

async function loadLocalFonts() {
  const select = $("local-fonts");
  if (!select || !window.querySelectorLocalFonts) return;
  try {
    const fonts = await window.querySelectorLocalFonts();
    const families = [...new Set(fonts.map(f => f.family))].sort();
    select.innerHTML = `<option value="">System font picker…</option>${families.map(f => `<option value="${f}">${f}</option>`).join("")}`;
  } catch {
    select.innerHTML = '<option value="">Font access denied</option>';
  }
}

async function toggleDesignMode() {
  try {
    const res = await send("toggle");
    renderFromState(res);
    await refreshPanelState();
  } catch {
    if (statusEl) statusEl.textContent = "Reload the page, then try again.";
    else idle.querySelector(".idle-copy").textContent = "Reload the page, then try again.";
  }
}

refreshAuth();
refreshPanelState();
loadLocalFonts();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.tinkrSession || changes.tinkrUser)) {
    refreshAuth();
    refreshPanelState();
  }
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "TINKR_PANEL_UPDATE") {
    tabId().then(id => {
      if (id === lastTabId) renderFromState(msg.state);
    });
  }
});

chrome.tabs.onActivated.addListener(() => refreshPanelState());
chrome.tabs.onUpdated.addListener((tid, info) => {
  if (info.status === "complete") tabId().then(id => { if (id === tid) refreshPanelState(); });
});

signin.onclick = () => chrome.runtime.sendMessage({ type: "TINKR_OPEN_LOGIN" });
dashboard.onclick = () => chrome.tabs.create({ url: `${appUrl}/dashboard` });
signout.onclick = async () => { await chrome.runtime.sendMessage({ type: "TINKR_SIGN_OUT" }); refreshAuth(); };
toggle.onclick = toggleDesignMode;
exitMode.onclick = toggleDesignMode;

document.querySelectorAll("[data-panel]").forEach(b => b.onclick = () => switchPanel(b.dataset.panel));
document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => setUiMode(b.dataset.mode));

document.querySelectorAll("[data-action]").forEach(b => b.addEventListener("click", async () => {
  const action = b.dataset.action;
  if (action === "lab") { $("lab").classList.toggle("tinkr-hide"); return; }
  if (action === "generate") { await send("generate", { prompt: $("prompt").value.trim() }); return; }
  if (action === "run-lab") { await send("runLab", { code: $("lab-code").value, name: $("lab-name").value }); return; }
  if (action === "add-section") { const label = prompt("Section label", "Hero"); if (label) await send("addSection", { label }); return; }
  if (action === "export-slice") { await send("action", { name: "export-slice" }); return; }
  if (action === "copy-css") {
    const text = $("dev-output")?.textContent || "";
    navigator.clipboard?.writeText(text);
    statusEl.textContent = "CSS copied.";
    return;
  }
  if (action === "present") { await send("setProtoMode", { on: true }); return; }
  if (action === "toggle-timeline") { statusEl.textContent = "Use Motion on floating toolbar for timeline."; return; }
  if (action === "reset-page") { await send("action", { name: "reset-page" }); return; }
  try { await send("action", { name: action }); } catch { statusEl.textContent = "Command failed — is Design Mode on?"; }
}));

document.querySelectorAll("[data-add]").forEach(b => b.onclick = () => send("insertComponent", { kind: b.dataset.add }));
document.querySelectorAll("[data-autolayout]").forEach(b => b.onclick = () => send("autoLayout", { kind: b.dataset.autolayout }));
document.querySelectorAll("[data-breakpoint]").forEach(b => b.onclick = () => send("setBreakpoint", { breakpoint: b.dataset.breakpoint }));
document.querySelectorAll("[data-style]").forEach(input => input.addEventListener("change", () => send("setStyle", { property: input.dataset.style, value: input.value })));

document.querySelectorAll("[data-canvas-tab]").forEach(button => button.onclick = () => {
  const tab = button.dataset.canvasTab;
  document.querySelectorAll("[data-canvas-tab]").forEach(b => b.classList.toggle("active", b.dataset.canvasTab === tab));
  document.querySelectorAll("[data-canvas-view]").forEach(view => view.classList.toggle("tinkr-hide", view.dataset.canvasView !== tab));
});
$("asset-upload")?.addEventListener("click", () => send("openAssetPicker"));
$("make-component")?.addEventListener("click", () => send("context", { action: "make-component" }));
$("variable-create")?.addEventListener("click", () => send("createVariable", {
  name: $("variable-name").value, type: $("variable-type").value, value: $("variable-value").value
}).then(() => { $("variable-name").value = ""; $("variable-value").value = ""; }));
$("local-fonts")?.addEventListener("change", e => {
  const family = e.target.value;
  if (family) send("setStyle", { property: "fontFamily", value: family }).catch(() => {});
});
