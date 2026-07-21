const appUrl = TINKR_CONFIG.appUrl;

let pageState = null;
let lastTabId = null;
let fetchGen = 0;
let activeWorkspace = "design";
let activeCanvasTab = "layers";
let loginPollTimer = null;
let pendingDialog = null;

const $ = id => document.getElementById(id);
const tools = $("tools");
const idle = $("idle");
const account = $("account");
const signin = $("signin");
const signout = $("signout");
const reconnect = $("reconnect");
const saveLocalRecovery = $("save-local-recovery");
const useCloudVersion = $("use-cloud-version");
const dashboard = $("dashboard");
const footnote = $("footnote");
const toggle = $("toggle");
const exitMode = $("exit-mode");
const modeLabel = $("mode-label");
const modeBadge = $("mode-badge");
const statusEl = $("status");
const saveState = $("save-state");
const crossTabHint = $("cross-tab-hint");
const panelPort = chrome.runtime.connect({ name: "tinkr-panel" });

const html = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const safeColor = value => {
  const candidate = String(value ?? "").trim();
  return /^(#[0-9a-f]{3,8}|(?:rgb|hsl|oklch)\([0-9.,%\s/+-]+\)|[a-z]+)$/i.test(candidate) ? candidate : "#000000";
};

const plural = (count, singular, pluralLabel = `${singular}s`) => `${count} ${count === 1 ? singular : pluralLabel}`;

function setStatus(message) {
  if (statusEl) statusEl.textContent = message || "";
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function setHidden(id, hidden) {
  $(id)?.classList.toggle("tinkr-hide", Boolean(hidden));
}

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

function updateModeButtons(mode) {
  document.querySelectorAll("[data-mode]").forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
}

function workspaceForState(state) {
  if (state?.tool?.devMode) return "inspect";
  if (state?.tool?.protoMode) return "proto";
  if (state?.panel === "canvas") return activeCanvasTab;
  return state?.panel === "proto" ? "proto" : "design";
}

function setWorkspaceUi(workspace) {
  activeWorkspace = workspace || "design";
  const panel = ["layers", "assets", "components", "variables"].includes(activeWorkspace)
    ? "canvas"
    : activeWorkspace;
  document.querySelectorAll("[data-workspace]").forEach(button => {
    const selected = button.dataset.workspace === activeWorkspace;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".panel").forEach(node => node.classList.add("tinkr-hide"));
  $(`panel-${panel}`)?.classList.remove("tinkr-hide");
  if (panel === "canvas") setCanvasTabUi(activeWorkspace);
}

function setCanvasTabUi(tab) {
  if (!["layers", "assets", "components", "variables"].includes(tab)) return;
  activeCanvasTab = tab;
  document.querySelectorAll("[data-canvas-tab]").forEach(button => {
    const selected = button.dataset.canvasTab === tab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll("[data-canvas-view]").forEach(view => {
    view.classList.toggle("tinkr-hide", view.dataset.canvasView !== tab);
  });

  const details = {
    layers: ["Layers", "Source-backed layers and tinkr-owned visual layers in this remix."],
    assets: ["Assets", "Uploaded, user-owned media that you can safely add to this remix."],
    components: ["Components", "Reusable sanitized layers and component instances for this remix."],
    variables: ["Variables", "Shared visual values that can be applied across compatible selected layers."]
  };
  const [heading, description] = details[tab] || details.layers;
  setText("canvas-heading", heading);
  setText("canvas-description", description);
}

function setModeUi(active) {
  modeBadge.textContent = active ? "On" : "Off";
  modeBadge.classList.toggle("on", active);
  modeBadge.classList.toggle("off", !active);
  modeLabel.textContent = active ? "Design Mode active" : "Ready to remix";
  tools.classList.toggle("tinkr-hide", !active);
  idle.classList.toggle("tinkr-hide", active);
  exitMode.classList.toggle("tinkr-hide", !active);
}

function renderSelectionSummary(selection, state) {
  const selectedLayer = canonicalLayers(state).find(layer => layer.selected);
  const name = selection?.label || selection?.name || selectedLayer?.label || selection?.tag || "No layer selected";
  const type = selection?.type || "None";
  const layout = selection?.parentDisplay || "Click a visible layer on the page.";
  setText("selection-name", name);
  setText("selection-meta", selection ? `${type} · ${layout}` : layout);
  setText("selection-kind", type);
  setText("editability", selection ? (state.stylesEditable === false ? "Read only" : "Editable") : "Choose a layer");
  setText("move-mode-label", state.moveMode === "structural" ? "Reorder layout" : "Visual canvas");
  setHidden("selection-empty", Boolean(selection));
}

function resetPanelUi(reason) {
  pageState = null;
  setModeUi(false);
  updateModeButtons("design");
  setWorkspaceUi("design");
  renderSelectionSummary(null, {});
  $("crumbs").replaceChildren();
  $("presence").replaceChildren();
  $("context").replaceChildren();
  setText("history-count", "0 edits");
  setText("layers-empty", "Your selected source layer and any tinkr-owned vectors, visual copies, and sections will appear here.");
  if (statusEl) statusEl.textContent = reason || "Ready — open a page and enter Design Mode.";
  setHidden("tool-active", true);
  setHidden("cross-tab-hint", true);
  if (saveState) {
    saveState.textContent = "Ready";
    saveState.className = "save-state";
    saveState.title = "";
  }
}

function showCrossTabHint(remoteTabId) {
  if (!crossTabHint) return;
  crossTabHint.replaceChildren();
  const text = document.createElement("span");
  text.textContent = "Design Mode is active on another tab. Return there to edit, or switch now.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Switch to tab";
  button.addEventListener("click", () => chrome.tabs.update(remoteTabId, { active: true }));
  crossTabHint.append(text, button);
  crossTabHint.classList.remove("tinkr-hide");
}

function stopLoginPoll() {
  if (loginPollTimer) {
    clearInterval(loginPollTimer);
    loginPollTimer = null;
  }
}

function startLoginPoll() {
  stopLoginPoll();
  let attempts = 0;
  loginPollTimer = setInterval(async () => {
    attempts += 1;
    await refreshAuth();
    try {
      const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
      if (auth?.signedIn || attempts >= 15) stopLoginPoll();
    } catch {
      if (attempts >= 15) stopLoginPoll();
    }
  }, 2000);
}

function openLogin() {
  chrome.runtime.sendMessage({ type: "TINKR_OPEN_LOGIN" });
  startLoginPoll();
}

async function refreshPanelState() {
  const gen = ++fetchGen;
  const id = await tabId();
  if (!id) {
    resetPanelUi("No active tab.");
    return;
  }
  lastTabId = id;
  const state = await fetchStateForTab(id);
  if (gen !== fetchGen) return;

  if (state?.active) {
    renderFromState(state);
    setHidden("cross-tab-hint", true);
    return;
  }

  const remote = await getDesignTabInfo();
  if (gen !== fetchGen) return;
  if (remote?.tabId && remote.tabId !== id) {
    resetPanelUi("Design Mode is active on another tab.");
    showCrossTabHint(remote.tabId);
    return;
  }

  resetPanelUi(state ? "Design Mode is off on this page — enter again to resume editing." : "Reload the page if tinkr tools do not appear.");
}

function renderCrumbs(selection) {
  const crumbs = $("crumbs");
  crumbs.replaceChildren();
  const items = selection?.crumbs || [];
  items.forEach((crumb, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "crumb";
    button.dataset.crumb = String(crumb.index ?? index);
    button.textContent = crumb.label || crumb.tag || "Layer";
    button.title = `Select ${button.textContent}`;
    button.addEventListener("click", () => {
      send("selectCrumb", { index: Number(button.dataset.crumb) }).catch(() => setStatus("Could not select that parent layer."));
    });
    crumbs.append(button);
  });
}

function renderPresence(presence) {
  const root = $("presence");
  root.replaceChildren();
  (presence || []).forEach(person => {
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.style.background = person.color || "#7ce9ff";
    const name = person.email || person.name || "tinkr collaborator";
    avatar.textContent = name[0]?.toUpperCase() || "?";
    avatar.title = name;
    avatar.setAttribute("aria-label", name);
    root.append(avatar);
  });
}

function renderPropertyControls(state) {
  const selection = state.selection;
  const context = selection?.context || {};
  const hasSelection = Boolean(selection);
  const editable = Boolean(state.stylesEditable);
  document.querySelectorAll("[data-control]").forEach(label => {
    const kind = label.dataset.control;
    const visible = hasSelection && (
      kind === "layout" || kind === "background" ||
      (kind === "text" && context.text) ||
      (kind === "font" && context.text) ||
      (kind === "image" && context.image)
    );
    label.classList.toggle("tinkr-hide", !visible);
  });
  document.querySelectorAll("[data-style]").forEach(input => {
    const value = selection?.styles?.[input.dataset.style];
    if (value !== undefined && value !== null && value !== "") {
      if (input.type !== "color" || /^#[0-9a-f]{6}$/i.test(String(value))) input.value = value;
    } else if (input.type !== "color") {
      input.value = "";
    }
    input.disabled = !editable;
    input.title = editable ? "" : (state.stylesHint || "Select an editable layer on the page.");
  });
  const fontSelect = $("local-fonts");
  if (fontSelect) {
    fontSelect.disabled = !editable || !context.text;
    fontSelect.title = fontSelect.disabled ? (state.stylesHint || "Select editable text to change its font.") : "";
  }
  setText("property-hint", hasSelection
    ? (state.stylesHint || (editable ? "Changes create reversible tinkr patches." : "This selection is currently read only."))
    : "Select a layer to edit its visual properties.");
}

function contextButton(action, label, extraClass = "") {
  return `<button type="button" data-context="${html(action)}" class="${html(extraClass)}">${html(label)}</button>`;
}

function renderContext(state) {
  const root = $("context");
  const selection = state.selection;
  if (!selection) {
    root.replaceChildren();
    return;
  }
  const mode = state.moveMode === "structural" ? "source layout" : "visual canvas";
  const selectType = html(selection.type || "Layer");
  const parent = html(selection.parentDisplay || "source page");
  const pickHint = state.layerPick
    ? `<p class="arrange-pick-hint">Click another layer on the page to place this selection ${html(state.layerPick)} it. Press Escape to cancel.</p>`
    : "";
  const textActions = selection.context?.text
    ? `${contextButton("edit", "Edit text")}${contextButton("upper", "Uppercase")}`
    : "";
  const imageActions = selection.context?.image
    ? `${contextButton("cover", "Crop: cover")}${contextButton("contain", "Contain")}${contextButton("alt", "Edit alt text")}`
    : "";
  const proxyAction = !selection.proxy ? contextButton("visual-copy", "Create visual copy") : "";
  root.innerHTML = `
    <p class="context-title">${selectType} <span class="muted">· ${parent}</span></p>
    ${pickHint}
    <p class="arrange-title">Arrange · ${html(mode)}</p>
    <div class="arrange-grid">
      ${contextButton("move-visual", "Free move", state.moveMode !== "structural" ? "active" : "")}
      ${contextButton("move-structural", "Reorder layout", state.moveMode === "structural" ? "active" : "")}
      ${contextButton("front", "Bring to front")}
      ${contextButton("forward", "Bring forward")}
      ${contextButton("backward", "Send backward")}
      ${contextButton("back", "Send to back")}
      ${contextButton("above", "Place above", state.layerPick === "above" ? "active" : "")}
      ${contextButton("below", "Place below", state.layerPick === "below" ? "active" : "")}
    </div>
    <div class="context-actions">
      ${proxyAction}
      ${textActions}
      ${imageActions}
      ${contextButton("copy-style", "Copy style")}
      ${contextButton("paste-style", "Paste style")}
      ${contextButton("extract-tokens", "Extract variables")}
      ${contextButton("make-component", "Make component")}
      ${contextButton("ready", "Ready for build")}
      ${contextButton("note", "Add note")}
    </div>`;
  root.querySelectorAll("[data-context]").forEach(button => button.addEventListener("click", () => runContextAction(button.dataset.context)));
}

function renderStyleLibraries(state) {
  const textRoot = $("text-styles");
  const colorRoot = $("color-styles");
  textRoot.innerHTML = (state.styles?.text || []).map(style =>
    `<button type="button" class="style-chip" data-apply-text="${html(style.id)}">${html(style.name)}</button>`).join("") || "<span class=\"muted\">No text styles yet.</span>";
  colorRoot.innerHTML = (state.styles?.colors || []).map(color =>
    `<button type="button" class="style-chip color" data-apply-color="${html(color.id)}" style="--swatch:${html(safeColor(color.value))}"><span></span>${html(color.name)}</button>`).join("") || "<span class=\"muted\">No color styles yet.</span>";
  textRoot.querySelectorAll("[data-apply-text]").forEach(button => button.addEventListener("click", () => send("context", { action: "apply-text-style", value: button.dataset.applyText }).catch(() => setStatus("Could not apply text style."))));
  colorRoot.querySelectorAll("[data-apply-color]").forEach(button => button.addEventListener("click", () => send("context", { action: "apply-color-style", value: button.dataset.applyColor }).catch(() => setStatus("Could not apply color style."))));
}

function fallbackLayers(state) {
  const layers = [];
  (state.visualLayers || []).forEach((layer, index) => layers.push({
    id: layer.id, kind: "proxy", label: layer.name || "Visual copy", type: "Visual layer", order: index,
    visible: layer.visible !== false, locked: Boolean(layer.locked), selected: layer.id === state.selectedProxyId, zIndex: layer.zIndex
  }));
  (state.vectorLayers || []).forEach((layer, index) => layers.push({
    id: layer.id, kind: "vector", label: layer.name || layer.type || "Vector", type: "Vector", order: index,
    visible: layer.visible !== false, locked: Boolean(layer.locked), selected: layer.id === state.selectedVectorId
  }));
  (state.sections || []).forEach((section, index) => layers.push({ id: section.id, kind: "section", label: section.label, type: "Section", order: index, visible: true, selected: false }));
  return layers;
}

function canonicalLayers(state) {
  return Array.isArray(state.layers) ? state.layers : fallbackLayers(state);
}

function layerIcon(layer) {
  const kind = String(layer.kind || layer.type || "").toLowerCase();
  if (kind.includes("vector")) return "◇";
  if (kind.includes("proxy") || kind.includes("visual")) return "▣";
  if (kind.includes("section")) return "▤";
  if (kind.includes("image")) return "▧";
  if (kind.includes("text")) return "T";
  return "□";
}

function renderLayers(state) {
  const root = $("layers");
  const layers = canonicalLayers(state);
  root.innerHTML = layers.map(layer => {
    const label = layer.label || layer.name || layer.tag || "Layer";
    const status = [layer.locked ? "Locked" : "", layer.visible === false ? "Hidden" : ""].filter(Boolean).join(" · ");
    const detail = layer.type || layer.kind || "Layer";
    const selected = Boolean(layer.selected);
    const depth = Math.max(0, Number(layer.depth) || 0);
    const kind = String(layer.kind || "").toLowerCase();
    const reorderable = kind === "proxy" || kind === "visual" || kind === "vector";
    return `<li class="layer-row ${selected ? "selected" : ""}" style="--layer-depth:${depth}" ${reorderable ? `draggable="true" data-layer-drag="${html(layer.id)}" data-layer-kind="${html(kind === "visual" ? "proxy" : kind)}" title="Drag to reorder this tinkr-owned layer"` : ""}>
      <button type="button" class="layer-name" data-layer-select="${html(layer.id)}" title="Select ${html(label)}">${layerIcon(layer)} ${html(label)}</button>
      <span class="layer-meta" title="${html(status || detail)}">${html(status || detail)}</span>
    </li>`;
  }).join("");
  setHidden("layers-empty", layers.length > 0);
  setText("canvas-count", plural(layers.length, "item"));
  root.querySelectorAll("[data-layer-select]").forEach(button => button.addEventListener("click", () => {
    const layer = layers.find(item => String(item.id) === button.dataset.layerSelect);
    if (layer) selectCanonicalLayer(layer);
  }));
  let dragging = null;
  root.querySelectorAll("[data-layer-drag]").forEach(row => {
    row.addEventListener("dragstart", event => {
      dragging = { id: row.dataset.layerDrag, kind: row.dataset.layerKind };
      event.dataTransfer?.setData("text/plain", JSON.stringify(dragging));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      dragging = null;
      root.querySelectorAll(".is-drop-target,.is-dragging").forEach(item => item.classList.remove("is-drop-target", "is-dragging"));
    });
    row.addEventListener("dragover", event => {
      if (!dragging || dragging.id === row.dataset.layerDrag || dragging.kind !== row.dataset.layerKind) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      row.classList.add("is-drop-target");
    });
    row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
    row.addEventListener("drop", event => {
      event.preventDefault();
      row.classList.remove("is-drop-target");
      if (!dragging || dragging.id === row.dataset.layerDrag || dragging.kind !== row.dataset.layerKind) return;
      send("reorderOwnedLayers", { id: dragging.id, kind: dragging.kind, targetId: row.dataset.layerDrag, targetKind: row.dataset.layerKind })
        .catch(() => setStatus("Could not reorder that layer."));
    });
  });
}

function selectCanonicalLayer(layer) {
  const kind = String(layer.kind || "").toLowerCase();
  if (kind === "proxy" || kind === "visual") {
    send("selectProxy", { id: layer.id }).catch(() => setStatus("Could not select the visual layer."));
    return;
  }
  if (kind === "vector") {
    send("selectVector", { id: layer.id }).catch(() => setStatus("Could not select the vector layer."));
    return;
  }
  if (kind === "section") {
    send("scrollSection", { id: layer.id }).catch(() => setStatus("Could not jump to that section."));
    return;
  }
  // `selectLayer` is intentionally capability-safe: older content scripts return
  // their current state, while newer ones can resolve selector + fingerprint.
  send("selectLayer", { id: layer.id, selector: layer.selector, target: layer.target }).catch(() => setStatus("Could not select that source layer."));
}

function renderSections(state) {
  const root = $("sections");
  const sections = state.sections || [];
  root.innerHTML = sections.map(section => `<li><button type="button" data-section="${html(section.id)}">${html(section.label || "Section")}</button></li>`).join("") || "<li>No sections yet.</li>";
  root.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => send("scrollSection", { id: button.dataset.section }).catch(() => setStatus("Could not jump to that section."))));
}

function renderAssets(state) {
  const root = $("assets-list");
  const assets = state.assets || [];
  root.innerHTML = assets.map(asset => {
    const stateLabel = asset.syncState === "uploading" ? "Uploading" : asset.syncState === "cloud" ? "Cloud" : asset.syncError ? "Local \u00b7 retry later" : "Local";
    const available = Boolean(asset.localDataUrl || asset.href);
    return `<li class="canvas-item"><span title="${html(asset.name)} \u00b7 ${html(stateLabel)}">${html(asset.name || "Untitled asset")} <small class="asset-status">${html(stateLabel)}</small></span><button type="button" data-asset-insert="${html(asset.id)}"${available ? "" : " disabled title=\"Reconnect to load this asset\""}>Insert</button></li>`;
  }).join("");
  setHidden("assets-empty", assets.length > 0);
  root.querySelectorAll("[data-asset-insert]").forEach(button => button.addEventListener("click", () => send("insertAssetById", { id: button.dataset.assetInsert }).catch(() => setStatus("Could not insert that asset."))));
}

function renderComponents(state) {
  const root = $("components-list");
  const components = state.components || [];
  root.innerHTML = components.map(component => `<li class="canvas-item"><span title="${html(component.name)}">${html(component.name || "Component")}</span><button type="button" data-component-insert="${html(component.id)}">Insert</button></li>`).join("");
  setHidden("components-empty", components.length > 0);
  root.querySelectorAll("[data-component-insert]").forEach(button => button.addEventListener("click", () => send("insertComponentById", { id: button.dataset.componentInsert }).catch(() => setStatus("Could not insert that component."))));
}

function renderVariables(state) {
  const root = $("variables-list");
  const variables = state.variables || [];
  root.innerHTML = variables.map(variable => `<li class="canvas-item"><span title="${html(variable.type)}">${html(variable.name || "Variable")} · ${html(variable.value || "")}</span><button type="button" data-variable-apply="${html(variable.id)}">Apply</button></li>`).join("");
  setHidden("variables-empty", variables.length > 0);
  root.querySelectorAll("[data-variable-apply]").forEach(button => button.addEventListener("click", () => send("applyVariable", { id: button.dataset.variableApply }).catch(() => setStatus("Could not apply that variable."))));

  const tokenRoot = $("token-list");
  tokenRoot.innerHTML = "";
  Object.entries(state.tokens || {}).forEach(([key, value]) => {
    const label = document.createElement("label");
    label.textContent = key;
    const input = document.createElement("input");
    input.dataset.token = key;
    input.value = value;
    input.addEventListener("change", () => send("setToken", { key, value: input.value }).catch(() => setStatus("Could not update that page token.")));
    label.append(input);
    tokenRoot.append(label);
  });
}

function renderPrototype(state) {
  const protoRoot = $("proto-list");
  const motionRoot = $("motion-list");
  const links = state.prototypeLinks || [];
  const motion = state.motion || [];
  protoRoot.innerHTML = links.map(link => `<li>${html(link.label || "Hotspot")} → ${html(link.target || "target")}</li>`).join("") || "<li>No prototype links yet.</li>";
  motionRoot.innerHTML = motion.map(item => `<li>${html(item.selector || item.targetId || "Layer")} · ${html(item.property || "opacity")} ${html(item.duration || "")}</li>`).join("") || "<li>No motion keyframes yet.</li>";
}

function renderSync(state) {
  const sync = state.sync || { state: state.signedIn ? "saved" : "local" };
  const labels = {
    saving: "Saving",
    saved: "Saved",
    offline: "Offline",
    signin: "Sign in again",
    conflict: "Conflict",
    too_large: "Draft too large",
    error: "Needs attention",
    local: "Local"
  };
  let label = labels[sync.state] || "Local";
  if (sync.state === "error" && /view.?only|editor_required/i.test(sync.error || "")) label = "View only";
  const warning = ["offline", "signin", "conflict", "too_large", "error"].includes(sync.state);
  saveState.textContent = label;
  saveState.className = `save-state ${warning ? "warning" : sync.state === "saving" ? "saving" : sync.state === "saved" ? "saved" : ""}`;
  saveState.title = sync.error || state.status || "";
  setHidden("reconnect", !(state.active && sync.state === "signin"));
  const hasRecovery = Boolean(state.active && sync.state === "conflict" && sync.hasLocalRecovery);
  setHidden("save-local-recovery", !hasRecovery);
  setHidden("use-cloud-version", !hasRecovery);
}

function renderAi(state) {
  const previewEl = $("preview");
  const applyButton = document.querySelector('[data-action="apply"]');
  if (state.preview) {
    previewEl.textContent = JSON.stringify(state.preview, null, 2);
    previewEl.classList.remove("tinkr-hide");
    applyButton.disabled = false;
  } else {
    previewEl.textContent = "";
    previewEl.classList.add("tinkr-hide");
    applyButton.disabled = true;
  }
  const generate = document.querySelector('[data-action="generate"]');
  const cancel = document.querySelector('[data-action="cancel-generate"]');
  const unavailable = state.ai?.capabilities?.configured === false;
  generate.disabled = Boolean(state.ai?.pending) || unavailable || !state.selection;
  generate.textContent = state.ai?.pending ? "Preparing preview…" : "Preview patch";
  generate.title = unavailable ? "AI is not configured for this tinkr server." : !state.selection ? "Select a layer before asking AI to edit it." : "";
  cancel.classList.toggle("tinkr-hide", !state.ai?.pending);
}

function renderLab(state) {
  const output = $("lab-output");
  const apply = document.querySelector('[data-action="apply-lab"]');
  if (state.labOutput) {
    output.textContent = state.labOutput;
    output.classList.remove("tinkr-hide");
  } else {
    output.textContent = "";
    output.classList.add("tinkr-hide");
  }
  apply.disabled = !state.labHasOps;
}

function renderFromState(state) {
  if (!state) return;
  pageState = state;
  setModeUi(state.active);
  setHidden("cross-tab-hint", true);
  if (!state.active) return;

  setStatus(state.pinCommentMode ? "Click the page to pin a comment." : state.status || "Use the floating toolbar on the page.");
  const toolActive = $("tool-active");
  if (state.activeToolLabel && state.tool && !state.tool.devMode) {
    toolActive.textContent = state.activeToolLabel;
    toolActive.classList.remove("tinkr-hide");
  } else {
    toolActive.classList.add("tinkr-hide");
  }

  const mode = state.tool?.devMode ? "dev" : state.tool?.protoMode ? "proto" : "design";
  updateModeButtons(mode);
  renderSync(state);
  renderSelectionSummary(state.selection, state);
  renderCrumbs(state.selection);
  renderPresence(state.presence);
  renderPropertyControls(state);
  renderContext(state);
  renderStyleLibraries(state);
  renderLayers(state);
  renderSections(state);
  renderAssets(state);
  renderComponents(state);
  renderVariables(state);
  renderPrototype(state);

  if (state.a11ySnapshot) $("a11y-output").textContent = state.a11ySnapshot;
  else $("a11y-output").textContent = "Select an element for role, label, and contrast.";
  if (state.devOutput) $("dev-output").textContent = state.devOutput;
  else $("dev-output").textContent = "Select an element for Dev Mode specs.";

  const undo = $("btn-undo");
  const redo = $("btn-redo");
  undo.disabled = !state.canUndo;
  undo.textContent = state.canUndo ? `Undo (${state.editCount})` : "Undo";
  redo.disabled = !state.canRedo;
  setText("history-count", plural(state.editCount || 0, "edit"));
  document.querySelectorAll("[data-breakpoint]").forEach(button => button.classList.toggle("active", button.dataset.breakpoint === state.breakpoint));

  renderAi(state);
  renderLab(state);
  setWorkspaceUi(workspaceForState(state));
}

async function refreshAuth() {
  const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
  const idleCopy = idle?.querySelector(".idle-copy");
  if (auth?.signedIn) {
    account.textContent = `Signed in as ${auth.user?.email || auth.user?.name || "tinkr creator"}`;
    signin.textContent = "Manage account";
    signin.classList.remove("tinkr-hide");
    dashboard.classList.remove("tinkr-hide");
    signout.classList.remove("tinkr-hide");
    footnote.textContent = "Changes autosync to your tinkr library while Design Mode is active.";
    if (idleCopy) idleCopy.textContent = "Turn any webpage into a remixable canvas. Select a layer on the page, then refine it here.";
    if (toggle) toggle.textContent = "Enter Design Mode";
  } else {
    account.textContent = "Sign in to edit pages and save remixes.";
    signin.textContent = "Sign in to save and collaborate";
    signin.classList.remove("tinkr-hide");
    dashboard.classList.add("tinkr-hide");
    signout.classList.add("tinkr-hide");
    footnote.textContent = "Design Mode requires a tinkr account.";
    if (idleCopy) idleCopy.textContent = "Sign in to select, remix, and save layers from any webpage.";
    if (toggle) toggle.textContent = "Sign in to start editing";
  }
}

async function loadLocalFonts() {
  const select = $("local-fonts");
  if (!select || !window.querySelectorLocalFonts) return;
  try {
    const fonts = await window.querySelectorLocalFonts();
    const families = [...new Set(fonts.map(font => font.family))].sort();
    select.replaceChildren(new Option("System font picker…", ""), ...families.map(family => new Option(family, family)));
  } catch {
    select.replaceChildren(new Option("Font access denied", ""));
  }
}

async function toggleDesignMode() {
  let auth;
  try {
    auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
  } catch {
    const idleCopy = idle?.querySelector(".idle-copy");
    if (idleCopy) idleCopy.textContent = "Could not verify sign-in — try again.";
    return;
  }
  if (!auth || auth.error) {
    const idleCopy = idle?.querySelector(".idle-copy");
    if (idleCopy) idleCopy.textContent = "Could not verify sign-in — try again.";
    return;
  }
  if (!auth.signedIn) {
    openLogin();
    return;
  }
  try {
    const result = await send("toggle");
    renderFromState(result);
    if (!result?.active) await refreshPanelState();
  } catch {
    setStatus("Reload the page, then try again.");
  }
}

function closePanelDialog() {
  const dialog = $("panel-dialog");
  pendingDialog = null;
  if (dialog?.open) dialog.close();
}

function openPanelDialog(options) {
  const dialog = $("panel-dialog");
  const form = $("panel-dialog-form");
  const input = $("panel-dialog-input");
  const textarea = $("panel-dialog-textarea");
  const label = $("panel-dialog-label");
  const error = $("panel-dialog-error");
  const multiline = Boolean(options.multiline);
  const control = multiline ? textarea : input;

  setText("panel-dialog-eyebrow", options.eyebrow || "TINKR");
  setText("panel-dialog-title", options.title || "Edit");
  setText("panel-dialog-description", options.description || "");
  setText("panel-dialog-label", options.label || "Value");
  setText("panel-dialog-confirm", options.confirmLabel || "Continue");
  error.textContent = "";
  label.classList.toggle("tinkr-hide", Boolean(options.hideField));
  input.classList.toggle("tinkr-hide", multiline || Boolean(options.hideField));
  textarea.classList.toggle("tinkr-hide", !multiline || Boolean(options.hideField));
  input.value = multiline ? "" : (options.value || "");
  textarea.value = multiline ? (options.value || "") : "";
  input.required = !multiline && Boolean(options.required);
  textarea.required = multiline && Boolean(options.required);
  pendingDialog = options;

  form.onsubmit = async event => {
    event.preventDefault();
    const value = options.hideField ? undefined : control.value.trim();
    if (options.required && !value) {
      error.textContent = options.validationMessage || "Enter a value to continue.";
      control.focus();
      return;
    }
    try {
      await options.onConfirm?.(value);
      closePanelDialog();
    } catch {
      error.textContent = "That action could not be completed. Try again.";
    }
  };
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => (options.hideField ? $("panel-dialog-confirm") : control).focus());
}

function runContextAction(action) {
  const inputActions = {
    edit: {
      eyebrow: "TEXT",
      title: "Edit text",
      description: "This updates the selected text as a reversible tinkr patch.",
      label: "Text",
      multiline: true,
      required: true,
      confirmLabel: "Update text"
    },
    alt: {
      eyebrow: "ACCESSIBILITY",
      title: "Image description",
      description: "Describe the image for people using assistive technology.",
      label: "Alt text",
      multiline: true,
      required: true,
      confirmLabel: "Save description"
    },
    note: {
      eyebrow: "COMMENT",
      title: "Add a design note",
      description: "Attach a time-based note to the selected layer.",
      label: "Note",
      multiline: true,
      required: true,
      confirmLabel: "Add note"
    }
  };
  if (inputActions[action]) {
    openPanelDialog({
      ...inputActions[action],
      onConfirm: value => send("context", { action, value })
    });
    return;
  }
  send("context", { action }).catch(() => setStatus("That layer action could not be completed."));
}

function addSectionWithDialog() {
  openPanelDialog({
    eyebrow: "CANVAS SECTION",
    title: "Add a section",
    description: "Sections organize this remix and can mark work ready for build.",
    label: "Section name",
    value: "Section",
    required: true,
    confirmLabel: "Add section",
    onConfirm: label => send("addSection", { label })
  });
}

function resetPageWithDialog() {
  openPanelDialog({
    eyebrow: "RESET REMIX",
    title: "Reset this remix?",
    description: "This restores the source page for this tab. You can reopen an earlier saved project revision later.",
    hideField: true,
    confirmLabel: "Reset page",
    onConfirm: () => send("action", { name: "reset-page" })
  });
}

function showShortcutReference() {
  send("showShortcutReference", { source: "sidepanel" }).catch(() => {});
  openPanelDialog({
    eyebrow: "KEYBOARD",
    title: "tinkr shortcuts",
    description: "V Select · H Hand · K Scale · T Text · R Rectangle · O Ellipse · P Pen · C Comment · Space Hand-pan · Arrow keys Nudge · Shift + Arrow 8px · Ctrl/Command + Z Undo · Escape Cancel or clear selection.",
    hideField: true,
    confirmLabel: "Got it"
  });
}

async function switchWorkspace(workspace) {
  const mapping = {
    design: "design",
    layers: "canvas",
    assets: "canvas",
    components: "canvas",
    variables: "canvas",
    inspect: "inspect",
    proto: "proto"
  };
  if (!mapping[workspace]) return;
  if (["layers", "assets", "components", "variables"].includes(workspace)) activeCanvasTab = workspace;
  setWorkspaceUi(workspace);
  try {
    if (workspace === "design") {
      await send("setProtoMode", { on: false });
      await send("setPanel", { panel: "design" });
    } else if (workspace === "proto") {
      await send("setProtoMode", { on: true });
      await send("setPanel", { panel: "proto" });
  } else if (["layers", "assets", "components", "variables"].includes(workspace)) {
      await send("setProtoMode", { on: false });
      await send("setPanel", { panel: "canvas" });
    } else {
      await send("setPanel", { panel: mapping[workspace] });
    }
  } catch {
    setStatus("Could not change the workspace. Is Design Mode active?");
  }
}

async function setUiMode(mode) {
  try {
    if (mode === "dev") {
      await send("setDevMode", { on: true });
      await send("setPanel", { panel: "inspect" });
    } else if (mode === "proto") {
      await send("setProtoMode", { on: true });
      await send("setPanel", { panel: "proto" });
    } else {
      await send("setProtoMode", { on: false });
      await send("setDevMode", { on: false });
      await send("setPanel", { panel: "design" });
    }
  } catch {
    setStatus("Could not change editor mode. Is Design Mode active?");
  }
}

panelPort.onMessage.addListener(message => {
  if (message.type === "TINKR_AUTH_CHANGED") {
    stopLoginPoll();
    refreshAuth();
    refreshPanelState();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.tinkrSession || changes.tinkrUser)) {
    stopLoginPoll();
    refreshAuth();
    refreshPanelState();
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message.type === "TINKR_PANEL_UPDATE") {
    tabId().then(id => {
      if (id === lastTabId) renderFromState(message.state);
    });
  }
});

chrome.tabs.onActivated.addListener(() => refreshPanelState());
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === "complete" && tab.url?.includes("/auth/extension-callback")) {
    stopLoginPoll();
    refreshAuth();
    refreshPanelState();
  }
  if (info.status === "complete") tabId().then(activeId => { if (activeId === id) refreshPanelState(); });
});

signin.addEventListener("click", openLogin);
reconnect.addEventListener("click", async () => {
  openLogin();
  try {
    await send("refreshAuth", { sync: true });
  } catch {
    // The page content script might not be ready yet.
  }
  refreshPanelState();
});

saveLocalRecovery?.addEventListener("click", async () => {
  try {
    await send("resolveSyncConflict", { action: "branch" });
    setStatus("Saving your local recovery as a new remix.");
  } catch {
    setStatus("Could not save the local recovery. It remains safely stored on this device.");
  }
});

useCloudVersion?.addEventListener("click", async () => {
  try {
    await send("resolveSyncConflict", { action: "cloud" });
    setStatus("Reopened the cloud version.");
  } catch {
    setStatus("Could not reopen the cloud version. Your local recovery remains safe.");
  }
});
dashboard.addEventListener("click", () => chrome.tabs.create({ url: `${appUrl}/dashboard` }));
signout.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "TINKR_SIGN_OUT" });
  stopLoginPoll();
  resetPanelUi("Signed out.");
  refreshAuth();
});
toggle.addEventListener("click", toggleDesignMode);
exitMode.addEventListener("click", toggleDesignMode);

document.querySelectorAll("[data-workspace]").forEach(button => button.addEventListener("click", () => switchWorkspace(button.dataset.workspace)));
document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => setUiMode(button.dataset.mode)));
document.querySelectorAll("[data-canvas-tab]").forEach(button => button.addEventListener("click", () => switchWorkspace(button.dataset.canvasTab)));

document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", async () => {
  const action = button.dataset.action;
  if (action === "shortcuts") { showShortcutReference(); return; }
  if (action === "lab") { $("lab").classList.toggle("tinkr-hide"); return; }
  if (action === "generate") {
    const prompt = $("prompt").value.trim();
    if (!prompt) { setStatus("Describe the selected-layer change you want AI to preview."); return; }
    try { await send("generate", { prompt }); } catch { setStatus("AI preview could not start. Check your connection and selection."); }
    return;
  }
  if (action === "cancel-generate") { send("cancelGenerate").catch(() => setStatus("Could not cancel the AI request.")); return; }
  if (action === "run-lab") { send("runLab", { code: $("lab-code").value, name: $("lab-name").value }).catch(() => setStatus("Code Lab preview could not run.")); return; }
  if (action === "add-section") { addSectionWithDialog(); return; }
  if (action === "layer-picker") {
    send("openLayerPicker", { source: "sidepanel" }).catch(() => {});
    setStatus("Move the pointer over the page and click the exact layer you want to select.");
    return;
  }
  if (action === "reset-page") { resetPageWithDialog(); return; }
  if (action === "export-slice") { send("action", { name: "export-slice" }).catch(() => setStatus("Viewport export failed.")); return; }
  if (action === "copy-css") {
    const text = $("dev-output")?.textContent || "";
    try {
      await navigator.clipboard?.writeText(text);
      setStatus("CSS copied.");
    } catch {
      setStatus("Could not copy CSS.");
    }
    return;
  }
  if (action === "present") { send("setProtoMode", { on: true }).catch(() => setStatus("Could not enter prototype mode.")); return; }
  if (action === "toggle-timeline") { send("toggleTimeline", { source: "sidepanel" }).catch(() => {}); setStatus("Use Motion on the floating toolbar to adjust the timeline."); return; }
  try {
    await send("action", { name: action });
  } catch {
    setStatus("Command failed — is Design Mode on?");
  }
}));

document.querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => send("insertComponent", { kind: button.dataset.add }).catch(() => setStatus("Could not insert that component."))));
document.querySelectorAll("[data-autolayout]").forEach(button => button.addEventListener("click", () => send("autoLayout", { kind: button.dataset.autolayout }).catch(() => setStatus("Could not apply that layout."))));
document.querySelectorAll("[data-breakpoint]").forEach(button => button.addEventListener("click", () => send("setBreakpoint", { breakpoint: button.dataset.breakpoint }).catch(() => setStatus("Could not switch breakpoint."))));
document.querySelectorAll("[data-style]").forEach(input => input.addEventListener("change", () => {
  send("setStyle", { property: input.dataset.style, value: input.value }).catch(() => setStatus("Style change failed — select an editable layer on the page."));
}));
$("asset-upload")?.addEventListener("click", () => send("openAssetPicker").catch(() => setStatus("Could not open the asset picker.")));
$("make-component")?.addEventListener("click", () => send("context", { action: "make-component" }).catch(() => setStatus("Select a layer before making a component.")));
$("variable-create")?.addEventListener("click", () => {
  const name = $("variable-name").value.trim();
  const value = $("variable-value").value.trim();
  if (!name || !value) { setStatus("Variables need a name and a value."); return; }
  send("createVariable", { name, type: $("variable-type").value, value }).then(() => {
    $("variable-name").value = "";
    $("variable-value").value = "";
  }).catch(() => setStatus("Could not create that variable."));
});
$("local-fonts")?.addEventListener("change", event => {
  const family = event.target.value;
  if (family) send("setStyle", { property: "fontFamily", value: family }).catch(() => setStatus("Could not change the font."));
});

$("panel-dialog-close")?.addEventListener("click", closePanelDialog);
$("panel-dialog-cancel")?.addEventListener("click", closePanelDialog);
$("panel-dialog")?.addEventListener("close", () => { pendingDialog = null; });
document.querySelectorAll('[role="tablist"]').forEach(tablist => tablist.addEventListener("keydown", event => {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const current = tabs.indexOf(document.activeElement);
  if (current < 0 || !tabs.length) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
}));
document.addEventListener("keydown", event => {
  const editingField = event.target.matches?.("input, textarea, select, [contenteditable='true']");
  if (!editingField && event.key === "?") {
    event.preventDefault();
    showShortcutReference();
  }
});

refreshAuth();
refreshPanelState();
loadLocalFonts();
