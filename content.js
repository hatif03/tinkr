(() => {
  if (window.__tinkrLoaded) return;
  window.__tinkrLoaded = true;

  const TC = () => window.TinkrCanvas;
  const CURSOR_COLORS = ["#b8ff37", "#7ce9ff", "#ff9da2", "#c4a1ff", "#ffb347", "#6ee7b7"];
  const DEFAULT_TOKENS = { "--tinkr-primary": "#b8ff37", "--tinkr-surface": "#13151c", "--tinkr-text": "#f7f7fa", "--tinkr-muted": "#9d9da7", "--tinkr-radius": "12px", "--tinkr-gap": "16px" };
  const DEFAULT_STYLES = {
    text: [
      { id: "desktop", name: "Desktop", fontFamily: "Inter", fontSize: "32px", fontWeight: "700", lineHeight: "1.2" },
      { id: "body", name: "Body", fontFamily: "Inter", fontSize: "16px", fontWeight: "400", lineHeight: "1.5" },
      { id: "cta", name: "CTA", fontFamily: "Inter", fontSize: "14px", fontWeight: "700", lineHeight: "1" }
    ],
    colors: [
      { id: "black", name: "Black", value: "#111111" },
      { id: "gray", name: "Gray", value: "#626672" },
      { id: "white", name: "White", value: "#ffffff" },
      { id: "primary", name: "Primary", value: "#b8ff37" }
    ],
    effects: [{ id: "shadow", name: "Shadow", shadow: "0 8px 24px rgba(0,0,0,0.12)", blur: "0" }]
  };

  const state = {
    active: false, selected: null, hover: null, patches: [], history: [], future: [], clipboard: null, styleClipboard: null,
    drag: null, root: null, breakpoint: "base", observer: null, settleTimer: null, labs: [], pendingLab: null,
    projectId: null, signedIn: false, cloudSyncTimer: null, sections: [], slices: [], tokens: { ...DEFAULT_TOKENS },
    prototypeLinks: [], motion: [], comments: [], presence: [], panel: "design",
    // The source page is never treated as a transformed drawing surface.  The
    // viewport belongs to Tinkr-owned board layers only; Hand uses native page
    // scrolling so fixed/sticky source UI retains its browser behaviour.
    viewport: { scale: 1, x: 0, y: 0 }, vectorLayers: [], selectedVectorId: null, visualLayers: [], selectedProxyId: null,
    styles: JSON.parse(JSON.stringify(DEFAULT_STYLES)), components: [], variables: [], assets: [], assetUploads: new Set(),
    tool: TC()?.createDefaultTool?.() || { group: "move", variant: "select", devMode: false, protoMode: false },
    pinCommentMode: false, originalStyles: new Map(), preview: null, _status: "", labOutput: null, labHasOps: null,
    drawSession: null, panSession: null, scaleSession: null, penNodes: [], penSession: null,
    strokeSession: null, vectorEditMode: "move", timelineOpen: false, presentMode: false, textEdit: null, vectorPress: null, vectorDrag: null, vectorScaleSession: null,
    toolbarCleanup: null, spaceHand: false, toolBeforeSpace: null, onPageHide: null, suppressClick: false,
    moveMode: "visual", activePointerId: null, marquee: null,
    skipPersist: false, layerPick: null, press: null, pickCycle: null, isReplaying: false,
    hydratedFromProject: false, draftVersion: 0,
    // Keep the three editor concerns explicit. Existing fields remain as
    // backwards-compatible aliases while the interaction engine moves to a
    // single, inspectable state model.
    workspaceMode: "design", // design | prototype | dev
    selection: { kind: null, ids: [], primary: null },
    interaction: { kind: "idle", pointerId: null },
    breakpointOverrides: {},
    layerMeta: {},
    overlayFrame: 0,
    vectorRenderDirty: false,
    sync: { state: "local", pendingVersion: 0, syncedVersion: 0, error: null, retry: 0, inFlight: false },
    localConflict: null,
    aiRequest: null, aiCapabilities: null, projectLoadStatus: null, hydrating: false
  };

  function toolStatusLabel() {
    const key = `${state.tool.group}:${state.tool.variant}`;
    return TC().TOOL_LABELS?.[key] || `${state.tool.group} · ${state.tool.variant}`;
  }

  function setInteraction(kind, details = {}) {
    state.interaction = { kind, pointerId: details.pointerId ?? state.activePointerId ?? null, ...details };
  }

  function setWorkspaceMode(mode) {
    const next = ["design", "prototype", "dev"].includes(mode) ? mode : "design";
    state.workspaceMode = next;
    const isDev = next === "dev";
    const isProto = next === "prototype";
    TC().setDevMode(state.tool, isDev);
    TC().setProtoMode(state.tool, isProto);
    state.panel = isDev ? "inspect" : isProto ? "proto" : "design";
    document.body.classList.toggle("tinkr-dev-mode", isDev);
    document.body.classList.toggle("tinkr-proto-mode", isProto);
  }

  function setSelection(kind, primary = null, ids = primary ? [primary] : []) {
    state.selection = { kind, primary, ids: [...new Set(ids.filter(Boolean))] };
  }

  function inkColor(name, fallback) {
    return TC().strokeInk?.(name, fallback) || fallback;
  }

  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "HTML", "BODY"]);
  const legacyStorageKey = () => `tinkr:${location.origin}${location.pathname}`;
  const sourceStorageKey = () => `tinkr:draft:${location.origin}${location.pathname}`;
  const projectStorageKey = (projectId = state.projectId) => `tinkr:project:${projectId}`;
  const outboxStorageKey = (projectId = state.projectId) => `tinkr:outbox:${projectId || `${location.origin}${location.pathname}`}`;
  // A cloud project is authoritative. URL-scoped drafts only hold work that has
  // not been assigned to a project yet, so two remixes of the same site cannot
  // overwrite each other during hydration.
  const storageKey = () => state.projectId ? projectStorageKey() : sourceStorageKey();
  const api = (path, method, body, requestId) => chrome.runtime.sendMessage({ type: "TINKR_API", path, method, body, requestId });
  const LOCAL_ASSET_MAX_BYTES = 8 * 1024 * 1024;

  const isDataAssetUrl = value => typeof value === "string" && value.startsWith("data:");
  const assetHref = asset => asset?.localDataUrl || asset?.href || null;
  const assetMimeType = asset => {
    const fromDataUrl = /^data:([^;,]+)/i.exec(String(asset?.localDataUrl || asset?.href || ""))?.[1];
    const mimeType = String(asset?.mimeType || fromDataUrl || "image/png").toLowerCase();
    return mimeType.startsWith("image/") && mimeType !== "image/*" ? mimeType : "image/png";
  };

  function readAssetAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The selected image could not be read."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  function syncAssetLayerHrefs() {
    let changed = false;
    const byId = new Map(state.assets.map(asset => [asset.id, asset]));
    state.vectorLayers.forEach(layer => {
      if (!layer?.assetId) return;
      const href = assetHref(byId.get(layer.assetId));
      if (href && layer.href !== href) { layer.href = href; changed = true; }
    });
    if (changed && state.active) renderVectorLayer();
    return changed;
  }

  function normalizeAssetReferences() {
    const byHref = new Map();
    state.assets.forEach(asset => {
      if (!asset?.id) return;
      if (!asset.localDataUrl && isDataAssetUrl(asset.href)) asset.localDataUrl = asset.href;
      if (!asset.syncState) asset.syncState = asset.cloud ? "cloud" : "local";
      const href = assetHref(asset);
      if (href) byHref.set(href, asset.id);
    });
    state.vectorLayers.forEach(layer => {
      if (layer?.type === "image" && !layer.assetId && layer.href && byHref.has(layer.href)) layer.assetId = byHref.get(layer.href);
    });
    syncAssetLayerHrefs();
  }

  function cloudAssetRecord(asset) {
    const record = { ...asset };
    // Data/blob URLs are browser-local implementation details. Persisting them
    // inside the cloud draft duplicates the file, leaks it into revisions, and
    // makes a project hit the JSON payload limit before its assets are uploaded.
    delete record.href;
    delete record.localDataUrl;
    delete record.signedUrlExpiresAt;
    delete record.syncError;
    delete record.nextUploadAt;
    if (!record.cloud) record.syncState = "pending";
    return record;
  }

  function cloudDraftPayload(draft = draftPayload()) {
    const assets = Array.isArray(draft.assets) ? draft.assets : [];
    const byHref = new Map();
    assets.forEach(asset => {
      const href = assetHref(asset);
      if (href) byHref.set(href, asset.id);
    });
    const vectorLayers = (draft.vectorLayers || []).map(original => {
      const layer = { ...original };
      const assetId = layer.assetId || byHref.get(layer.href);
      if (assetId) {
        layer.assetId = assetId;
        delete layer.href;
      }
      return layer;
    });
    return { ...draft, assets: assets.map(cloudAssetRecord), vectorLayers };
  }

  async function hydrateProjectAssets() {
    if (!state.projectId || !state.signedIn || navigator.onLine === false) {
      syncAssetLayerHrefs();
      return false;
    }
    const listed = await api(`/api/projects/${encodeURIComponent(state.projectId)}/assets`, "GET");
    if (!listed?.ok) { syncAssetLayerHrefs(); return false; }
    const existing = new Map(state.assets.map(asset => [asset.id, asset]));
    for (const remote of listed.data?.assets || []) {
      const local = existing.get(remote.id) || {};
      existing.set(remote.id, {
        ...local,
        id: remote.id,
        storagePath: remote.storage_path,
        mimeType: remote.mime_type || local.mimeType || "image/*",
        byteSize: Number(remote.byte_size || local.byteSize || 0),
        createdAt: remote.created_at || local.createdAt,
        cloud: true,
        syncState: "cloud"
      });
    }
    state.assets = [...existing.values()];
    await Promise.all(state.assets.filter(asset => asset.cloud || asset.storagePath).map(async asset => {
      if (asset.localDataUrl) return;
      const result = await api(`/api/projects/${encodeURIComponent(state.projectId)}/assets/${encodeURIComponent(asset.id)}/url`, "GET");
      if (!result?.ok || !result.data?.url) return;
      asset.href = result.data.url;
      asset.signedUrlExpiresAt = result.data.expiresAt || null;
      asset.syncState = "cloud";
    }));
    syncAssetLayerHrefs();
    if (state.active) pushPanelState();
    return true;
  }

  async function uploadAssetToCloud(asset) {
    if (!asset?.id || !asset.localDataUrl || !state.projectId || !state.signedIn || navigator.onLine === false) return false;
    if (asset.uploadBlocked || state.assetUploads?.has(asset.id)) return false;
    if (asset.nextUploadAt && Number(asset.nextUploadAt) > Date.now()) return false;
    state.assetUploads ||= new Set();
    state.assetUploads.add(asset.id);
    asset.syncState = "uploading";
    delete asset.syncError;
    pushPanelState();
    try {
      const result = await chrome.runtime.sendMessage({
        type: "TINKR_ASSET_UPLOAD",
        projectId: state.projectId,
        assetId: asset.id,
        mimeType: assetMimeType(asset),
        byteSize: asset.byteSize,
        dataUrl: asset.localDataUrl
      });
      if (!result?.ok) {
        asset.syncState = "local";
        asset.syncError = result?.data?.error || "Could not upload this image. The local copy is still safe.";
        asset.uploadBlocked = result?.data?.retryable === false;
        asset.nextUploadAt = asset.uploadBlocked ? null : Date.now() + 30_000;
        await save();
        status(`Image saved locally. ${asset.syncError}`);
        return false;
      }
      const remote = result.data?.asset || {};
      asset.cloud = true;
      asset.storagePath = remote.storage_path || asset.storagePath;
      asset.mimeType = remote.mime_type || asset.mimeType;
      asset.byteSize = Number(remote.byte_size || asset.byteSize || 0);
      asset.href = result.data?.url || asset.href;
      asset.signedUrlExpiresAt = result.data?.expiresAt || null;
      asset.syncState = "cloud";
      asset.nextUploadAt = null;
      asset.uploadBlocked = false;
      delete asset.syncError;
      syncAssetLayerHrefs();
      queueSave();
      status("Image saved to tinkr Cloud.");
      return true;
    } catch (error) {
      asset.syncState = "local";
      asset.syncError = error?.message || "Could not reach tinkr Cloud. The local copy is still safe.";
      asset.nextUploadAt = Date.now() + 30_000;
      await save();
      status(`Image saved locally. ${asset.syncError}`);
      return false;
    } finally {
      state.assetUploads?.delete(asset.id);
      pushPanelState();
    }
  }

  async function syncPendingAssets() {
    if (!state.projectId || !state.signedIn || navigator.onLine === false) return;
    const pending = state.assets.filter(asset => asset.localDataUrl && !asset.cloud && !asset.uploadBlocked && (!asset.nextUploadAt || Number(asset.nextUploadAt) <= Date.now()));
    for (const asset of pending) await uploadAssetToCloud(asset);
  }

  // A completed draft save and its asset upload are deliberately separate
  // operations. If the draft reached Cloud but the image did not, the durable
  // outbox can have the same version as the cloud draft. Restore only that
  // local binary at an equal version; never use this path to replay patches or
  // overwrite a newer cloud revision.
  function restoreEqualVersionPendingAssets(queued) {
    const localAssets = queued?.draft?.assets;
    if (!Array.isArray(localAssets) || !localAssets.length) return false;
    const assets = new Map(state.assets.map(asset => [asset.id, asset]));
    let restored = false;
    localAssets.forEach(local => {
      if (!local?.id || !local.localDataUrl || local.cloud) return;
      const cloud = assets.get(local.id);
      // A registered cloud asset wins. It no longer needs a browser-local
      // payload, and keeping a stale local copy would only inflate the draft.
      if (cloud?.cloud) return;
      assets.set(local.id, {
        ...(cloud || {}),
        ...local,
        href: local.localDataUrl,
        cloud: false,
        syncState: local.syncState || "local"
      });
      restored = true;
    });
    if (restored) {
      state.assets = [...assets.values()];
      normalizeAssetReferences();
    }
    return restored;
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function operationId(prefix = "op") {
    return `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  }

  function insertIdentity(patch) {
    return patch.operationId || patch.layerId || `legacy-insert-${stableHash(JSON.stringify({ parent: patch.parent || "body", after: patch.after || "", html: patch.html || "" }))}`;
  }

  function reflectProjectInUrl(projectId) {
    try {
      const url = new URL(location.href);
      url.searchParams.set("tinkr_project", projectId);
      history.replaceState(history.state, "", url.toString());
    } catch { /* URL changes are a convenience, never required for a draft */ }
  }

  function normalizePatches(patches) {
    const seenInserts = new Set();
    return (Array.isArray(patches) ? patches : []).flatMap(original => {
      const patch = { ...original };
      if (patch.type !== "insert_html") return [patch];
      patch.operationId = insertIdentity(patch);
      // Broken older drafts can contain the exact same insert patch hundreds of
      // times. Keep one deterministic operation rather than replaying them all.
      if (seenInserts.has(patch.operationId)) return [];
      seenInserts.add(patch.operationId);
      return [patch];
    });
  }

  function normalizedOwnedMarkup(nodeOrHtml) {
    const holder = document.createElement("div");
    if (typeof nodeOrHtml === "string") holder.innerHTML = nodeOrHtml;
    else if (nodeOrHtml) holder.append(nodeOrHtml.cloneNode(true));
    const node = holder.firstElementChild;
    if (!node) return "";
    [node, ...node.querySelectorAll("*")].forEach(item => {
      item.removeAttribute("data-tinkr-op");
      item.removeAttribute("data-tinkr-anchor");
    });
    return node.outerHTML.replace(/\s+/g, " ").trim();
  }

  function repairLegacyInsertedNodes() {
    for (const patch of state.patches) {
      if (patch.type !== "insert_html" || !String(patch.operationId || "").startsWith("legacy-insert-")) continue;
      const desired = normalizedOwnedMarkup(patch.html);
      if (!desired) continue;
      const matches = [...document.querySelectorAll("[data-tinkr-owned]")].filter(node => normalizedOwnedMarkup(node) === desired);
      if (!matches.length) continue;
      matches[0].setAttribute("data-tinkr-op", patch.operationId);
      // The old observer repeatedly replayed one insert operation. Extra exact
      // copies are corruption, not intentional separate layers, so remove them.
      matches.slice(1).forEach(node => node.remove());
    }
  }

  function selectorFor(el) {
    if (el.id && !/^(tinkr-|pm-)/.test(el.id)) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      const testId = node.getAttribute("data-testid");
      if (testId) { parts.unshift(`[data-testid="${CSS.escape(testId)}"]`); break; }
      const tag = node.tagName.toLowerCase();
      const siblings = [...node.parentElement.children].filter(x => x.tagName === node.tagName);
      parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
      node = node.parentElement;
    }
    return `body > ${parts.join(" > ")}`;
  }

  function describe(el) {
    const styles = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      selector: selectorFor(el), tag: el.tagName.toLowerCase(), text: (el.innerText || "").trim().slice(0, 1200),
      html: el.outerHTML.slice(0, 6000), parent: el.parentElement?.tagName.toLowerCase(),
      layout: { width: Math.round(rect.width), height: Math.round(rect.height), display: styles.display, position: styles.position },
      styles: { color: styles.color, backgroundColor: styles.backgroundColor, fontSize: styles.fontSize, fontWeight: styles.fontWeight, padding: styles.padding, borderRadius: styles.borderRadius, gap: styles.gap }
    };
  }

  const textTarget = el => /^(P|SPAN|H1|H2|H3|H4|H5|H6|LI|LABEL|A|BUTTON|DIV)$/i.test(el?.tagName);
  const imageTarget = el => el?.tagName === "IMG" || getComputedStyle(el).backgroundImage !== "none";
  const unsafeTarget = el => /^(IFRAME|CANVAS|VIDEO|AUDIO|EMBED|OBJECT|FORM|INPUT|SELECT|TEXTAREA|OPTION)$/i.test(el?.tagName) || el?.closest("[contenteditable='true'],[data-tinkr-protected]");
  function fingerprint(el) { const r = el.getBoundingClientRect(); return { selector: selectorFor(el), tag: el.tagName.toLowerCase(), stable: ["data-testid","name","aria-label","role"].map(k => [k, el.getAttribute(k)]).filter(([,v]) => v), text: (el.innerText || "").trim().slice(0,160), box: [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)] }; }
  function anchorAt(x, y) { return { scrollX: window.scrollX, scrollY: window.scrollY, x, y, zIndex: nextZ() }; }
  function nextZ() { return (state._z = Math.max(state._z || 1000, ...state.visualLayers.map(layer => Number(layer.zIndex) || 0)) + 1); }
  function rgbToHex(value) { const m = value?.match(/\d+/g); return m?.length >= 3 ? `#${m.slice(0, 3).map(n => Number(n).toString(16).padStart(2, "0")).join("")}` : "#000000"; }

  function cursorState(el) {
    if (state.spaceHand) return state.panSession ? "grabbing" : "hand";
    const toolKey = `${state.tool.group}:${state.tool.variant}`;
    const mapped = TC().CURSOR_BY_TOOL?.[toolKey];
    if (mapped) {
      if (mapped === "hand") return state.panSession ? "grabbing" : "hand";
      if (mapped === "scale" && (state.scaleSession || state.vectorScaleSession)) return "scale";
      if (mapped === "move" && (state.drag || state.vectorDrag)) return "grabbing";
      return mapped;
    }
    if (state.tool.devMode) return "inspect";
    if (state.tool.group === "comment" || state.pinCommentMode) return "comment";
    if (state.drag || state.vectorDrag) return "grabbing";
    if (unsafeTarget(el)) return "locked";
    if (imageTarget(el)) return "image";
    if (textTarget(el) && state.tool.group === "move") return "text";
    return el === state.selected ? "selected" : "move";
  }

  function updateCursor(event, el) {
    const cursor = state.root?.querySelector("#tinkr-cursor"), label = state.root?.querySelector("#tinkr-cursor-label");
    if (!cursor || !label) return;
    cursor.classList.remove("tinkr-hide");
    label.classList.remove("tinkr-hide");
    cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`;
    label.style.left = `${event.clientX}px`; label.style.top = `${event.clientY}px`;
    cursor.className = `tinkr-cursor ${cursorState(el)}`;
    const toolLabel = toolStatusLabel();
    if (state.tool.devMode) label.textContent = "Inspect values · read only";
    else if (state.tool.group === "comment") label.textContent = "Click to pin a comment";
    else if (state.spaceHand || TC().shouldPan(state.tool)) label.textContent = state.panSession ? "Panning canvas" : toolLabel;
    else if (TC().shouldScale(state.tool)) label.textContent = state.selected ? "Drag a handle to scale" : toolLabel;
    else if (state.tool.group === "draw" || TC().isCreationTool(state.tool)) label.textContent = toolLabel;
    else if (unsafeTarget(el)) label.textContent = "Protected content · visual only";
    else if (el) { const s = getComputedStyle(el), r = el.getBoundingClientRect(); label.textContent = `${el.tagName.toLowerCase()} · ${s.display} · ${Math.round(r.width)} × ${Math.round(r.height)}`; }
    if (state.projectId && state.signedIn) {
      clearTimeout(state.cursorTimer);
      state.cursorTimer = setTimeout(() => chrome.runtime.sendMessage({ type: "TINKR_REALTIME_CURSOR", projectId: state.projectId, payload: { scrollX: window.scrollX, scrollY: window.scrollY, clientX: event.clientX, clientY: event.clientY } }), 180);
    }
  }

  function ownedBoardScale() {
    return Math.max(0.25, Math.min(3, Number(state.viewport.scale) || 1));
  }

  function ownedCanvasPoint(clientX, clientY) {
    const scale = ownedBoardScale();
    // Board layers are document-anchored: they follow the webpage as it
    // scrolls, while the SVG/proxy overlay converts them back to viewport space.
    return { x: clientX / scale + window.scrollX, y: clientY / scale + window.scrollY };
  }

  function applyViewport() {
    // Never transform document.body. It breaks source-page fixed/sticky
    // elements and makes live DOM hit testing drift. A board zoom only affects
    // owned proxy/vector layers, while source content keeps browser geometry.
    document.body.classList.remove("tinkr-viewport-mode");
    const scale = ownedBoardScale();
    const transform = scale === 1 ? "" : `scale(${scale})`;
    for (const selector of ["#tinkr-proxy-layer", "#tinkr-vector-layer"]) {
      const layer = state.root?.querySelector(selector);
      if (!layer) continue;
      layer.style.transformOrigin = "0 0";
      layer.style.transform = transform;
    }
    state.vectorRenderDirty = true;
    scheduleOverlayRender();
  }

  function createOverlay() {
    const root = document.createElement("div"); root.id = "tinkr-root";
    root.innerHTML = `<div id="tinkr-cursor" class="tinkr-cursor"></div><div id="tinkr-cursor-label" class="tinkr-cursor-label">Inspect</div>
      <div id="tinkr-overlay" class="tinkr-overlay"></div><div id="tinkr-proxy-layer" class="tinkr-proxy-layer"></div><div id="tinkr-live-cursors"></div><div id="tinkr-pins"></div><div id="tinkr-layer-picker" class="tinkr-layer-picker tinkr-interactive tinkr-hide" data-tinkr-interactive="layer-picker" role="menu" aria-label="Select layer under cursor"></div>
      <div class="tinkr-box" id="tinkr-hover"></div><div class="tinkr-box selected tinkr-hide" id="tinkr-selected"></div><div class="tinkr-box layer-target tinkr-hide" id="tinkr-layer-target"></div><div id="tinkr-insert-indicator" class="tinkr-insert-indicator tinkr-hide"></div><div id="tinkr-marquee" class="tinkr-marquee tinkr-hide"></div>`;
    const sandbox = document.createElement("iframe"); sandbox.src = chrome.runtime.getURL("sandbox.html"); sandbox.style.display = "none"; sandbox.id = "tinkr-sandbox"; root.append(sandbox);
    document.documentElement.append(root); state.root = root;
    const mount = window.TinkrToolbar?.mountToolbar(root, {
      setTool: (g, v) => setTool(g, v),
      toggleDevMode: () => setDevMode(!state.tool.devMode),
      toggleTimeline: () => { state.timelineOpen = !state.timelineOpen; state.root.querySelector("#tinkr-timeline")?.classList.toggle("tinkr-hide", !state.timelineOpen); renderTimeline(); pushPanelState(); },
      enterPresent: () => { state.presentMode = true; setProtoMode(true); document.documentElement.requestFullscreen?.(); pushPanelState(); },
      openResources: () => { state.panel = "design"; status("Resources: use + components in side panel or drag from dashboard."); pushPanelState(); },
      openCommandPalette: () => window.TinkrToolbar?.openCommandPalette?.(root),
      openShortcutReference: () => window.TinkrToolbar?.openShortcutReference?.(root),
      openAI: () => { state.panel = "design"; status("Describe a change in the AI remix field in the side panel."); pushPanelState(); },
      vectorEdit: (action) => runVectorEdit(action),
      undo, redo, deleteSelected: deleteSelected
    });
    state.toolbarCleanup = mount?.cleanup;
    const cursor = root.querySelector("#tinkr-cursor");
    const label = root.querySelector("#tinkr-cursor-label");
    if (cursor && label) root.append(cursor, label);
    const svg = root.querySelector("#tinkr-vector-layer");
    if (svg) { svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%"); }
  }

  function requestTextInput(options, onConfirm) {
    const open = window.TinkrToolbar?.openDialog;
    if (!state.root || typeof open !== "function") {
      status("This action needs the tinkr dialog. Reopen Design Mode and try again.");
      return null;
    }
    return open(state.root, {
      title: options.title || "tinkr",
      label: options.label || "Value",
      value: options.value || "",
      placeholder: options.placeholder || "",
      description: options.description || "",
      confirmLabel: options.confirmLabel || "Save",
      multiline: Boolean(options.multiline),
      allowEmpty: Boolean(options.allowEmpty),
      onConfirm(value) {
        const result = onConfirm(String(value || "").trim());
        if (result === false) return false;
        return true;
      }
    });
  }

  function placeBox(id, el) {
    const box = state.root?.querySelector(id); if (!box) return;
    if (!el) return box.classList.add("tinkr-hide");
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    box.classList.remove("tinkr-hide");
    if (state.tool.variant === "scale" && el === state.selected) renderScaleHandles(r);
    else state.root?.querySelector("#tinkr-scale-handles")?.classList.add("tinkr-hide");
  }

  function selectedProxy() { return state.visualLayers.find(layer => layer.id === state.selectedProxyId) || null; }

  function proxyElement(id = state.selectedProxyId) { return state.root?.querySelector(`[data-tinkr-proxy-id="${CSS.escape(id || "")}"]`) || null; }

  function placeProxyBox(id, layer = selectedProxy()) {
    const box = state.root?.querySelector(id); if (!box) return;
    if (!layer) return box.classList.add("tinkr-hide");
    const scale = ownedBoardScale();
    Object.assign(box.style, { left: `${(layer.x - window.scrollX) * scale}px`, top: `${(layer.y - window.scrollY) * scale}px`, width: `${layer.width * scale}px`, height: `${layer.height * scale}px` });
    box.classList.remove("tinkr-hide");
  }

  function scheduleOverlayRender() {
    if (state.overlayFrame || !state.active) return;
    state.overlayFrame = requestAnimationFrame(() => {
      state.overlayFrame = 0;
      drawOverlay();
      renderPins();
      renderVisualLayers();
      if (state.vectorRenderDirty) renderVectorLayer();
      if (state.selectedVectorId) placeVectorBox(state.vectorLayers.find(layer => layer.id === state.selectedVectorId));
      if (state.workspaceMode === "dev") renderDevOverlay();
    });
  }

  function copyVisualStyles(source, clone) {
    const props = ["boxSizing", "display", "position", "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight", "margin", "padding", "border", "borderRadius", "background", "backgroundColor", "backgroundImage", "backgroundSize", "backgroundPosition", "color", "font", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "textAlign", "textTransform", "textDecoration", "whiteSpace", "overflow", "textOverflow", "boxShadow", "opacity", "objectFit", "objectPosition", "filter", "gap", "flex", "flexDirection", "alignItems", "justifyContent"];
    const apply = (from, to) => { const computed = getComputedStyle(from); props.forEach(prop => { try { to.style[prop] = computed[prop]; } catch { /* unsupported property */ } }); };
    apply(source, clone);
    const sourceNodes = source.querySelectorAll("*"); const cloneNodes = clone.querySelectorAll("*");
    sourceNodes.forEach((node, index) => cloneNodes[index] && apply(node, cloneNodes[index]));
  }

  function renderVisualLayers() {
    const host = state.root?.querySelector("#tinkr-proxy-layer"); if (!host) return;
    const wanted = new Set(state.visualLayers.map(layer => layer.id));
    host.querySelectorAll("[data-tinkr-proxy-id]").forEach(node => {
      if (!wanted.has(node.dataset.tinkrProxyId)) node.remove();
    });
    state.visualLayers.forEach(layer => {
      let node = host.querySelector(`[data-tinkr-proxy-id="${CSS.escape(layer.id)}"]`);
      if (!node) {
        node = document.createElement("div");
        node.dataset.tinkrProxyId = layer.id;
        node.className = "tinkr-visual-proxy";
        host.append(node);
      }
      node.classList.toggle("is-selected", layer.id === state.selectedProxyId || state.selection.ids.includes(`proxy:${layer.id}`));
      node.hidden = layer.visible === false;
      Object.assign(node.style, {
        left: `${layer.x - window.scrollX}px`, top: `${layer.y - window.scrollY}px`,
        width: `${layer.width}px`, height: `${layer.height}px`, zIndex: String(layer.zIndex)
      });
      const htmlHash = stableHash(layer.html || "");
      if (node.dataset.tinkrHtmlHash !== htmlHash) {
        node.innerHTML = layer.html || "";
        node.dataset.tinkrHtmlHash = htmlHash;
      }
    });
    placeProxyBox("#tinkr-selected");
  }

  function renderScaleHandles(rect) {
    const layer = state.root?.querySelector("#tinkr-scale-handles"); if (!layer) return;
    layer.classList.remove("tinkr-hide");
    const pts = ["nw","n","ne","e","se","s","sw","w"];
    const pos = {
      nw: [rect.left, rect.top], n: [rect.left + rect.width / 2, rect.top], ne: [rect.right, rect.top],
      e: [rect.right, rect.top + rect.height / 2], se: [rect.right, rect.bottom], s: [rect.left + rect.width / 2, rect.bottom],
      sw: [rect.left, rect.bottom], w: [rect.left, rect.top + rect.height / 2]
    };
    layer.innerHTML = pts.map(p => `<div class="tinkr-scale-handle" data-handle="${p}" style="left:${pos[p][0]}px;top:${pos[p][1]}px"></div>`).join("");
  }

  function isTinkr(node) {
    if (!node) return false;
    if (node.classList?.contains("tinkr-scale-handle")) return false;
    return node === state.root || state.root?.contains(node);
  }

  function isToolbarTarget(node) {
    if (!node?.closest) return false;
    return Boolean(node.closest("[data-tinkr-interactive], .tinkr-toolbar, .tinkr-vector-toolbar, .tinkr-timeline, .tinkr-tool-menu, .tinkr-scale-handle"));
  }

  function nearestEditableTarget(node) {
    let el = node;
    while (el && (el.nodeType !== 1 || isTinkr(el) || SKIP.has(el.tagName))) el = el?.parentElement;
    if (!el) return null;
    if (!unsafeTarget(el)) return el;
    // Inputs, payments, embeds, and form controls stay protected. Selecting
    // their nearest safe visual wrapper keeps the canvas useful without
    // interacting with live site state.
    let parent = el.parentElement;
    while (parent && (SKIP.has(parent.tagName) || unsafeTarget(parent))) parent = parent.parentElement;
    return parent && !isTinkr(parent) ? parent : el;
  }

  function pageCandidatesAt(x, y) {
    const stack = document.elementsFromPoint?.(x, y) || [document.elementFromPoint(x, y)];
    const candidates = [];
    for (const node of stack) {
      const target = nearestEditableTarget(node);
      if (target && !candidates.includes(target)) candidates.push(target);
    }
    return candidates;
  }

  function pageElementAt(x, y) {
    return pageCandidatesAt(x, y)[0] || null;
  }

  function selectCandidateAt(event) {
    const candidates = pageCandidatesAt(event.clientX, event.clientY);
    if (!candidates.length) return null;
    if (event.altKey) return candidates[0].parentElement && !SKIP.has(candidates[0].parentElement.tagName)
      ? candidates[0].parentElement
      : candidates[0];

    const previous = state.pickCycle;
    const closeEnough = previous && Math.hypot(previous.x - event.clientX, previous.y - event.clientY) < 8;
    const sameStack = closeEnough && previous.candidates?.length === candidates.length && previous.candidates.every((node, index) => node === candidates[index]);
    const nextIndex = sameStack ? (previous.index + 1) % candidates.length : 0;
    state.pickCycle = { x: event.clientX, y: event.clientY, candidates, index: nextIndex };
    return candidates[nextIndex];
  }

  function closeLayerPicker() {
    const menu = state.root?.querySelector("#tinkr-layer-picker");
    if (!menu) return;
    menu.classList.add("tinkr-hide");
    menu.replaceChildren();
  }

  function openLayerPicker(x, y) {
    const menu = state.root?.querySelector("#tinkr-layer-picker");
    if (!menu) return;
    const scale = ownedBoardScale();
    const vectorPoint = ownedCanvasPoint(x, y);
    const owned = [
      ...state.vectorLayers
        .filter(layer => layer.visible !== false && TC().hitTest(layer, vectorPoint.x, vectorPoint.y))
        .reverse()
        .map(layer => ({ type: "vector", label: layer.name || layer.type || "Vector", select: () => selectVector(layer.id) })),
      ...state.visualLayers
        .filter(layer => {
          if (layer.visible === false) return false;
          const left = (layer.x - window.scrollX) * scale, top = (layer.y - window.scrollY) * scale;
          return x >= left && x <= left + layer.width * scale && y >= top && y <= top + layer.height * scale;
        })
        .sort((a, b) => Number(b.zIndex) - Number(a.zIndex))
        .map(layer => ({ type: "visual", label: layer.name || layer.source?.text?.slice(0, 42) || "Visual copy", select: () => selectProxy(layer.id) })),
      ...pageCandidatesAt(x, y).map(candidate => ({ type: candidate.tagName.toLowerCase(), label: layerLabel(candidate), select: () => select(candidate) }))
    ].slice(0, 12);
    if (!owned.length) return status("No editable layers under this cursor.");
    menu.replaceChildren();
    const title = document.createElement("p");
    title.className = "tinkr-layer-picker-title";
    title.textContent = "Select layer under cursor";
    menu.append(title);
    owned.forEach((candidate, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.className = "tinkr-layer-picker-item";
      const tag = document.createElement("span"); tag.textContent = candidate.type;
      const label = document.createElement("small"); label.textContent = candidate.label;
      button.append(tag, label);
      button.addEventListener("click", () => { candidate.select(); closeLayerPicker(); });
      menu.append(button);
      if (index === 0) requestAnimationFrame(() => button.focus({ preventScroll: true }));
    });
    const width = 280;
    Object.assign(menu.style, { left: `${Math.min(x, window.innerWidth - width - 12)}px`, top: `${Math.min(y, window.innerHeight - 160)}px` });
    menu.classList.remove("tinkr-hide");
  }

  function eventOnSelected(event, selected = state.selected) {
    if (!selected) return false;
    const stack = document.elementsFromPoint?.(event.clientX, event.clientY) || [];
    return stack.some(node => node === selected || selected.contains(node));
  }

  function beginLayerDrag(el, event, flow) {
    const before = snapshot(el);
    const rect = el.getBoundingClientRect();
    const drag = {
      el, before, flow, parent: el.parentElement, originalNext: el.nextElementSibling, selector: selectorFor(el),
      x: event.clientX, y: event.clientY,
      grabOffsetX: event.clientX - rect.left,
      grabOffsetY: event.clientY - rect.top
    };
    if (flow) return drag;
    if (requiresVisualProxy(el)) {
      // A proxy is an implementation detail until the user actually drops the
      // layer somewhere. Creating it eagerly makes the drag feel immediate,
      // but it must not become a saved edit when the gesture is cancelled.
      const existing = proxyForSource(el);
      const layer = existing || createVisualProxyFor(el, { record: false });
      state.selected = null;
      state.selectedProxyId = layer.id;
      setSelection("proxy", layer.id);
      renderVisualLayers();
      return { kind: "proxy", layer, before: { ...layer }, x: event.clientX, y: event.clientY, promoted: !existing, source: el };
    }
    const prepared = prepareVisualLayer(el);
    drag.mode = "visual";
    drag.before = prepared.before;
    drag.baseTranslate = prepared.translate;
    drag.startZIndex = prepared.zIndex;
    return drag;
  }

  function beginProxyDrag(layer, event) { return { kind: "proxy", layer, before: { ...layer }, x: event.clientX, y: event.clientY }; }
  function capturePointer(event) {
    if (event.pointerId == null) return;
    state.activePointerId = event.pointerId;
    state.interaction.pointerId = event.pointerId;
    try { document.documentElement.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  }
  function releasePointer(event) {
    const pointerId = event?.pointerId ?? state.activePointerId;
    if (pointerId != null) { try { document.documentElement.releasePointerCapture(pointerId); } catch { /* already released */ } }
    state.activePointerId = null;
    setInteraction("idle");
  }

  function commitLayerDrag(d) {
    return d;
  }

  function getDevOutput() {
    if (!state.selected) return "Select an element for Dev Mode specs.";
    if (!state.originalStyles.has(state.selected)) state.originalStyles.set(state.selected, { style: state.selected.getAttribute("style") || "" });
    const spec = TC().buildDevSpec(state.selected, selectorFor, state.originalStyles.get(state.selected)?.style || "");
    return TC().formatDevSpec(spec);
  }

  function getDevSpec() {
    if (!state.selected) return null;
    if (!state.originalStyles.has(state.selected)) state.originalStyles.set(state.selected, { style: state.selected.getAttribute("style") || "" });
    return TC().buildDevSpec(state.selected, selectorFor, state.originalStyles.get(state.selected)?.style || "");
  }

  function renderDevOverlay() {
    const layer = state.root?.querySelector("#tinkr-dev-overlay"); if (!layer) return;
    if (!state.tool.devMode) { layer.classList.add("tinkr-hide"); layer.innerHTML = ""; return; }
    layer.classList.remove("tinkr-hide");
    const el = state.selected || state.hover;
    if (!el || isTinkr(el)) { layer.innerHTML = ""; return; }
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    const pad = { t: parseFloat(s.paddingTop)||0, r: parseFloat(s.paddingRight)||0, b: parseFloat(s.paddingBottom)||0, l: parseFloat(s.paddingLeft)||0 };
    const mar = { t: parseFloat(s.marginTop)||0, r: parseFloat(s.marginRight)||0, b: parseFloat(s.marginBottom)||0, l: parseFloat(s.marginLeft)||0 };
    layer.innerHTML = `
      <div class="tinkr-dev-box" style="left:${r.left - mar.l}px;top:${r.top - mar.t}px;width:${r.width + mar.l + mar.r}px;height:${r.height + mar.t + mar.b}px"></div>
      <div class="tinkr-dev-padding" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-width:${pad.t}px ${pad.r}px ${pad.b}px ${pad.l}px"></div>
      <div class="tinkr-dev-label" style="left:${r.left}px;top:${Math.max(0,r.top - 22)}px">${Math.round(r.width)} × ${Math.round(r.height)}</div>`;
    if (state.selected && state.hover && state.hover !== state.selected) {
      const h = state.hover.getBoundingClientRect(), sr = state.selected.getBoundingClientRect();
      const dx = Math.abs(h.left - sr.left).toFixed(0), dy = Math.abs(h.top - sr.top).toFixed(0);
      layer.innerHTML += `<div class="tinkr-dev-distance" style="left:${(sr.right + h.left)/2}px;top:${sr.top - 16}px">${dx}px / ${dy}px</div>`;
    }
  }

  function renderVectorLayer() {
    const svg = state.root?.querySelector("#tinkr-vector-layer"); if (!svg) return;
    state.vectorRenderDirty = false;
    const draft = state.drawSession?.preview;
    const layers = (draft ? [...state.vectorLayers, draft] : state.vectorLayers).filter(layer => layer.visible !== false);
    svg.innerHTML = layers.map(l => TC().renderLayer(l)).join("");
    svg.querySelectorAll("[data-vector-id]").forEach(node => {
      node.classList.toggle("tinkr-owned-selected", node.dataset.vectorId === state.selectedVectorId || state.selection.ids.includes(`vector:${node.dataset.vectorId}`));
    });
    if (state.strokeSession) {
      svg.innerHTML += `<g transform="translate(${-window.scrollX} ${-window.scrollY})">${TC().renderStrokePreview(state.strokeSession)}</g>`;
    } else if (state.penNodes.length) {
      svg.innerHTML += `<g transform="translate(${-window.scrollX} ${-window.scrollY})">${TC().renderPenPreview(state.penNodes, state.penSession?.nodeIndex ?? -1)}</g>`;
    }
    window.TinkrToolbar?.syncVectorToolbar?.(state.root, state.selectedVectorId, state.vectorEditMode);
  }

  function normalizeFontWeight(value) {
    if (value === "bold") return "700";
    if (value === "normal") return "400";
    return value;
  }

  function selectionStylesFrom(el) {
    const style = getComputedStyle(el);
    return {
      backgroundColor: rgbToHex(style.backgroundColor), color: rgbToHex(style.color),
      fontSize: parseFloat(style.fontSize) || 0, padding: parseFloat(style.padding) || 0,
      borderRadius: parseFloat(style.borderRadius) || 0, opacity: parseFloat(style.opacity) || 1,
      fontWeight: normalizeFontWeight(style.fontWeight), lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
      textAlign: style.textAlign, textTransform: style.textTransform, objectFit: style.objectFit,
      objectPosition: style.objectPosition, filter: style.filter, gap: style.gap
    };
  }

  function layerKind(el) {
    if (!el) return "Unknown";
    if (el.matches?.("img,picture,[style*='background-image']")) return "Image";
    if (el.matches?.("button,a,[role='button']")) return "Button / link";
    if (/^(P|SPAN|H1|H2|H3|H4|H5|H6|LI|LABEL|SMALL|STRONG|EM|CODE)$/i.test(el.tagName) || el.isContentEditable) return "Text";
    const display = getComputedStyle(el).display;
    if (display.includes("flex") || display.includes("grid")) return "Layout container";
    return "Container";
  }

  function layerLabel(el) {
    if (!el) return "Layer";
    const text = (el.getAttribute("aria-label") || el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 42);
    return text || el.id || el.className?.toString().split(/\s+/)[0] || el.tagName.toLowerCase();
  }

  function domLayerRef(el, depth = 0) {
    if (!el || !el.isConnected || isTinkr(el)) return null;
    const id = `dom:${stableHash(selectorFor(el))}`;
    const meta = state.layerMeta[id] || {};
    return {
      id,
      kind: "dom",
      label: meta.name || layerLabel(el),
      type: layerKind(el),
      selector: selectorFor(el),
      target: fingerprint(el),
      depth,
      visible: meta.visible !== false && !el.classList.contains("tinkr-hidden") && getComputedStyle(el).display !== "none",
      locked: Boolean(meta.locked || el.closest("[data-tinkr-lock='true']")),
      selected: el === state.selected
    };
  }

  function buildLayers() {
    const layers = [];
    const source = state.selected || state.hover;
    if (source && !isTinkr(source)) {
      const path = [];
      let node = source;
      while (node && node !== document.body && path.length < 6) { path.unshift(node); node = node.parentElement; }
      path.forEach((item, depth) => {
        const ref = domLayerRef(item, depth);
        if (ref) layers.push(ref);
      });
      const parent = source.parentElement;
      if (parent) [...parent.children].slice(0, 80).forEach((child, index) => {
        if (child === source) return;
        const ref = domLayerRef(child, path.length);
        if (ref) { ref.sibling = true; ref.order = index; layers.push(ref); }
      });
    }
    state.visualLayers.forEach((layer, index) => layers.push({ id: layer.id, kind: "proxy", label: layer.name || layer.source?.text?.slice(0, 42) || "Visual copy", type: "Visual layer", order: index, visible: layer.visible !== false, locked: Boolean(layer.locked), selected: layer.id === state.selectedProxyId || state.selection.ids.includes(`proxy:${layer.id}`), zIndex: layer.zIndex }));
    state.vectorLayers.forEach((layer, index) => layers.push({ id: layer.id, kind: "vector", label: layer.name || layer.type || "Vector", type: "Vector", order: index, visible: layer.visible !== false, locked: Boolean(layer.locked), selected: layer.id === state.selectedVectorId || state.selection.ids.includes(`vector:${layer.id}`) }));
    state.sections.forEach((section, index) => layers.push({ id: section.id, kind: "section", label: section.label, type: "Section", order: index, visible: true, locked: false, selected: false }));
    return layers;
  }

  function resolveLayerRef(payload = {}) {
    if (payload.kind === "proxy") return { kind: "proxy", value: state.visualLayers.find(layer => layer.id === payload.id) || null };
    if (payload.kind === "vector") return { kind: "vector", value: state.vectorLayers.find(layer => layer.id === payload.id) || null };
    if (payload.kind === "section") return { kind: "section", value: state.sections.find(section => section.id === payload.id) || null };
    const target = payload.target || (payload.selector ? { selector: payload.selector } : null);
    const el = target ? TC().resolvePatchTarget({ selector: payload.selector || target.selector, target }, document) : null;
    return { kind: "dom", value: el };
  }

  function applyLayerMetadata() {
    Object.entries(state.layerMeta || {}).forEach(([id, meta]) => {
      if (!id.startsWith("dom:")) return;
      const all = [...document.querySelectorAll("*")];
      const el = all.find(node => `dom:${stableHash(selectorFor(node))}` === id);
      if (!el) return;
      el.toggleAttribute("data-tinkr-lock", Boolean(meta.locked));
      el.classList.toggle("tinkr-hidden", meta.visible === false);
    });
  }

  function setLayerState(payload = {}) {
    const resolved = resolveLayerRef(payload);
    if (!resolved.value) return status("That layer is no longer on this page.");
    if (resolved.kind === "proxy" || resolved.kind === "vector") {
      const layer = resolved.value;
      if (typeof payload.visible === "boolean") layer.visible = payload.visible;
      if (typeof payload.locked === "boolean") layer.locked = payload.locked;
      if (typeof payload.name === "string" && payload.name.trim()) layer.name = payload.name.trim().slice(0, 80);
      renderVisualLayers(); renderVectorLayer();
    } else if (resolved.kind === "dom") {
      const id = payload.id || `dom:${stableHash(selectorFor(resolved.value))}`;
      state.layerMeta[id] = { ...(state.layerMeta[id] || {}) };
      if (typeof payload.visible === "boolean") state.layerMeta[id].visible = payload.visible;
      if (typeof payload.locked === "boolean") state.layerMeta[id].locked = payload.locked;
      if (typeof payload.name === "string" && payload.name.trim()) state.layerMeta[id].name = payload.name.trim().slice(0, 80);
      applyLayerMetadata();
    }
    queueSave();
    pushPanelState();
  }

  function reorderOwnedLayers(payload = {}) {
    const kind = payload.kind === "vector" ? "vector" : payload.kind === "proxy" ? "proxy" : null;
    const targetKind = payload.targetKind === "vector" ? "vector" : payload.targetKind === "proxy" ? "proxy" : null;
    if (!kind || kind !== targetKind || !payload.id || !payload.targetId || payload.id === payload.targetId) {
      return status("Layers can only be reordered within the same tinkr-owned stack.");
    }
    if (kind === "vector") {
      const before = copyPatchValue(state.vectorLayers);
      const from = state.vectorLayers.findIndex(layer => layer.id === payload.id);
      const to = state.vectorLayers.findIndex(layer => layer.id === payload.targetId);
      if (from < 0 || to < 0) return status("That vector layer is no longer available.");
      const [layer] = state.vectorLayers.splice(from, 1);
      state.vectorLayers.splice(from < to ? to - 1 : to, 0, layer);
      const after = copyPatchValue(state.vectorLayers);
      push(
        { type: "vector_layers", before, after },
        () => { state.vectorLayers = copyPatchValue(before); renderVectorLayer(); pushPanelState(); },
        () => { state.vectorLayers = copyPatchValue(after); renderVectorLayer(); pushPanelState(); }
      );
      renderVectorLayer();
      status("Vector layer reordered.");
      pushPanelState();
      return;
    }
    const before = state.visualLayers.map(layer => ({ id: layer.id, zIndex: layer.zIndex }));
    const ordered = [...state.visualLayers].sort((a, b) => Number(a.zIndex) - Number(b.zIndex));
    const from = ordered.findIndex(layer => layer.id === payload.id);
    const to = ordered.findIndex(layer => layer.id === payload.targetId);
    if (from < 0 || to < 0) return status("That visual layer is no longer available.");
    const [layer] = ordered.splice(from, 1);
    ordered.splice(from < to ? to - 1 : to, 0, layer);
    ordered.forEach((item, index) => { item.zIndex = 1000 + index; });
    const layers = ordered.map(item => ({ id: item.id, zIndex: item.zIndex }));
    push(
      { type: "update_proxy", proxyId: payload.id, layers },
      () => { before.forEach(item => { const current = state.visualLayers.find(layer => layer.id === item.id); if (current) current.zIndex = item.zIndex; }); renderVisualLayers(); pushPanelState(); },
      () => { layers.forEach(item => { const current = state.visualLayers.find(layer => layer.id === item.id); if (current) current.zIndex = item.zIndex; }); renderVisualLayers(); pushPanelState(); }
    );
    renderVisualLayers();
    status("Visual layer reordered.");
    pushPanelState();
  }

  function proxyStyleTarget(id = state.selectedProxyId) {
    const host = proxyElement(id);
    return host?.firstElementChild || host;
  }

  function syncProxyHtmlFromDom(layerId = state.selectedProxyId) {
    const layer = state.visualLayers.find(item => item.id === layerId);
    const host = proxyElement(layerId);
    if (layer && host) layer.html = host.innerHTML;
  }

  function getPanelState() {
    const el = state.selected;
    let selection = null;
    if (el) {
      const ancestors = []; let node = el;
      while (node && node !== document.body && ancestors.length < 5) { ancestors.unshift(node); node = node.parentElement; }
      const kind = layerKind(el);
      selection = {
        tag: el.tagName.toLowerCase(),
        type: kind,
        parentDisplay: getComputedStyle(el.parentElement || el).display,
        crumbs: ancestors.map((n, i) => ({ tag: n.tagName.toLowerCase(), index: i })),
        styles: selectionStylesFrom(el),
        context: { text: kind === "Text" || kind === "Button / link", image: kind === "Image", button: kind === "Button / link", layout: kind === "Layout container" },
        anchor: fingerprint(el)
      };
    } else if (selectedProxy()) {
      const layer = selectedProxy();
      const proxyEl = proxyStyleTarget(layer.id);
      selection = {
        tag: "tinkr-proxy", type: "Visual copy", parentDisplay: "tinkr canvas", crumbs: [],
        styles: proxyEl ? selectionStylesFrom(proxyEl) : { backgroundColor: "#000000", color: "#ffffff", fontSize: 0, padding: 0, borderRadius: 0, opacity: 1, fontWeight: "", lineHeight: "", letterSpacing: "", textAlign: "", textTransform: "", objectFit: "", objectPosition: "", filter: "", gap: "" },
        context: { text: false, image: false, proxy: true }, proxy: true, zIndex: layer.zIndex
      };
    } else if (state.selectedVectorId) {
      const layer = state.vectorLayers.find(item => item.id === state.selectedVectorId);
      if (layer) selection = {
        tag: "tinkr-vector", type: "Vector", parentDisplay: "tinkr canvas", crumbs: [],
        styles: { backgroundColor: layer.fill || "transparent", color: layer.stroke || "#000000", fontSize: 0, padding: 0, borderRadius: layer.radius || 0, opacity: layer.opacity ?? 1, fontWeight: "", lineHeight: "", letterSpacing: "", textAlign: "", textTransform: "", objectFit: "", objectPosition: "", filter: "", gap: "" },
        context: { vector: true }, vector: { id: layer.id, type: layer.type, nodes: layer.nodes?.length || 0 }
      };
    }
    const styleTarget = el || (state.selectedProxyId ? proxyStyleTarget() : null);
    return {
      active: state.active, signedIn: state.signedIn, status: state._status, sync: { ...state.sync, hasLocalRecovery: Boolean(state.localConflict) }, breakpoint: state.breakpoint, panel: state.panel, workspaceMode: state.workspaceMode, interaction: { ...state.interaction }, selectionState: { ...state.selection },
      hydrating: Boolean(state.hydrating),
      tool: { ...state.tool }, activeToolLabel: toolStatusLabel(), pinCommentMode: state.pinCommentMode || state.tool.group === "comment",
      selection, stylesEditable: Boolean((styleTarget || state.selectedVectorId) && !state.tool.devMode && state.breakpoint === "base"),
      stylesHint: state.breakpoint !== "base" ? "Switch to Base breakpoint to edit styles on desktop." : state.tool.devMode ? "Dev Mode is read-only." : "",
      sections: state.sections, slices: state.slices, tokens: state.tokens,
      styles: state.styles, vectorLayers: state.vectorLayers, visualLayers: state.visualLayers, layers: buildLayers(), components: state.components, variables: state.variables.map(variable => ({ ...variable, usages: variableUsageCount(variable) })), assets: state.assets, prototypeLinks: state.prototypeLinks,
      motion: state.motion, presence: state.presence.slice(0, 6), preview: state.preview,
      ai: { pending: Boolean(state.aiRequest), requestId: state.aiRequest?.id || null, capabilities: state.aiCapabilities },
      labOutput: state.labOutput, labHasOps: state.labHasOps,
      devOutput: state.tool.devMode ? getDevOutput() : null,
      devSpec: state.tool.devMode ? getDevSpec() : null,
      a11ySnapshot: state.selected ? getA11ySnapshot(state.selected) : null,
      timelineOpen: state.timelineOpen, viewport: state.viewport, moveMode: state.moveMode, layerPick: state.layerPick,
      canUndo: state.history.length > 0, canRedo: state.future.length > 0, editCount: state.history.length
    };
  }

  function layoutChrome() {
    const root = state.root;
    if (!root) return;
    const timelineOpen = state.timelineOpen && !root.querySelector("#tinkr-timeline")?.classList.contains("tinkr-hide");
    const vectorVisible = Boolean(state.selectedVectorId) && !root.querySelector("#tinkr-vector-toolbar")?.classList.contains("tinkr-hide");
    if (timelineOpen) {
      root.style.setProperty("--tk-toolbar-bottom", "152px");
      root.style.setProperty("--tk-vector-bottom", vectorVisible ? "200px" : "152px");
      root.style.setProperty("--tk-timeline-bottom", "72px");
    } else {
      root.style.setProperty("--tk-toolbar-bottom", "24px");
      root.style.setProperty("--tk-vector-bottom", "72px");
      root.style.setProperty("--tk-timeline-bottom", "72px");
    }
  }

  function clearLayerPick() {
    state.layerPick = null;
    state.root?.querySelector("#tinkr-layer-target")?.classList.add("tinkr-hide");
  }

  function pushPanelState() {
    window.TinkrToolbar?.syncToolbar(state.root, { ...state.tool, timelineOpen: state.timelineOpen });
    layoutChrome();
    chrome.runtime.sendMessage({ type: "TINKR_PANEL_UPDATE", state: getPanelState() }).catch(() => {});
  }

  function status(message) { state._status = message; pushPanelState(); }

  function setTool(group, variant) {
    TC().setTool(state.tool, group, variant);
    if (group !== "comment") setWorkspaceMode("design");
    state.pinCommentMode = group === "comment";
    if (group === "move" && variant === "select") {
      setDevMode(false);
      state.spaceHand = false;
      state.panSession = null;
    }
    if (group === "region" && variant === "section") {
      requestTextInput({ title: "Name section", label: "Section name", value: "Section", confirmLabel: "Create section" }, label => {
        addSection(label || "Section", state.selected);
        status("Section added.");
      });
    }
    else if (group === "region" && variant === "frame") insertComponent("wireframe");
    else if (group === "region" && variant === "slice") { state.drawSession = { type: "slice", start: null }; status("Drag to define slice region."); }
    else state.drawSession = null;
    if (group === "shape" && variant === "image") { insertImageFromPicker(); return; }
    if (group === "text" && variant === "textPath") { attachTextOnPath(); return; }
    if (group === "draw" && variant === "eyedropper") { openScreenEyedropper(); return; }
    state.penNodes = [];
    state.penSession = null;
    state.strokeSession = null;
    status(toolStatusLabel());
    pushPanelState();
  }

  function setDevMode(on) {
    setWorkspaceMode(on ? "dev" : "design");
    renderDevOverlay(); pushPanelState();
  }

  function setProtoMode(on) {
    setWorkspaceMode(on ? "prototype" : "design");
    pushPanelState();
  }

  function selectedDomElements() {
    if (state.selection.kind !== "dom") return state.selected ? [state.selected] : [];
    return state.selection.ids.map(id => {
      const match = buildLayers().find(layer => layer.id === id && layer.kind === "dom");
      return match ? TC().resolvePatchTarget({ selector: match.selector, target: match.target }, document) : null;
    }).filter(Boolean);
  }

  function select(el, options = {}) {
    if (!el || SKIP.has(el.tagName) || isTinkr(el)) return;
    if (state.layerPick) clearLayerPick();
    state.selectedProxyId = null;
    state.selectedVectorId = null;
    const ref = domLayerRef(el);
    const current = selectedDomElements();
    if (options.add && current.length && current.every(item => item.parentElement === el.parentElement)) {
      const ids = state.selection.ids.includes(ref.id) ? state.selection.ids.filter(id => id !== ref.id) : [...state.selection.ids, ref.id];
      const primary = ids.includes(ref.id) ? el : current.find(item => ids.includes(domLayerRef(item)?.id)) || null;
      setSelection("dom", primary ? domLayerRef(primary)?.id : null, ids);
      state.selected = primary;
      placeBox("#tinkr-selected", state.selected);
      status(ids.length > 1 ? `${ids.length} compatible layers selected.` : ids.length ? `Selected ${el.tagName.toLowerCase()}.` : "Selection cleared.");
      pushPanelState();
      return;
    }
    setSelection("dom", ref?.id || selectorFor(el));
    if (state.tool.devMode) { state.selected = el; placeBox("#tinkr-selected", el); renderDevOverlay(); status(`Inspecting ${el.tagName.toLowerCase()}.`); pushPanelState(); return; }
    state.selected = el; placeBox("#tinkr-selected", el); status(`Selected ${el.tagName.toLowerCase()}.`);
    pushPanelState();
  }

  function currentOwnedSelectionIds() {
    if (state.selection.kind === "owned") return [...state.selection.ids];
    if (state.selectedProxyId) return [`proxy:${state.selectedProxyId}`];
    if (state.selectedVectorId) return [`vector:${state.selectedVectorId}`];
    return [];
  }

  function selectOwnedLayer(kind, id, { add = false } = {}) {
    const key = `${kind}:${id}`;
    let ids = add ? currentOwnedSelectionIds() : [];
    if (add) ids = ids.includes(key) ? ids.filter(item => item !== key) : [...ids, key];
    else ids = [key];
    const primary = ids.includes(key) ? key : ids[0] || null;
    const [primaryKind, primaryId] = primary ? primary.split(":") : [null, null];
    state.selected = null;
    state.selectedProxyId = primaryKind === "proxy" ? primaryId : null;
    state.selectedVectorId = primaryKind === "vector" ? primaryId : null;
    setSelection(ids.length > 1 ? "owned" : primaryKind, primary, ids);
    return { ids, primaryKind, primaryId };
  }

  function selectProxy(id, options = {}) {
    const layer = state.visualLayers.find(item => item.id === id); if (!layer) return;
    if (state.layerPick) clearLayerPick();
    const selection = selectOwnedLayer("proxy", id, options);
    const primaryProxy = selection.primaryKind === "proxy" ? state.visualLayers.find(item => item.id === selection.primaryId) : null;
    const primaryVector = selection.primaryKind === "vector" ? state.vectorLayers.find(item => item.id === selection.primaryId) : null;
    placeBox("#tinkr-hover"); renderVisualLayers();
    if (primaryProxy) placeProxyBox("#tinkr-selected", primaryProxy);
    else if (primaryVector) placeVectorBox(primaryVector);
    else placeBox("#tinkr-selected");
    status(selection.ids.length > 1 ? `${selection.ids.length} tinkr-owned layers selected.` : `Selected visual copy · z ${layer.zIndex}.`); pushPanelState();
  }

  function vectorRect(layer) {
    const tx = Number(layer?.tx) || 0, ty = Number(layer?.ty) || 0;
    const scaleX = Number(layer?.scaleX) || 1, scaleY = Number(layer?.scaleY) || 1;
    const boardScale = ownedBoardScale();
    const width = Math.max(1, (Number(layer?.w) || 1) * scaleX * boardScale);
    const height = Math.max(1, (Number(layer?.h) || 1) * scaleY * boardScale);
    const left = ((Number(layer?.x) || 0) + tx - window.scrollX) * boardScale;
    const top = ((Number(layer?.y) || 0) + ty - window.scrollY) * boardScale;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  function clearMarquee() {
    state.marquee = null;
    state.root?.querySelector("#tinkr-marquee")?.classList.add("tinkr-hide");
  }

  function updateMarquee(clientX, clientY) {
    const marquee = state.marquee;
    if (!marquee) return;
    const left = Math.min(marquee.startX, clientX), top = Math.min(marquee.startY, clientY);
    const width = Math.abs(clientX - marquee.startX), height = Math.abs(clientY - marquee.startY);
    marquee.rect = { left, top, width, height, right: left + width, bottom: top + height };
    const box = state.root?.querySelector("#tinkr-marquee");
    if (box) {
      Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      box.classList.remove("tinkr-hide");
    }
  }

  function rectInside(inner, outer) {
    return inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;
  }

  function selectOwnedLayersInMarquee() {
    const marquee = state.marquee;
    const rect = marquee?.rect;
    if (!rect || rect.width < 4 || rect.height < 4) { clearMarquee(); return; }
    const ids = [];
    const boardScale = ownedBoardScale();
    state.visualLayers.forEach(layer => {
      if (layer.visible === false || layer.locked) return;
      const left = (layer.x - window.scrollX) * boardScale;
      const top = (layer.y - window.scrollY) * boardScale;
      const layerRect = { left, top, right: left + layer.width * boardScale, bottom: top + layer.height * boardScale };
      if (rectInside(layerRect, rect)) ids.push(`proxy:${layer.id}`);
    });
    state.vectorLayers.forEach(layer => {
      if (layer.visible === false || layer.locked) return;
      if (rectInside(vectorRect(layer), rect)) ids.push(`vector:${layer.id}`);
    });
    clearMarquee();
    if (!ids.length) return status("No tinkr-owned layers in this selection.");
    const [kind, id] = ids[0].split(":");
    state.selected = null;
    state.selectedProxyId = kind === "proxy" ? id : null;
    state.selectedVectorId = kind === "vector" ? id : null;
    setSelection("owned", ids[0], ids);
    renderVisualLayers(); renderVectorLayer();
    if (kind === "proxy") placeProxyBox("#tinkr-selected", state.visualLayers.find(layer => layer.id === id));
    else placeVectorBox(state.vectorLayers.find(layer => layer.id === id));
    status(`${ids.length} tinkr-owned ${ids.length === 1 ? "layer" : "layers"} selected.`);
    pushPanelState();
  }

  function placeVectorBox(layer) {
    if (!layer) return placeBox("#tinkr-selected");
    const box = state.root?.querySelector("#tinkr-selected"); if (!box) return;
    const rect = vectorRect(layer);
    Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    box.classList.remove("tinkr-hide");
    if (state.tool.variant === "scale" && layer.id === state.selectedVectorId) renderScaleHandles(rect);
    else state.root?.querySelector("#tinkr-scale-handles")?.classList.add("tinkr-hide");
  }

  function beginVectorScale(layer, handle, event) {
    if (!layer) return false;
    const rect = vectorRect(layer);
    state.vectorScaleSession = {
      layer, handle, before: { ...layer }, rect,
      x: event.clientX, y: event.clientY
    };
    setInteraction("resizing", { pointerId: event.pointerId, handle, target: layer.id, kind: "vector" });
    capturePointer(event);
    return true;
  }

  function updateVectorScale(session, event) {
    const boardScale = ownedBoardScale();
    const dx = event.clientX - session.x;
    const dy = event.clientY - session.y;
    const { handle, rect, before, layer } = session;
    const hasEast = handle.includes("e"), hasWest = handle.includes("w");
    const hasSouth = handle.includes("s"), hasNorth = handle.includes("n");
    let width = Math.max(20 * boardScale, rect.width + (hasEast ? dx : hasWest ? -dx : 0));
    let height = Math.max(20 * boardScale, rect.height + (hasSouth ? dy : hasNorth ? -dy : 0));
    if (event.shiftKey && (hasEast || hasWest) && (hasSouth || hasNorth)) {
      const ratio = rect.width / Math.max(1, rect.height);
      if (Math.abs(dx) > Math.abs(dy)) height = Math.max(20, width / ratio);
      else width = Math.max(20, height * ratio);
    }
    const left = hasWest ? rect.right - width : rect.left;
    const top = hasNorth ? rect.bottom - height : rect.top;
    layer.x = Math.round((Number(before.x) || 0) + (left - rect.left) / boardScale);
    layer.y = Math.round((Number(before.y) || 0) + (top - rect.top) / boardScale);
    layer.scaleX = width / boardScale / Math.max(1, Number(before.w) || 1);
    layer.scaleY = height / boardScale / Math.max(1, Number(before.h) || 1);
    renderVectorLayer();
    placeVectorBox(layer);
    status(`Scaling vector · ${Math.round(width)} × ${Math.round(height)}${event.shiftKey ? " · ratio locked" : ""}`);
  }

  function selectVector(id, options = {}) {
    if (state.layerPick) clearLayerPick();
    const selection = selectOwnedLayer("vector", id, options);
    const layer = selection.primaryKind === "vector" ? state.vectorLayers.find(v => v.id === selection.primaryId) : null;
    const primaryProxy = selection.primaryKind === "proxy" ? state.visualLayers.find(item => item.id === selection.primaryId) : null;
    if (layer) placeVectorBox(layer);
    else if (primaryProxy) placeProxyBox("#tinkr-selected", primaryProxy);
    else placeBox("#tinkr-selected");
    if (layer?.nodes?.length) state.penNodes = [...layer.nodes];
    status(selection.ids.length > 1 ? `${selection.ids.length} tinkr-owned layers selected.` : "Vector selected · use edit bar to adjust points.");
    renderVectorLayer();
    pushPanelState();
  }

  function runVectorEdit(action) {
    const layer = state.vectorLayers.find(v => v.id === state.selectedVectorId);
    if (!layer?.nodes?.length && action !== "close") return status("Select a path with anchor points.");
    if (action === "move") { state.vectorEditMode = "move"; status("Move point · drag anchors on path."); }
    if (action === "bend") { state.vectorEditMode = "bend"; status("Bend · drag to set curve handles."); }
    if (action === "close") {
      if (layer?.nodes?.length > 2) {
        const before = copyPatchValue(layer);
        layer.d = TC().bezierToD(layer.nodes, true);
        layer.nodes = [...layer.nodes];
        const after = copyPatchValue(layer);
        push({ type: "update_vector", vectorId: layer.id, before, after }, () => { Object.assign(layer, before); renderVectorLayer(); }, () => { Object.assign(layer, after); renderVectorLayer(); });
        renderVectorLayer();
        status("Path closed.");
      } else if (state.penNodes.length > 2) finishPenPath(true);
    }
    if (action === "delete") {
      const before = copyPatchValue(layer);
      const beforeLayers = state.vectorLayers.map(copyPatchValue);
      const idx = state.penSession?.nodeIndex ?? layer.nodes.length - 1;
      layer.nodes = TC().deleteNode(layer.nodes, idx);
      state.penNodes = [...layer.nodes];
      layer.d = TC().bezierToD(layer.nodes);
      if (!layer.nodes.length) {
        state.vectorLayers = state.vectorLayers.filter(v => v.id !== layer.id);
        state.selectedVectorId = null;
        state.penNodes = [];
        const afterLayers = state.vectorLayers.map(copyPatchValue);
        push(
          { type: "vector_layers", before: beforeLayers, after: afterLayers },
          () => { state.vectorLayers = copyPatchValue(beforeLayers); renderVectorLayer(); pushPanelState(); },
          () => { state.vectorLayers = copyPatchValue(afterLayers); renderVectorLayer(); pushPanelState(); }
        );
      } else {
        const after = copyPatchValue(layer);
        push({ type: "update_vector", vectorId: layer.id, before, after }, () => { Object.assign(layer, before); renderVectorLayer(); }, () => { Object.assign(layer, after); renderVectorLayer(); });
      }
      renderVectorLayer();
      status("Point deleted.");
    }
    renderVectorLayer(); pushPanelState();
  }

  function insertImageFromPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) return status("Choose an image file to add it to the tinkr canvas.");
      if (file.size > LOCAL_ASSET_MAX_BYTES) return status("Images larger than 8 MB stay outside tinkr Cloud. Choose a smaller file to keep this remix portable.");
      let localDataUrl;
      try {
        localDataUrl = await readAssetAsDataUrl(file);
      } catch (error) {
        return status(error?.message || "The selected image could not be read.");
      }
      const asset = {
        id: crypto.randomUUID(), name: file.name, mimeType: file.type, byteSize: file.size,
        href: localDataUrl, localDataUrl, cloud: false, syncState: "local", createdAt: new Date().toISOString()
      };
      state.assets.push(asset);
      const point = ownedCanvasPoint(80, 80);
      const layer = TC().createShape("image", point.x, point.y, 240, 160, { href: localDataUrl, assetId: asset.id });
      state.vectorLayers.push(layer);
      push({ type: "insert_vector", vector: layer }, () => { state.vectorLayers = state.vectorLayers.filter(v => v.id !== layer.id); renderVectorLayer(); });
      renderVectorLayer(); queueSave();
      selectVector(layer.id);
      status("Image inserted · drag handles to resize on canvas.");
      void syncPendingAssets();
    };
    input.click();
  }

  function attachTextOnPath() {
    const layer = state.vectorLayers.find(v => v.id === state.selectedVectorId);
    if (!layer?.d) return status("Select a vector path first (Alt+click).");
    requestTextInput({ title: "Text on path", label: "Text", value: "Label", confirmLabel: "Add text" }, text => {
      if (!text) return false;
      const textLayer = {
        id: TC().uid(), type: "textPath", d: layer.d, text, fontSize: 14,
        stroke: TC().defaultStroke?.() || inkColor("--tk-ink-vector", "#a8b4ff"),
        fill: inkColor("--tk-text", "#f6f7fa"), x: layer.x, y: layer.y, w: layer.w, h: layer.h
      };
      state.vectorLayers.push(textLayer);
      push({ type: "insert_vector", vector: textLayer }, () => { state.vectorLayers = state.vectorLayers.filter(v => v.id !== textLayer.id); renderVectorLayer(); });
      renderVectorLayer();
      status("Text on path added.");
      pushPanelState();
    });
  }

  function applySampledColor(color) {
    if (!color) return;
    if (state.selected) setStyle("color", color);
    const swatch = state.styles.colors.find(c => c.id === "sampled");
    if (swatch) swatch.value = color;
    else state.styles.colors.push({ id: "sampled", name: "Sampled", value: color });
    status(`Sampled ${color}${state.selected ? " · applied to selection" : ""}.`);
    queueSave(); pushPanelState();
  }

  function sampleColorAt(x, y) {
    const el = pageElementAt(x, y);
    if (!el || isTinkr(el)) return status("Eyedropper · click a visible color on the page.");
    applySampledColor(rgbToHex(getComputedStyle(el).color));
  }

  async function openScreenEyedropper() {
    if (!window.EyeDropper) {
      status("Screen eyedropper unavailable — click an element to sample DOM color.");
      return;
    }
    try {
      const result = await new EyeDropper().open();
      applySampledColor(result.sRGBHex);
    } catch {
      status("Eyedropper cancelled.");
      pushPanelState();
    }
  }

  function luminance(hex) {
    const n = hex.replace("#", "");
    if (n.length < 6) return 0;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255);
    const lin = [r, g, b].map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  function contrastRatio(fg, bg) {
    const l1 = luminance(fg) + 0.05, l2 = luminance(bg) + 0.05;
    return (Math.max(l1, l2) / Math.min(l1, l2)).toFixed(2);
  }

  function getA11ySnapshot(el) {
    if (!el) return "";
    const s = getComputedStyle(el);
    const role = el.getAttribute("role") || el.tagName.toLowerCase();
    const name = el.getAttribute("aria-label") || el.getAttribute("alt") || (el.innerText || "").trim().slice(0, 80);
    const fg = rgbToHex(s.color), bg = rgbToHex(s.backgroundColor);
    const ratio = contrastRatio(fg, bg);
    const pass = Number(ratio) >= 4.5 ? "AA pass" : "low contrast";
    return `Role: ${role}\nName: ${name || "(empty)"}\nContrast: ${ratio}:1 (${pass})\nTab index: ${el.tabIndex}\nAlt: ${el.getAttribute("alt") || "—"}`;
  }

  function extractTokensFromSelection() {
    const el = state.selected;
    if (!el) return status("Select an element to extract tokens.");
    const s = getComputedStyle(el);
    state.tokens["--tinkr-primary"] = rgbToHex(s.color);
    state.tokens["--tinkr-surface"] = rgbToHex(s.backgroundColor);
    state.tokens["--tinkr-radius"] = s.borderRadius || state.tokens["--tinkr-radius"];
    state.tokens["--tinkr-gap"] = s.gap || state.tokens["--tinkr-gap"];
    applyTokens();
    queueSave();
    status("Extracted color, surface, radius, and gap from selection.");
    pushPanelState();
  }

  async function exportSliceCapture() {
    const res = await chrome.runtime.sendMessage({
      type: "TINKR_CAPTURE_SLICE",
      download: true,
      filename: `tinkr-${document.title.slice(0, 40).replace(/[^\w.-]+/g, "-")}-${Date.now()}.png`
    });
    status(res?.ok ? "Viewport PNG exported." : `Capture failed: ${res?.error || "unknown"}`);
    pushPanelState();
  }

  function teardownInjectedStyles() {
    document.getElementById("tinkr-tokens")?.remove();
    document.getElementById("tinkr-motion-styles")?.remove();
    document.querySelectorAll('style[id^="tinkr-responsive-"]').forEach(n => n.remove());
  }

  function selectCrumb(index) {
    if (!state.selected) return;
    const ancestors = []; let node = state.selected;
    while (node && node !== document.body && ancestors.length < 5) { ancestors.unshift(node); node = node.parentElement; }
    if (ancestors[index]) select(ancestors[index]);
  }

  function contextAction(action, value) {
    if (["front", "forward", "backward", "back", "above", "below"].includes(action)) { arrangeSelected(action); return; }
    const el = state.selected; if (!el || state.tool.devMode) return;
    if (action === "edit" && value !== undefined) updateText(value);
    if (action === "upper") setStyle("textTransform", "uppercase");
    if (action === "cover") setStyle("objectFit", "cover");
    if (action === "contain") setStyle("objectFit", "contain");
    if (action === "alt" && value !== undefined) {
      const before = el.getAttribute("alt");
      el.setAttribute("alt", value);
      push({ type: "set_attributes", selector: selectorFor(el), attributes: { alt: value } }, () => {
        if (before === null) el.removeAttribute("alt"); else el.setAttribute("alt", before);
        pushPanelState();
      });
      status("Image description updated.");
    }
    if (action === "copy-style") { state.styleClipboard = el.getAttribute("style") || ""; status("Style copied."); }
    if (action === "paste-style" && state.styleClipboard !== null) { const before = snapshot(el); el.setAttribute("style", state.styleClipboard); push({ type: "set_styles", selector: selectorFor(el), styles: Object.fromEntries([...el.style].map(k => [k, el.style[k]])) }, () => restore(el, before)); }
    if (action === "ready") { el.setAttribute("data-tinkr-ready", "true"); addSection("Ready for dev", el); status("Marked ready for build."); }
    if (action === "note" && value) addLocalComment(value, el);
    if (action === "apply-text-style" && value) { const st = state.styles.text.find(t => t.id === value); if (st) Object.entries({ fontFamily: st.fontFamily, fontSize: st.fontSize, fontWeight: st.fontWeight, lineHeight: st.lineHeight }).forEach(([k,v]) => setStyle(k, v)); }
    if (action === "apply-color-style" && value) { const c = state.styles.colors.find(t => t.id === value); if (c) setStyle("color", c.value); }
    if (action === "extract-tokens") extractTokensFromSelection();
    if (action === "boolean-union" && state.selectedVectorId) booleanOp("union");
    if (action === "make-component") makeComponentFromSelection();
    if (action === "detach-component") detachComponentInstance();
    if (action === "visual-copy") createVisualProxy();
    if (action === "move-visual") { state.moveMode = "visual"; status("Visual canvas mode · drag layers anywhere."); pushPanelState(); }
    if (action === "move-structural") { state.moveMode = "structural"; status("Structural mode · drag to reorder within the source layout."); pushPanelState(); }
  }

  function makeComponentFromSelection() {
    if (!state.selected) return status("Select a layer to make a component.");
    const el = sanitizedClone(state.selected);
    const name = (state.selected.getAttribute("aria-label") || state.selected.tagName.toLowerCase()).slice(0, 60);
    const component = {
      id: crypto.randomUUID(), name, html: el.outerHTML, createdAt: new Date().toISOString(),
      variants: [{ id: "default", name: "Default", properties: {}, html: el.outerHTML }],
      instances: [], propertyDefinitions: []
    };
    state.components.push(component);
    queueSave(); status(`Saved ${component.name} to components.`); pushPanelState();
  }

  function componentVariant(component, variantId) {
    return component?.variants?.find(variant => variant.id === variantId) || component?.variants?.[0] || component;
  }

  function insertSavedComponent(component, variantId = "default", options = {}) {
    const variant = componentVariant(component, variantId);
    const holder = document.createElement("div"); holder.innerHTML = variant?.html || component.html;
    const root = holder.firstElementChild;
    if (!root) return null;
    const instanceId = crypto.randomUUID();
    root.setAttribute("data-tinkr-component-id", component.id);
    root.setAttribute("data-tinkr-component-variant", variant?.id || "default");
    root.setAttribute("data-tinkr-instance-id", instanceId);
    const inserted = insertOwnedElement(root, options);
    if (!inserted) return null;
    component.instances = [...(component.instances || []), { id: instanceId, variantId: variant?.id || "default", operationId: inserted.getAttribute("data-tinkr-op"), detached: false }];
    queueSave();
    return inserted;
  }

  function detachComponentInstance(el = state.selected) {
    if (!el?.hasAttribute?.("data-tinkr-component-id")) return status("Select a component instance to detach it.");
    const componentId = el.getAttribute("data-tinkr-component-id");
    const instanceId = el.getAttribute("data-tinkr-instance-id");
    el.removeAttribute("data-tinkr-component-id");
    el.removeAttribute("data-tinkr-component-variant");
    const component = state.components.find(item => item.id === componentId);
    const instance = component?.instances?.find(item => item.id === instanceId);
    if (instance) instance.detached = true;
    queueSave(); status("Component instance detached."); pushPanelState();
  }

  function updateComponentVariant(componentId, variantId, html) {
    const component = state.components.find(item => item.id === componentId);
    const variant = componentVariant(component, variantId);
    if (!component || !variant || !html) return status("Component variant could not be updated.");
    variant.html = html;
    component.html = componentVariant(component, "default")?.html || component.html;
    document.querySelectorAll(`[data-tinkr-component-id="${CSS.escape(componentId)}"]`).forEach(node => {
      if (node.getAttribute("data-tinkr-component-variant") !== variant.id) return;
      const instance = component.instances?.find(item => item.operationId === node.getAttribute("data-tinkr-op"));
      if (instance?.detached) return;
      const next = document.createElement("div"); next.innerHTML = variant.html;
      const replacement = next.firstElementChild;
      if (!replacement) return;
      [...node.attributes].filter(attribute => attribute.name.startsWith("data-tinkr-")).forEach(attribute => replacement.setAttribute(attribute.name, attribute.value));
      node.replaceWith(replacement);
    });
    queueSave(); status(`Updated ${component.name} instances.`); pushPanelState();
  }

  function createVariable(payload) {
    const name = String(payload?.name || "").trim();
    const value = String(payload?.value || "").trim();
    if (!name || !value) return status("Variable needs a name and value.");
    const requestedType = String(payload?.type || "color").toLowerCase();
    const type = { spacing: "number", radius: "number", typography: "string" }[requestedType] || (["color", "number", "string", "boolean"].includes(requestedType) ? requestedType : "string");
    const normalizedName = name.replace(/\s+/g, "-").toLowerCase();
    const variable = {
      id: payload?.id || crypto.randomUUID(), name: normalizedName, type, value,
      cssName: `--tinkr-var-${normalizedName.replace(/[^a-z0-9_-]+/g, "-")}`,
      modes: { base: value, ...(payload?.modes || {}) }, aliasOf: payload?.aliasOf || null,
      createdAt: payload?.createdAt || new Date().toISOString()
    };
    state.variables = [...state.variables.filter(v => v.name !== variable.name), variable];
    applyTokens(); queueSave(); status(`Variable ${variable.name} saved.`); pushPanelState();
  }

  function variableUsageCount(variable) {
    const needle = `var(${variable.cssName || ""})`;
    if (!needle || needle === "var()") return 0;
    return [...document.querySelectorAll("[style]")].filter(el => el.getAttribute("style")?.includes(needle)).length;
  }

  function applyVariable(id, property) {
    const variable = state.variables.find(v => v.id === id);
    if (!variable || !state.selected) return status("Select a layer before applying a variable.");
    const targetProperty = property || (variable.type === "number" ? "gap" : variable.type === "string" ? "fontFamily" : variable.type === "boolean" ? "visibility" : "color");
    setStyle(targetProperty, `var(${variable.cssName})`);
    status(`Applied ${variable.name}.`);
  }

  function updateVariable(payload) {
    const variable = state.variables.find(item => item.id === payload?.id);
    if (!variable) return status("That variable no longer exists.");
    if (payload.name) variable.name = String(payload.name).trim().replace(/\s+/g, "-").toLowerCase();
    if (payload.value !== undefined) { variable.value = String(payload.value); variable.modes = { ...(variable.modes || {}), base: String(payload.value) }; }
    if (payload.modes) variable.modes = { ...(variable.modes || {}), ...payload.modes };
    if (payload.aliasOf !== undefined) variable.aliasOf = payload.aliasOf || null;
    applyTokens(); queueSave(); status(`Updated ${variable.name}.`); pushPanelState();
  }

  function booleanOp(op) {
    if (state.vectorLayers.length < 2) return status("Select two vectors for boolean ops.");
    const a = state.vectorLayers[state.vectorLayers.length - 2];
    const b = state.vectorLayers[state.vectorLayers.length - 1];
    if (op === "union") {
      const before = copyPatchValue(state.vectorLayers);
      const merged = TC().booleanUnion(a, b);
      const after = state.vectorLayers.slice(0, -2).concat(merged);
      state.vectorLayers = after;
      push(
        { type: "vector_layers", before, after },
        () => { state.vectorLayers = copyPatchValue(before); renderVectorLayer(); pushPanelState(); },
        () => { state.vectorLayers = copyPatchValue(after); renderVectorLayer(); pushPanelState(); }
      );
      renderVectorLayer(); queueSave();
    }
  }

  function snapshot(el, { content = false } = {}) {
    const stateSnapshot = { style: el.getAttribute("style"), hidden: el.classList.contains("tinkr-hidden") };
    // Style/layout transactions must never replay stale innerHTML into a live
    // React/Vue subtree. Only explicit text-edit transactions opt into content.
    if (content) stateSnapshot.html = el.innerHTML;
    return stateSnapshot;
  }
  function restore(el, before) {
    if (before.style === null) el.removeAttribute("style"); else el.setAttribute("style", before.style);
    if (Object.prototype.hasOwnProperty.call(before, "html")) el.innerHTML = before.html;
    el.classList.toggle("tinkr-hidden", before.hidden);
    placeBox("#tinkr-selected", el); pushPanelState();
  }

  function translateParts(value) {
    const parts = String(value || "0px 0px").trim().split(/\s+/).map(part => parseFloat(part) || 0);
    return { x: parts[0] || 0, y: parts[1] || 0 };
  }

  function prepareVisualLayer(el) {
    const before = snapshot(el);
    // CSS translate is safe for any visible element. Do not turn a static page
    // child into a positioned layer just because it was clicked or dragged.
    return { before, translate: translateParts(el.style.translate), zIndex: Number(el.style.zIndex) || 0 };
  }

  function layerTargetAt(x, y, ignored) {
    const stack = document.elementsFromPoint?.(x, y) || [];
    return stack.find(node => node?.nodeType === 1 && !isTinkr(node) && !SKIP.has(node.tagName) && node !== ignored && !ignored?.contains(node)) || null;
  }

  function showLayerTarget(el) {
    const box = state.root?.querySelector("#tinkr-layer-target");
    if (!box) return;
    if (!el) return box.classList.add("tinkr-hide");
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    box.classList.remove("tinkr-hide");
  }

  function stackSiblings(el) {
    return [...(el.parentElement?.children || [])].filter(node => node.nodeType === 1 && !isTinkr(node) && !node.classList.contains("tinkr-hidden"));
  }

  function canShareStackGroup(a, b) {
    return Boolean(a && b && a.parentElement === b.parentElement && !a.closest("iframe") && !b.closest("iframe"));
  }

  function canUseNativeStacking(el) {
    if (!el?.parentElement) return false;
    const parentDisplay = getComputedStyle(el.parentElement).display;
    const position = getComputedStyle(el).position;
    return position !== "static" || parentDisplay.includes("flex") || parentDisplay.includes("grid");
  }

  function requiresVisualProxy(el) {
    if (!el || el.hasAttribute("data-tinkr-owned")) return false;
    // Translate works for ordinary source elements. Promote only when an
    // ancestor clips it or the source stacking context cannot reliably show an
    // overlap; the visual proxy then remains local, reversible, and owned.
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const styles = getComputedStyle(parent);
      if (["hidden", "clip"].includes(styles.overflow) || ["hidden", "clip"].includes(styles.overflowX) || ["hidden", "clip"].includes(styles.overflowY)) return true;
      if (styles.contain.includes("paint")) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function commitDomOrder(order, selected, message) {
    const before = order.map(el => ({ el, style: el.getAttribute("style") }));
    const layers = order.map((el, index) => {
      // z-index applies to flex/grid children without inventing a positioning
      // context. Static flow blocks are promoted to visual proxies instead.
      el.style.zIndex = String(100 + index);
      return { selector: selectorFor(el), target: fingerprint(el), styles: { zIndex: el.style.zIndex } };
    });
    push({ type: "set_layer_order", selector: selectorFor(selected), target: fingerprint(selected), layers }, () => {
      before.forEach(item => { if (item.style === null) item.el.removeAttribute("style"); else item.el.setAttribute("style", item.style); });
      placeBox("#tinkr-selected", selected); pushPanelState();
    }, () => {
      layers.forEach(layer => { const node = TC().resolvePatchTarget(layer, document); if (node) Object.assign(node.style, layer.styles); });
      placeBox("#tinkr-selected", selected); pushPanelState();
    });
    status(message);
  }

  function proxyForSource(source) {
    const selector = selectorFor(source);
    return state.visualLayers.find(layer => layer.source?.selector === selector) || null;
  }

  function recordVisualProxyCreation(layer, source) {
    if (!layer || !source) return;
    const before = layer.sourceBefore || snapshot(source);
    push({ type: "create_proxy", selector: selectorFor(source), target: fingerprint(source), proxy: layer }, () => {
      state.visualLayers = state.visualLayers.filter(item => item.id !== layer.id);
      restore(source, before);
      renderVisualLayers();
    }, () => {
      source.style.opacity = "0";
      source.style.pointerEvents = "none";
      upsertOwnedLayer(state.visualLayers, layer);
      renderVisualLayers();
    });
  }

  function createVisualProxyFor(source, options) {
    const existing = proxyForSource(source); if (existing) return existing;
    const record = options?.record !== false;
    const rect = source.getBoundingClientRect();
    const clone = sanitizedClone(source); clone.removeAttribute("id"); clone.setAttribute("aria-hidden", "true");
    clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    copyVisualStyles(source, clone);
    const before = snapshot(source);
    const layer = { id: crypto.randomUUID(), source: fingerprint(source), sourceBefore: before, html: clone.outerHTML, x: Math.round(rect.left + window.scrollX), y: Math.round(rect.top + window.scrollY), width: Math.round(rect.width), height: Math.round(rect.height), zIndex: nextZ(), createdAt: new Date().toISOString() };
    source.style.opacity = "0"; source.style.pointerEvents = "none";
    state.visualLayers.push(layer); renderVisualLayers();
    if (record) recordVisualProxyCreation(layer, source);
    return layer;
  }

  function discardPromotedProxy(drag) {
    if (!drag?.promoted || !drag.layer) return;
    state.visualLayers = state.visualLayers.filter(layer => layer.id !== drag.layer.id);
    const source = drag.source || TC().resolvePatchTarget({ selector: drag.layer.source?.selector, target: drag.layer.source }, document);
    if (source && drag.layer.sourceBefore) {
      restore(source, drag.layer.sourceBefore);
      state.selected = source;
      state.selectedProxyId = null;
      setSelection("dom", domLayerRef(source)?.id || selectorFor(source));
    }
    renderVisualLayers();
  }

  function commitProxyOrder(selected, direction, target = null) {
    const before = state.visualLayers.map(layer => ({ id: layer.id, zIndex: layer.zIndex }));
    const ordered = [...state.visualLayers].sort((a, b) => Number(a.zIndex) - Number(b.zIndex));
    const current = ordered.indexOf(selected); if (current < 0) return;
    ordered.splice(current, 1);
    let next = ordered.length;
    if (direction === "back") next = 0;
    if (direction === "forward") next = Math.min(ordered.length, current + 1);
    if (direction === "backward") next = Math.max(0, current - 1);
    if (target) { const targetIndex = ordered.indexOf(target); next = direction === "below" ? targetIndex : targetIndex + 1; }
    ordered.splice(Math.max(0, next), 0, selected);
    ordered.forEach((layer, index) => { layer.zIndex = 1000 + index; });
    const layers = ordered.map(layer => ({ id: layer.id, zIndex: layer.zIndex }));
    renderVisualLayers();
    push({ type: "update_proxy", proxyId: selected.id, layers }, () => { before.forEach(item => { const layer = state.visualLayers.find(x => x.id === item.id); if (layer) layer.zIndex = item.zIndex; }); renderVisualLayers(); pushPanelState(); }, () => { layers.forEach(item => { const layer = state.visualLayers.find(x => x.id === item.id); if (layer) layer.zIndex = item.zIndex; }); renderVisualLayers(); pushPanelState(); });
  }

  function arrangeElement(el, direction, target = null) {
    if (!el) return status("Select a layer first.");
    if ((target && !canShareStackGroup(el, target)) || !canUseNativeStacking(el)) {
      // A normal block flow or separate stacking context cannot honor z-index
      // predictably. Promote the relevant sibling group to owned visual copies
      // rather than silently changing third-party layout rules.
      const group = !target && el.parentElement ? stackSiblings(el) : [el, target].filter(Boolean);
      const proxies = group.map(createVisualProxyFor);
      const selectedProxy = proxies.find(proxy => proxyForSource(el)?.id === proxy.id) || createVisualProxyFor(el);
      const targetProxy = target ? createVisualProxyFor(target) : null;
      state.selected = null; state.selectedProxyId = selectedProxy.id;
      commitProxyOrder(selectedProxy, direction, targetProxy);
      status("Switched to visual layers so this stacking order stays reliable.");
      return;
    }
    const order = stackSiblings(el).sort((a, b) => (Number(getComputedStyle(a).zIndex) || 0) - (Number(getComputedStyle(b).zIndex) || 0));
    const current = order.indexOf(el); if (current < 0) return status("This layer cannot be arranged here.");
    order.splice(current, 1);
    let next = order.length;
    if (direction === "back") next = 0;
    if (direction === "forward") next = Math.min(order.length, current + 1);
    if (direction === "backward") next = Math.max(0, current - 1);
    if (target) { const targetIndex = order.indexOf(target); next = direction === "below" ? targetIndex : targetIndex + 1; }
    order.splice(Math.max(0, next), 0, el);
    commitDomOrder(order, el, `Layer moved ${direction === "front" ? "to front" : direction === "back" ? "to back" : direction}.`);
  }

  function arrangeProxy(layer, direction, target = null) {
    if (!layer) return status("Select a visual copy first.");
    commitProxyOrder(layer, direction, target);
    status(`Visual copy moved ${direction}.`);
  }

  function arrangeSelected(direction, target = null) {
    const proxy = selectedProxy();
    if (proxy) {
      const targetProxy = target ? createVisualProxyFor(target) : null;
      return arrangeProxy(proxy, direction, targetProxy);
    }
    if (!state.selected) return status("Select a layer first.");
    if ((direction === "above" || direction === "below") && !target) {
      state.layerPick = direction;
      status(`Click a target layer on the page to place ${direction}.`);
      pushPanelState();
      return;
    }
    arrangeElement(state.selected, direction, target);
  }

  function createVisualProxy() {
    const source = state.selected; if (!source || state.tool.devMode) return status("Select a visual layer first.");
    const rect = source.getBoundingClientRect();
    const clone = sanitizedClone(source); clone.removeAttribute("id"); clone.setAttribute("aria-hidden", "true");
    clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    copyVisualStyles(source, clone);
    const before = snapshot(source);
    const layer = { id: crypto.randomUUID(), source: fingerprint(source), sourceBefore: before, html: clone.outerHTML, x: Math.round(rect.left + window.scrollX), y: Math.round(rect.top + window.scrollY), width: Math.round(rect.width), height: Math.round(rect.height), zIndex: nextZ(), createdAt: new Date().toISOString() };
    source.style.opacity = "0"; source.style.pointerEvents = "none";
    state.visualLayers.push(layer); state.selectedProxyId = layer.id; state.selected = null;
    renderVisualLayers();
    push({ type: "create_proxy", selector: selectorFor(source), target: fingerprint(source), proxy: layer }, () => { state.visualLayers = state.visualLayers.filter(item => item.id !== layer.id); restore(source, before); renderVisualLayers(); }, () => { source.style.opacity = "0"; source.style.pointerEvents = "none"; state.visualLayers.push(layer); renderVisualLayers(); });
    status("Visual copy created · source stays unchanged underneath.");
  }

  function copyPatchValue(value) {
    if (value === undefined || value === null) return value;
    try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
  }

  function upsertOwnedLayer(collection, next) {
    if (!next?.id) return null;
    const incoming = copyPatchValue(next);
    const index = collection.findIndex(item => item.id === incoming.id);
    if (index >= 0) {
      Object.assign(collection[index], incoming);
      return collection[index];
    }
    collection.push(incoming);
    return incoming;
  }

  // DOM patch replay deliberately treats board-owned layers as state-only: the
  // draft itself materializes them. History still needs a real forward path,
  // otherwise redo for a vector/proxy silently becomes a no-op.
  function reapplyHistoryPatch(patch) {
    if (patch.type === "insert_vector") {
      upsertOwnedLayer(state.vectorLayers, patch.vector);
      renderVectorLayer(); pushPanelState();
      return;
    }
    if (patch.type === "update_vector") {
      const layer = state.vectorLayers.find(item => item.id === patch.vectorId);
      if (layer && patch.after) Object.assign(layer, copyPatchValue(patch.after));
      renderVectorLayer(); pushPanelState();
      return;
    }
    if (patch.type === "vector_layers") {
      if (Array.isArray(patch.after)) state.vectorLayers = copyPatchValue(patch.after);
      renderVectorLayer(); pushPanelState();
      return;
    }
    if (patch.type === "update_proxy") {
      if (Array.isArray(patch.layers)) {
        patch.layers.forEach(item => {
          const layer = state.visualLayers.find(candidate => candidate.id === item.id);
          if (layer) layer.zIndex = item.zIndex;
        });
      } else {
        const layer = state.visualLayers.find(item => item.id === patch.proxyId);
        if (layer && patch.after) Object.assign(layer, copyPatchValue(patch.after));
      }
      renderVisualLayers(); pushPanelState();
      return;
    }
    if (patch.type === "create_proxy") {
      const proxy = upsertOwnedLayer(state.visualLayers, patch.proxy);
      const source = TC().resolvePatchTarget({ selector: patch.selector, target: patch.target }, document);
      if (proxy && source) { source.style.opacity = "0"; source.style.pointerEvents = "none"; }
      renderVisualLayers(); pushPanelState();
      return;
    }
    applyPatch(patch);
  }

  function push(patch, inverse, forward) {
    if (patch.type === "insert_html") {
      patch.operationId = insertIdentity(patch);
      patch.layerId = patch.layerId || patch.operationId;
    }
    if (patch.selector) { const el = document.querySelector(patch.selector); if (el) patch.target = fingerprint(el); }
    patch.breakpoint = patch.breakpoint || state.breakpoint;
    const record = copyPatchValue(patch);
    state.patches.push(record);
    state.history.push({ patch: record, inverse, forward: forward || (() => reapplyHistoryPatch(record)) });
    state.future = [];
    queueSave();
  }

  function queueSave() {
    if (state.skipPersist) return;
    state.draftVersion += 1;
    state.sync.pendingVersion = state.draftVersion;
    state.sync.error = null;
    setSyncState(navigator.onLine === false ? "offline" : "saving");
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(() => { save().catch(() => {}); }, 280);
    clearTimeout(state.cloudSyncTimer);
    state.cloudSyncTimer = setTimeout(() => { syncCloud().catch(() => {}); }, 900);
  }

  function stylePropertyToCss(property) { return property.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`); }

  function renderBreakpointStyles() {
    document.querySelectorAll('style[id^="tinkr-responsive-"]').forEach(node => node.remove());
    Object.entries(state.breakpointOverrides || {}).forEach(([breakpoint, targets]) => {
      const rules = Object.entries(targets || {}).map(([anchor, styles]) => {
        const declarations = Object.entries(styles || {}).map(([property, value]) => `${stylePropertyToCss(property)}:${value}!important`).join(";");
        return declarations ? `[data-tinkr-anchor="${CSS.escape(anchor)}"]{${declarations}}` : "";
      }).filter(Boolean).join("");
      if (!rules) return;
      const style = document.createElement("style");
      style.id = `tinkr-responsive-${breakpoint}`;
      style.textContent = `@media(max-width:${breakpoint}px){${rules}}`;
      document.head.append(style);
    });
  }

  function setStyle(property, raw) {
    if (state.tool.devMode) return status("Dev Mode is read-only.");
    if (state.selectedVectorId) {
      const layer = state.vectorLayers.find(item => item.id === state.selectedVectorId);
      if (!layer) return status("Select a vector layer first.");
      const before = { ...layer };
      const value = String(raw);
      const vectorProperty = { backgroundColor: "fill", color: "stroke", borderRadius: "radius", opacity: "opacity" }[property];
      if (!vectorProperty) return status("Use Fill, Stroke, Opacity, or Radius for this vector.");
      layer[vectorProperty] = vectorProperty === "opacity" || vectorProperty === "radius" ? Number(value) : value;
      const after = { ...layer };
      push({ type: "update_vector", vectorId: layer.id, before, after }, () => { Object.assign(layer, before); renderVectorLayer(); pushPanelState(); }, () => { Object.assign(layer, after); renderVectorLayer(); pushPanelState(); });
      renderVectorLayer();
      status(`Updated vector ${vectorProperty}.`);
      return;
    }
    const proxyId = state.selectedProxyId;
    const el = state.selected || (proxyId ? proxyStyleTarget() : null);
    if (!el) return status("Select an element first.");
    const proxyBefore = proxyId ? selectedProxy()?.html : null;
    let value = raw;
    const pxProps = ["fontSize", "padding", "borderRadius", "letterSpacing", "gap", "maxWidth", "maxHeight"];
    if (pxProps.includes(property) && raw !== "" && !String(raw).includes("px") && !String(raw).includes("%") && !String(raw).includes("rem")) value = `${raw}px`;
    if (property === "fontWeight") value = normalizeFontWeight(String(raw));
    const before = proxyId ? null : snapshot(el);
    if (state.breakpoint === "base") el.style[property] = value;
    else {
      el.style[property] = value;
      applyBreakpointStyle(el, state.breakpoint, { [property]: value });
    }
    if (proxyId) {
      syncProxyHtmlFromDom(proxyId);
      const layer = selectedProxy();
      const after = { html: layer?.html };
      push(
        { type: "update_proxy", proxyId, before: { html: proxyBefore }, after },
        () => { if (layer && proxyBefore !== undefined) { layer.html = proxyBefore; renderVisualLayers(); pushPanelState(); } },
        () => { const current = state.visualLayers.find(item => item.id === proxyId); if (current) Object.assign(current, after); renderVisualLayers(); pushPanelState(); }
      );
    } else {
      push({ type: "set_styles", selector: selectorFor(el), styles: { [property]: value }, breakpoint: state.breakpoint }, () => restore(el, before));
    }
    pushPanelState();
  }

  function responsiveKey(el) { let key = el.getAttribute("data-tinkr-anchor"); if (!key) { key = `t${stableHash(selectorFor(el))}`; el.setAttribute("data-tinkr-anchor", key); } return key; }
  function applyBreakpointStyle(el, breakpoint, styles) {
    const key = responsiveKey(el);
    state.breakpointOverrides[breakpoint] = { ...(state.breakpointOverrides[breakpoint] || {}) };
    state.breakpointOverrides[breakpoint][key] = { ...(state.breakpointOverrides[breakpoint][key] || {}), ...styles };
    renderBreakpointStyles();
  }
  function textNodesFor(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: node => node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const nodes = []; let node; while ((node = walker.nextNode())) nodes.push(node); return nodes;
  }
  function replaceTextPreservingMarkup(el, text) {
    const nodes = textNodesFor(el);
    if (!nodes.length) { el.textContent = text; return; }
    // Preserve nested elements/icons: the first readable text node becomes the
    // edited content and the remaining text nodes are cleared, not removed.
    nodes[0].nodeValue = text;
    nodes.slice(1).forEach(node => { node.nodeValue = ""; });
  }
  function updateText(text) { const el = state.selected; if (!el) return; const before = snapshot(el, { content: true }); replaceTextPreservingMarkup(el, text); push({ type: "update_text", selector: selectorFor(el), text, preserveMarkup: true }, () => restore(el, before)); }

  function sanitizeEditableHtml(html) {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    holder.querySelectorAll("script,style,iframe,object,embed,form").forEach(node => node.remove());
    holder.querySelectorAll("*").forEach(node => [...node.attributes].filter(attribute => attribute.name.startsWith("on") || attribute.name === "style" && /url\s*\(|expression\s*\(/i.test(attribute.value)).forEach(attribute => node.removeAttribute(attribute.name)));
    return holder.innerHTML;
  }

  function finishInlineTextEdit(commit = true) {
    const edit = state.textEdit;
    if (!edit) return;
    const { el, before } = edit;
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-tinkr-editing");
    if (!commit) {
      restore(el, before);
      status("Text edit cancelled.");
    } else {
      const html = sanitizeEditableHtml(el.innerHTML);
      el.innerHTML = html;
      if (html !== before.html) {
        push({ type: "update_html", selector: selectorFor(el), target: fingerprint(el), html }, () => restore(el, before));
        status("Text updated.");
      }
    }
    state.textEdit = null;
    setInteraction("idle");
    select(el);
  }

  function beginInlineTextEdit(el) {
    const kind = layerKind(el);
    if (!el || state.workspaceMode !== "design" || !["Text", "Button / link"].includes(kind)) return false;
    if (state.textEdit?.el === el) return true;
    if (state.textEdit) finishInlineTextEdit(true);
    const before = snapshot(el, { content: true });
    state.textEdit = { el, before };
    setInteraction("text-editing", { target: selectorFor(el) });
    el.setAttribute("contenteditable", "true");
    el.setAttribute("data-tinkr-editing", "true");
    el.focus({ preventScroll: true });
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el); range.collapse(false);
    selection?.removeAllRanges(); selection?.addRange(range);
    const keydown = event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finishInlineTextEdit(false); }
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); finishInlineTextEdit(true); }
    };
    const blur = () => {
      el.removeEventListener("keydown", keydown, true);
      el.removeEventListener("blur", blur, true);
      if (state.textEdit?.el === el) finishInlineTextEdit(true);
    };
    el.addEventListener("keydown", keydown, true);
    el.addEventListener("blur", blur, true);
    status("Editing text — Enter to save, Esc to cancel.");
    return true;
  }
  function hide() {
    if (!state.selected || state.tool.devMode) return status("Select an element to delete.");
    const el = state.selected, before = snapshot(el);
    el.classList.add("tinkr-hidden");
    push(
      { type: "hide", selector: selectorFor(el) },
      () => restore(el, before),
      () => { el.classList.add("tinkr-hidden"); placeBox("#tinkr-selected", el); pushPanelState(); }
    );
    state.selected = null;
    placeBox("#tinkr-selected");
    pushPanelState();
    status("Deleted element · Ctrl+Z to undo.");
  }

  function sanitizedClone(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script,iframe,form,style,link").forEach(n => n.remove());
    [clone, ...clone.querySelectorAll("*")].forEach(n => {
      [...n.attributes].filter(a => a.name.startsWith("on") || a.name === "id" || a.name === "data-tinkr-op").forEach(a => n.removeAttribute(a.name));
    });
    return clone;
  }

  function insertOwnedElement(el, options = {}) {
    if (!el) return null;
    const anchor = options.anchor === undefined ? (state.selected || document.body) : options.anchor;
    const placement = options.placement || "after";
    const id = options.operationId || operationId("layer");
    el.setAttribute("data-tinkr-owned", "true");
    el.setAttribute("data-tinkr-op", id);

    let parent = document.body;
    let after = null;
    if (anchor && anchor !== document.body && anchor.isConnected) {
      if (placement === "append") {
        parent = anchor;
        parent.append(el);
      } else {
        parent = anchor.parentElement || document.body;
        after = anchor;
        if (anchor.parentElement) anchor.after(el); else parent.append(el);
      }
    } else {
      document.body.append(el);
    }

    const patch = {
      type: "insert_html",
      operationId: id,
      layerId: id,
      parent: parent === document.body ? "body" : selectorFor(parent),
      after: after ? selectorFor(after) : null,
      html: el.outerHTML
    };
    push(patch, () => TC().removeInsertedNode?.(patch, document) || el.remove());
    if (options.select !== false) select(el);
    return el;
  }

  function duplicate() {
    if (!state.selected || state.tool.devMode) return;
    const source = state.selected;
    insertOwnedElement(sanitizedClone(source), { anchor: source });
  }
  function copy() { if (!state.selected) return; state.clipboard = sanitizedClone(state.selected).outerHTML; status("Component copied."); }
  function paste() {
    if (!state.selected || !state.clipboard || state.tool.devMode) return;
    const holder = document.createElement("div"); holder.innerHTML = state.clipboard;
    insertOwnedElement(holder.firstElementChild, { anchor: state.selected });
  }

  function componentHTML(kind) {
    const t = state.tokens;
    const content = {
      cta: `<section style="padding:32px;background:${t["--tinkr-surface"]};color:${t["--tinkr-text"]};border-radius:${t["--tinkr-radius"]};text-align:center"><h2 style="margin:0 0 8px;font-size:28px">Ready to build something better?</h2><p style="margin:0 0 18px;color:${t["--tinkr-muted"]}">Turn inspiration into a launch-ready concept.</p><button style="background:${t["--tinkr-primary"]};border:0;border-radius:8px;padding:11px 16px;font-weight:700">Join the waitlist</button></section>`,
      testimonial: `<blockquote style="margin:0;padding:24px;border:1px solid #d9dce3;border-radius:${t["--tinkr-radius"]};background:#fff"><p style="font-size:18px;margin:0 0 14px">"tinkr got us from inspiration to a real concept in minutes."</p><footer style="font-size:13px;color:#61646d">Maya Chen · Founder</footer></blockquote>`,
      feature: `<article style="padding:22px;border:1px solid #d9dce3;border-radius:${t["--tinkr-radius"]};background:#fff"><div style="font-size:24px">✦</div><h3 style="margin:10px 0 6px">Make it yours</h3><p style="margin:0;color:#626672">Start with the page you see, then explore freely.</p></article>`,
      wireframe: `<div data-tinkr-wireframe="true" style="min-height:240px;border:2px dashed #7ce9ff;border-radius:${t["--tinkr-radius"]};background:#7ce9ff12;padding:${t["--tinkr-gap"]};display:grid;place-items:center;color:#7ce9ff;font:600 14px Inter,sans-serif">Wireframe frame</div>`
    };
    return content[kind];
  }

  function insertComponent(kind, options = {}) {
    const holder = document.createElement("div"); holder.innerHTML = componentHTML(kind);
    return insertOwnedElement(holder.firstElementChild, options);
  }

  function autoLayout(kind) {
    if (!state.selected || state.tool.devMode) return status("Select a container first.");
    const el = state.selected, before = snapshot(el);
    const owned = el.hasAttribute("data-tinkr-owned") || el.hasAttribute("data-tinkr-wireframe");
    const semanticContainer = /^(DIV|SECTION|MAIN|ARTICLE|ASIDE|NAV|UL|OL)$/i.test(el.tagName);
    if (!owned && !semanticContainer) return status("Choose a container for source layout changes, or make a visual copy first.");
    if (!owned && !["flex", "grid", "gap"].includes(kind)) return status("That source-layout action is not supported safely.");
    if (kind === "flex") Object.assign(el.style, { display: "flex", flexWrap: "wrap", gap: state.tokens["--tinkr-gap"] });
    if (kind === "grid") Object.assign(el.style, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: state.tokens["--tinkr-gap"] });
    if (kind === "gap") Object.assign(el.style, { gap: state.tokens["--tinkr-gap"] });
    if (owned) el.setAttribute("data-tinkr-auto-layout", kind);
    push({ type: "set_styles", selector: selectorFor(el), styles: Object.fromEntries([...el.style].map(k => [k, el.style[k]])) }, () => restore(el, before));
    status(owned ? "Auto layout applied to this tinkr frame." : "Source layout updated — reorder children in Structural mode.");
  }

  function undo() {
    const entry = state.history.pop();
    if (!entry) return status("Nothing to undo.");
    state.patches.pop();
    state.future.push(entry);
    entry.inverse();
    // Undo intentionally clears the active canvas target. Clear every
    // selection alias, not only the source-DOM reference, otherwise a removed
    // proxy/vector remains silently selected and the next Delete or nudge can
    // affect the wrong layer.
    state.selected = null;
    state.selectedProxyId = null;
    state.selectedVectorId = null;
    setSelection(null);
    placeBox("#tinkr-selected");
    renderVisualLayers();
    renderVectorLayer();
    status(`Undid change · ${state.history.length} remaining.`);
    queueSave();
  }

  function redo() {
    const entry = state.future.pop();
    if (!entry) return status("Nothing to redo.");
    entry.forward();
    state.patches.push(entry.patch);
    state.history.push(entry);
    renderVectorLayer();
    status(`Redid change · ${state.future.length} to redo.`);
    queueSave();
  }

  function deleteSelected() {
    if (state.tool.devMode) return status("Dev Mode is read-only.");
    if (selectedProxy()) {
      const layer = selectedProxy();
      const source = TC().resolvePatchTarget({ selector: layer.source?.selector, target: layer.source }, document);
      const sourceBefore = source ? snapshot(source) : null;
      state.visualLayers = state.visualLayers.filter(item => item.id !== layer.id); state.selectedProxyId = null;
      if (source && layer.sourceBefore) restore(source, layer.sourceBefore);
      renderVisualLayers();
      push({ type: "restore_source", selector: layer.source?.selector, target: layer.source, after: layer.sourceBefore }, () => { if (source && sourceBefore) restore(source, sourceBefore); state.visualLayers.push(layer); renderVisualLayers(); }, () => { state.visualLayers = state.visualLayers.filter(item => item.id !== layer.id); if (source && layer.sourceBefore) restore(source, layer.sourceBefore); renderVisualLayers(); });
      status("Visual copy removed · source restored."); return;
    }
    if (state.selectedVectorId) {
      const id = state.selectedVectorId;
      const beforeLayers = [...state.vectorLayers];
      const afterLayers = state.vectorLayers.filter(v => v.id !== id);
      state.vectorLayers = afterLayers;
      state.selectedVectorId = null;
      state.penNodes = [];
      state.penSession = null;
      push(
        { type: "vector_layers", layers: afterLayers.map(v => v.id) },
        () => { state.vectorLayers = beforeLayers; renderVectorLayer(); pushPanelState(); },
        () => { state.vectorLayers = afterLayers; renderVectorLayer(); pushPanelState(); }
      );
      renderVectorLayer();
      pushPanelState();
      status("Deleted vector layer.");
      return;
    }
    hide();
  }

  async function clearCloudDraft() {
    if (!state.projectId) return;
    try {
      const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
      if (!auth?.signedIn) return;
      await api(`/api/projects/${state.projectId}`, "PATCH", {
        current_draft: {
          patches: [], labs: [], sections: [], slices: [], vectorLayers: [], visualLayers: [],
          prototypeLinks: [], motion: [], components: [],
          tokens: { ...DEFAULT_TOKENS },
          styles: JSON.parse(JSON.stringify(DEFAULT_STYLES))
        },
        canvas_meta: { sections: [], viewportState: { scale: 1, x: 0, y: 0 } }
      });
    } catch { /* API offline */ }
  }

  function clearCanvasArtifacts() {
    state.visualLayers.forEach(layer => {
      const source = TC().resolvePatchTarget({ selector: layer.source?.selector, target: layer.source }, document);
      if (source && layer.sourceBefore) restore(source, layer.sourceBefore);
    });
    state.vectorLayers = [];
    state.visualLayers = [];
    state.sections = [];
    state.slices = [];
    state.comments = [];
    state.labs = [];
    state.prototypeLinks = [];
    state.motion = [];
    state.preview = null;
    state.pendingLab = null;
    state.tokens = { ...DEFAULT_TOKENS };
    state.styles = JSON.parse(JSON.stringify(DEFAULT_STYLES));
    state.viewport = { scale: 1, x: 0, y: 0 };
    state.breakpointOverrides = {};
    state.layerMeta = {};
    state.selected = null;
    state.selectedVectorId = null;
    state.hover = null;
    state.history = [];
    state.future = [];
    state.patches = [];
    document.body.classList.remove("tinkr-viewport-mode");
    document.querySelectorAll(".tinkr-hidden").forEach(el => el.classList.remove("tinkr-hidden"));
    document.querySelectorAll("[data-tinkr-anchor]").forEach(el => el.removeAttribute("data-tinkr-anchor"));
    applyTokens();
    teardownInjectedStyles();
    placeBox("#tinkr-selected");
    placeBox("#tinkr-hover");
    drawOverlay();
    renderVectorLayer();
    renderPins();
  }

  async function resetPage(skipConfirm = false) {
    if (!skipConfirm) {
      requestTextInput({ title: "Reset this remix?", label: "Type RESET to confirm", placeholder: "RESET", confirmLabel: "Reset remix", description: "This removes the saved visual changes from this remix. The original website is never published or changed." }, value => {
        if (value !== "RESET") { status("Type RESET to confirm the reset."); return false; }
        void resetPage(true);
      });
      return;
    }

    state.skipPersist = true;
    clearTimeout(state.autosaveTimer);
    clearTimeout(state.cloudSyncTimer);

    while (state.history.length) {
      const entry = state.history.pop();
      state.patches.pop();
      entry.inverse();
    }
    state.future = [];

    const leftoverPatches = state.patches.length;
    state.patches = [];

    await chrome.storage.local.remove(storageKey());
    await clearCloudDraft();

    if (leftoverPatches > 0) {
      sessionStorage.setItem("tinkr:reactivate-design", "1");
      location.reload();
      return;
    }

    clearCanvasArtifacts();
    await chrome.storage.local.set({
      [storageKey()]: { patches: [], vectorLayers: [], sections: [], viewport: { scale: 1, x: 0, y: 0 }, updatedAt: new Date().toISOString() }
    });
    state.skipPersist = false;
    status("Canvas reset — original page restored.");
    pushPanelState();
  }

  function reset() { resetPage(true); }

  function localAssetRecord(asset) {
    const record = { ...asset };
    // Signed storage URLs expire and should never be the only local reference.
    // Keep an offline data URL when one exists; otherwise resolve the cloud URL
    // afresh when the project is opened again.
    if (record.localDataUrl) record.href = record.localDataUrl;
    else delete record.href;
    delete record.signedUrlExpiresAt;
    return record;
  }

  function draftPayload() {
    const assets = state.assets.map(localAssetRecord);
    const vectorLayers = state.vectorLayers.map(layer => {
      const record = { ...layer };
      if (record.assetId) delete record.href;
      return record;
    });
    return {
      patches: state.patches, labs: state.labs, tokens: state.tokens, sections: state.sections, slices: state.slices,
      prototypeLinks: state.prototypeLinks, motion: state.motion, vectorLayers, visualLayers: state.visualLayers,
      styles: state.styles, components: state.components, variables: state.variables, assets, moveMode: state.moveMode,
      breakpointOverrides: state.breakpointOverrides, layerMeta: state.layerMeta,
      version: state.draftVersion
    };
  }

  function cloneDraft(draft = draftPayload()) {
    return JSON.parse(JSON.stringify(draft));
  }

  function setSyncState(next, error = null) {
    state.sync.state = next;
    state.sync.error = error || null;
    const labels = {
      saving: "Saving…",
      saved: "Saved to tinkr.",
      offline: "Offline — changes are queued locally.",
      signin: "Sign in again to sync this remix.",
      conflict: "Conflict needs attention — your latest draft is safe locally.",
      too_large: "Draft too large to sync — it remains saved locally.",
      error: error || "Cloud sync needs attention.",
      local: "Saved locally."
    };
    state._status = labels[next] || state._status;
    pushPanelState();
  }

  async function persistLocalSnapshot(snapshot = cloneDraft(), version = state.draftVersion) {
    const record = { ...snapshot, projectId: state.projectId, viewport: state.viewport, version, updatedAt: new Date().toISOString() };
    const outbox = { draft: record, version, projectId: state.projectId, sourceUrl: location.href, queuedAt: new Date().toISOString() };
    await chrome.storage.local.set({ [storageKey()]: record, [outboxStorageKey()]: outbox });
    return record;
  }

  async function readOutbox(key = outboxStorageKey()) {
    const data = await chrome.storage.local.get(key);
    return data[key] || null;
  }

  async function clearAcknowledgedOutbox(acknowledgedVersion, key = outboxStorageKey()) {
    const queued = await readOutbox(key);
    if (!queued || Number(queued.version || 0) <= Number(acknowledgedVersion || 0)) {
      await chrome.storage.local.remove(key);
      return null;
    }
    return queued;
  }

  async function save() {
    const snapshot = cloneDraft();
    await persistLocalSnapshot(snapshot);
    if (!state.signedIn) setSyncState("local");
    return snapshot;
  }

  function syncErrorState(result) {
    const statusCode = Number(result?.status || 0);
    const code = result?.data?.code || result?.data?.errorCode;
    if (statusCode === 401 || code === "AUTH_REQUIRED") return "signin";
    if (statusCode === 403 || code === "EDITOR_REQUIRED") return "error";
    if (statusCode === 409 || code === "CONFLICT") return "conflict";
    if (statusCode === 413 || code === "DRAFT_TOO_LARGE") return "too_large";
    return "error";
  }

  function scheduleSyncRetry() {
    if (state.sync.retry >= 4 || !state.signedIn || navigator.onLine === false) return;
    const delay = Math.min(20_000, 800 * (2 ** state.sync.retry));
    state.sync.retry += 1;
    clearTimeout(state.syncRetryTimer);
    state.syncRetryTimer = setTimeout(() => { syncCloud().catch(() => {}); }, delay);
  }

  async function refreshAuthState(triggerSync = false) {
    const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
    state.signedIn = Boolean(auth?.signedIn);
    if (!state.signedIn) {
      setSyncState("signin");
    } else {
      const projectId = new URLSearchParams(location.search).get("tinkr_project");
      if (state.active && projectId && (triggerSync || state.sync.state === "signin")) {
        const loaded = await loadCloudProject(projectId).catch(() => false);
        if (loaded) setSyncState("saved");
      } else if (state.active) {
        setSyncState(state.sync.pendingVersion > state.sync.syncedVersion ? "saving" : "saved");
      }
    }
    if (triggerSync && state.active && state.signedIn) {
      clearTimeout(state.cloudSyncTimer);
      state.cloudSyncTimer = setTimeout(() => { syncCloud().catch(() => {}); }, 120);
    }
    pushPanelState();
  }

  async function syncCloud() {
    if (state.skipPersist || state.sync.inFlight) return;
    if (state.localConflict) {
      setSyncState("conflict", "A newer local recovery draft is waiting for your decision.");
      return;
    }
    if (navigator.onLine === false) { setSyncState("offline"); return; }

    const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
    state.signedIn = Boolean(auth?.signedIn);
    if (!state.signedIn) { setSyncState("signin"); return; }

    const version = state.draftVersion;
    const snapshot = cloneDraft();
    const cloudSnapshot = cloudDraftPayload(snapshot);
    const serialized = JSON.stringify(cloudSnapshot);
    // The server accepts a 200 KB body. Do not throw away work when a project
    // grows beyond it: keep the outbox and tell the user exactly why it paused.
    // Leave room for the request envelope and JSON escaping under the server's
    // 200 KB body limit. The local outbox remains the source of truth here.
    if (new Blob([serialized]).size > 155_000) {
      await persistLocalSnapshot(snapshot, version);
      setSyncState("too_large");
      return;
    }

    state.sync.inFlight = true;
    setSyncState("saving");
    try {
      const body = {
        current_draft: cloudSnapshot,
        canvas_meta: { sections: cloudSnapshot.sections || [], viewportState: state.viewport },
        sourceUrl: location.href,
        fingerprint: { pathname: location.pathname, title: document.title },
        client_version: version,
        base_version: state.sync.syncedVersion
      };
      const result = state.projectId
        ? await api(`/api/projects/${state.projectId}`, "PATCH", body)
        : await api("/api/projects", "POST", { ...body, name: document.title.slice(0, 80) || "Untitled remix" });

      if (!result?.ok) {
        const next = syncErrorState(result);
        let message = result?.data?.error || result?.data?.message || "Cloud sync failed.";
        if (next === "error" && (Number(result?.status) === 403 || result?.data?.code === "EDITOR_REQUIRED")) {
          message = "View-only access — you can edit locally but changes won't sync.";
        }
        if (next === "signin") state.signedIn = false;
        await persistLocalSnapshot(snapshot, version);
        setSyncState(next, message);
        if (next === "error") scheduleSyncRetry();
        return;
      }

      if (!state.projectId) {
        const projectId = result.data?.project?.id;
        if (!projectId) throw new Error("The server did not return a project ID.");
        const oldOutboxKey = outboxStorageKey();
        const queuedAfterCreate = await clearAcknowledgedOutbox(version, oldOutboxKey);
        state.projectId = projectId;
        const latestRecord = queuedAfterCreate?.draft || { ...snapshot, projectId, viewport: state.viewport, version, updatedAt: new Date().toISOString() };
        await chrome.storage.local.set({ [projectStorageKey(projectId)]: { ...latestRecord, projectId } });
        if (queuedAfterCreate) {
          await chrome.storage.local.set({ [outboxStorageKey(projectId)]: { ...queuedAfterCreate, projectId } });
        }
        await chrome.storage.local.remove(sourceStorageKey());
        reflectProjectInUrl(projectId);
        chrome.runtime.sendMessage({ type: "TINKR_REALTIME_JOIN", projectId });
      }

      state.sync.syncedVersion = Math.max(state.sync.syncedVersion, version);
      state.sync.retry = 0;
      await clearAcknowledgedOutbox(version);
      void syncPendingAssets();
      if (state.draftVersion > version) {
        clearTimeout(state.cloudSyncTimer);
        state.cloudSyncTimer = setTimeout(() => { syncCloud().catch(() => {}); }, 60);
      } else {
        setSyncState("saved");
      }
    } catch (error) {
      await persistLocalSnapshot(snapshot, version);
      setSyncState("error", error?.message || "API unreachable.");
      scheduleSyncRetry();
    } finally {
      state.sync.inFlight = false;
      pushPanelState();
    }
  }

  async function resolveSyncConflict(action) {
    const recovery = state.localConflict;
    if (!recovery || !state.projectId) return status("There is no local recovery draft to resolve.");
    const projectId = state.projectId;
    if (action === "cloud") {
      await chrome.storage.local.remove(outboxStorageKey(projectId));
      state.localConflict = null;
      await loadCloudProject(projectId);
      return;
    }
    if (action !== "branch") return;
    setSyncState("saving", "Saving your local recovery as a new remix.");
    const snapshot = recovery.draft || {};
    const result = await api("/api/projects", "POST", {
      name: `${document.title.slice(0, 64) || "Untitled remix"} — local recovery`,
      current_draft: cloudDraftPayload(snapshot),
      canvas_meta: { sections: snapshot.sections || [], viewportState: snapshot.viewport || state.viewport },
      sourceUrl: location.href,
      fingerprint: { pathname: location.pathname, title: document.title }
    });
    if (!result?.ok || !result.data?.project?.id) {
      setSyncState("conflict", result?.data?.error || "Could not create a recovery remix. Your local draft is still safe on this device.");
      return;
    }
    const newProjectId = result.data.project.id;
    await chrome.storage.local.set({
      [projectStorageKey(newProjectId)]: { ...snapshot, projectId: newProjectId, viewport: snapshot.viewport || state.viewport, version: Number(recovery.version || snapshot.version || 0), updatedAt: new Date().toISOString() }
    });
    await chrome.storage.local.remove(outboxStorageKey(projectId));
    state.skipPersist = true;
    reflectProjectInUrl(newProjectId);
    status("Local recovery saved as a new tinkr remix. Reopening it now.");
    location.reload();
  }

  async function createCheckpoint() {
    if (!state.signedIn || !state.projectId) return status("Sign in and sync to create a checkpoint.");
    const result = await api(`/api/projects/${state.projectId}/revisions`, "POST", {
      name: `Checkpoint ${new Date().toLocaleString()}`, patches: state.patches,
      draft_snapshot: cloudDraftPayload(), fingerprint: { pathname: location.pathname }
    });
    status(result.ok ? "Checkpoint saved." : `Checkpoint failed: ${result.data?.error}`);
  }

  async function loadCloudProject(projectId) {
    const result = await api(`/api/projects/${projectId}`, "GET");
    state.projectLoadStatus = Number(result?.status || 0);
    if (!result?.ok) {
      const syncState = syncErrorState(result);
      let message = result?.data?.error || "Could not load this project.";
      if (syncState === "error" && state.projectLoadStatus === 403) {
        message = "View-only access — you can edit locally but changes won't sync.";
      }
      if (syncState === "signin") state.signedIn = false;
      setSyncState(syncState, message);
      return false;
    }
    const project = result.data.project;
    state.projectLoadStatus = 200;
    state.projectId = project.id;
    state.hydratedFromProject = true;
    const draft = project.current_draft || {};
    state.patches = normalizePatches(draft.patches);
    state.labs = draft.labs || [];
    state.tokens = { ...DEFAULT_TOKENS, ...(draft.tokens || {}) };
    state.sections = draft.sections || project.canvas_meta?.sections || [];
    state.slices = draft.slices || [];
    state.vectorLayers = draft.vectorLayers || [];
    state.visualLayers = draft.visualLayers || [];
    state.styles = draft.styles || JSON.parse(JSON.stringify(DEFAULT_STYLES));
    state.components = draft.components || [];
    state.variables = draft.variables || [];
    state.assets = draft.assets || [];
    normalizeAssetReferences();
    await hydrateProjectAssets().catch(() => {});
    state.moveMode = draft.moveMode || "visual";
    state.breakpointOverrides = draft.breakpointOverrides || {};
    state.layerMeta = draft.layerMeta || {};
    state.prototypeLinks = draft.prototypeLinks || [];
    state.motion = draft.motion || [];
    state.viewport = project.canvas_meta?.viewportState || state.viewport;
    const cloudVersion = Number(draft.version || draft.client_version || 0);
    state.draftVersion = cloudVersion;
    const queued = await readOutbox(outboxStorageKey(project.id));
    const recoveredEqualVersionAssets = Boolean(
      queued
      && Number(queued.version || 0) === cloudVersion
      && restoreEqualVersionPendingAssets(queued)
    );
    if (queued && Number(queued.version || 0) > cloudVersion) {
      // Project-scoped offline work is never silently replayed over the cloud
      // revision. Keep it durably available and surface a recovery state.
      state.localConflict = queued;
      state.sync.pendingVersion = Number(queued.version);
      state.sync.syncedVersion = cloudVersion;
    } else {
      state.localConflict = null;
      state.sync.pendingVersion = state.draftVersion;
      state.sync.syncedVersion = state.draftVersion;
      // A same-version outbox normally means the draft was acknowledged. The
      // exception is an image whose metadata synced but whose bytes did not;
      // retain its local data URL until the asset endpoint confirms upload.
      if (queued && !recoveredEqualVersionAssets) await clearAcknowledgedOutbox(cloudVersion, outboxStorageKey(project.id));
    }
    applyTokens(); renderBreakpointStyles(); applyViewport(); resetAndReplay(); applyLayerMetadata(); drawOverlay(); renderVectorLayer(); renderVisualLayers();
    await chrome.storage.local.set({ [projectStorageKey(project.id)]: { ...cloneDraft(), projectId: project.id, viewport: state.viewport, version: state.draftVersion, updatedAt: new Date().toISOString() } });
    chrome.runtime.sendMessage({ type: "TINKR_REALTIME_JOIN", projectId });
    if (state.localConflict) {
      setSyncState("conflict", "A newer offline draft is safe on this device. Save it as a new remix or reopen the cloud version.");
      status(`Loaded cloud project "${project.name}". A newer local recovery draft is available.`);
    } else if (recoveredEqualVersionAssets) {
      setSyncState("saved", "A local image is retained until its cloud upload succeeds.");
      status(`Loaded cloud project "${project.name}". A local image is safe on this device and will upload when available.`);
      void syncPendingAssets();
    } else {
      setSyncState("saved");
      status(`Loaded cloud project "${project.name}".`);
    }
    return true;
  }

  async function loadCachedProject(projectId) {
    const data = await chrome.storage.local.get(projectStorageKey(projectId));
    const cached = data[projectStorageKey(projectId)];
    if (!cached) return false;
    state.projectId = projectId;
    state.hydratedFromProject = true;
    state.patches = normalizePatches(cached.patches);
    state.labs = cached.labs || [];
    state.tokens = { ...DEFAULT_TOKENS, ...(cached.tokens || {}) };
    state.sections = cached.sections || [];
    state.slices = cached.slices || [];
    state.vectorLayers = cached.vectorLayers || [];
    state.visualLayers = cached.visualLayers || [];
    state.styles = cached.styles || JSON.parse(JSON.stringify(DEFAULT_STYLES));
    state.components = cached.components || [];
    state.variables = cached.variables || [];
    state.assets = cached.assets || [];
    normalizeAssetReferences();
    state.moveMode = cached.moveMode || "visual";
    state.breakpointOverrides = cached.breakpointOverrides || {};
    state.layerMeta = cached.layerMeta || {};
    state.prototypeLinks = cached.prototypeLinks || [];
    state.motion = cached.motion || [];
    state.viewport = cached.viewport || state.viewport;
    state.draftVersion = Number(cached.version || 0);
    state.sync.pendingVersion = state.draftVersion;
    applyTokens(); renderBreakpointStyles(); applyViewport(); resetAndReplay(); applyLayerMetadata(); drawOverlay(); renderVectorLayer(); renderVisualLayers();
    setSyncState(navigator.onLine === false ? "offline" : state.signedIn ? "error" : "signin");
    status("Opened the last local snapshot for this tinkr project.");
    return true;
  }

  async function importSharedRevision(token) {
    const result = await api(`/api/review/${encodeURIComponent(token)}`, "GET");
    if (!result?.ok) { status(result?.data?.error || "Import failed."); return false; }
    const data = result.data;
    const snap = data.revision?.draft_snapshot || {};
    state.patches = normalizePatches(snap.patches || data.revision?.patch_snapshot || []);
    state.vectorLayers = snap.vectorLayers || [];
    state.visualLayers = snap.visualLayers || [];
    resetAndReplay(); renderVectorLayer(); renderVisualLayers();
    status("Imported shared revision.");
    return true;
  }

  function resetAndReplay() {
    state.history = []; state.future = [];
    state.patches = normalizePatches(state.patches);
    state.isReplaying = true;
    try {
      repairLegacyInsertedNodes();
      state.patches.forEach(p => applyPatch(p));
    } finally {
      state.isReplaying = false;
    }
    if (state.selected) placeBox("#tinkr-selected", state.selected);
    pushPanelState();
  }

  async function replay() {
    // Never apply URL-local state after a project URL has hydrated its cloud
    // revision. That was the source of project A/B overwrite bugs.
    if (state.hydratedFromProject) return false;
    const sourceKey = sourceStorageKey();
    const legacyKey = legacyStorageKey();
    const data = await chrome.storage.local.get([sourceKey, legacyKey]);
    let saved = data[sourceKey] || null;
    if (!saved && data[legacyKey]) {
      const legacy = data[legacyKey];
      // Older builds stored cloud projects under the page URL. Move that cache
      // aside but never use it as an unscoped draft again.
      if (legacy.projectId) {
        await chrome.storage.local.set({ [projectStorageKey(legacy.projectId)]: legacy });
      } else {
        saved = legacy;
        await chrome.storage.local.set({ [sourceKey]: legacy });
      }
    }
    saved = saved || {};
    state.projectId = null;
    state.patches = normalizePatches(saved.patches);
    state.labs = saved.labs || [];
    state.tokens = { ...DEFAULT_TOKENS, ...(saved.tokens || {}) };
    state.sections = saved.sections || [];
    state.slices = saved.slices || [];
    state.vectorLayers = saved.vectorLayers || [];
    state.visualLayers = saved.visualLayers || [];
    state.styles = saved.styles || JSON.parse(JSON.stringify(DEFAULT_STYLES));
    state.components = saved.components || [];
    state.variables = saved.variables || [];
    state.assets = saved.assets || [];
    normalizeAssetReferences();
    state.moveMode = saved.moveMode || "visual";
    state.breakpointOverrides = saved.breakpointOverrides || {};
    state.layerMeta = saved.layerMeta || {};
    state.prototypeLinks = saved.prototypeLinks || [];
    state.motion = saved.motion || [];
    state.viewport = saved.viewport || state.viewport;
    state.draftVersion = Number(saved.version || 0);
    state.sync.pendingVersion = state.draftVersion;
    applyTokens(); renderBreakpointStyles(); applyViewport();
    let missed = 0;
    state.isReplaying = true;
    try {
      repairLegacyInsertedNodes();
      state.patches.forEach(p => { if (!applyPatch(p)) missed++; });
    } finally {
      state.isReplaying = false;
    }
    applyLayerMetadata(); renderVectorLayer(); renderVisualLayers();
    if (state.patches.length) status(missed ? `${missed} patches need reattachment.` : `Restored ${state.patches.length} local changes.`);
    drawOverlay();
    return Boolean(state.patches.length);
  }

  function isTransientSession() {
    return Boolean(
      state.drag || state.press || state.scaleSession || state.vectorPress || state.vectorDrag || state.vectorScaleSession || state.marquee ||
      state.panSession || state.strokeSession || state.penSession || state.drawSession?.active || state.textEdit
    );
  }

  function settleDomPatches() {
    if (!state.active || state.isReplaying || isTransientSession()) return;
    // Reconcile only operations whose owned target has genuinely disappeared.
    // Replaying every patch after an unrelated React mutation duplicated inserts.
    const missing = state.patches.filter(p => {
      if (!["insert_html", "reorder", "reorder_dom", "move_layer", "set_layer_order", "create_proxy", "hide_source", "set_styles", "set_attributes", "update_text", "update_html", "hide"].includes(p.type)) return false;
      return !TC().isPatchApplied?.(p, document);
    });
    if (!missing.length) return;
    state.isReplaying = true;
    try { missing.forEach(p => applyPatch(p)); } finally { state.isReplaying = false; }
  }

  function applyPatch(patch) { return TC().applyPatch(patch, document); }

  function applyTokens() {
    let style = document.getElementById("tinkr-tokens");
    if (!style) { style = document.createElement("style"); style.id = "tinkr-tokens"; document.head.append(style); }
    const variableDeclarations = state.variables.map(variable => {
      const name = variable.cssName || `--tinkr-var-${String(variable.name || variable.id).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`;
      const modeValue = variable.modes?.base ?? variable.value;
      const alias = variable.aliasOf ? state.variables.find(item => item.id === variable.aliasOf || item.name === variable.aliasOf) : null;
      const value = alias ? `var(${alias.cssName || `--tinkr-var-${String(alias.name || alias.id).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`})` : modeValue;
      return `${name}:${value}`;
    });
    style.textContent = `:root{${[...Object.entries(state.tokens).map(([k,v]) => `${k}:${v}`), ...variableDeclarations].join(";")}}`;
  }

  function addSection(label, el) {
    const rect = el ? el.getBoundingClientRect() : { top: 120, height: 400 };
    state.sections.push({ id: crypto.randomUUID(), label, scrollY: window.scrollY + (el ? rect.top : 120), height: rect.height || 400, status: label.includes("Ready") ? "ready" : "draft" });
    drawOverlay(); queueSave(); pushPanelState();
  }

  function drawOverlay() {
    const overlay = state.root?.querySelector("#tinkr-overlay"); if (!overlay) return;
    overlay.innerHTML = state.sections.map(s => `<div class="tinkr-section-frame" style="top:${s.scrollY - window.scrollY}px;height:${s.height}px"><span>${s.label}</span></div>`).join("");
  }

  function addLocalComment(body, el) {
    const rect = el.getBoundingClientRect();
    const anchor = { ...fingerprint(el), ...anchorAt(rect.left + rect.width / 2, rect.top + rect.height / 2) };
    state.comments.push({ id: crypto.randomUUID(), body, target_anchor: anchor, local: true });
    renderPins(); queueSave();
    if (state.signedIn && state.projectId) api(`/api/projects/${state.projectId}/comments`, "POST", { body, target_anchor: anchor });
  }

  function renderPins() {
    const layer = state.root?.querySelector("#tinkr-pins"); if (!layer) return;
    layer.innerHTML = state.comments.map(c => {
      const a = c.target_anchor || {};
      return `<div class="tinkr-pin" style="left:${a.x}px;top:${a.y}px" title="${c.body.replace(/"/g, "&quot;")}">💬</div>`;
    }).join("");
  }

  function renderPresence() {
    const layer = state.root?.querySelector("#tinkr-live-cursors"); if (!layer) return;
    layer.innerHTML = state.presence.filter(p => p.cursor).map((p, i) => `<div class="tinkr-live-cursor" style="left:${p.cursor.clientX}px;top:${p.cursor.clientY}px;color:${p.color || CURSOR_COLORS[i % CURSOR_COLORS.length]}"><span>${(p.email || "Guest").split("@")[0]}</span></div>`).join("");
    pushPanelState();
  }

  function renderTimeline() {
    const tracks = state.root?.querySelector("#tinkr-timeline-tracks"); if (!tracks) return;
    tracks.innerHTML = state.motion.map(m => `<div class="tinkr-timeline-track"><span>${m.selector || m.targetId || "layer"}</span><div class="tinkr-timeline-keys">${m.property} ${m.duration}</div></div>`).join("") || "<div class='tinkr-timeline-track'><span>No motion keyframes</span></div>";
  }

  function exportPatchJson() {
    const blob = new Blob([JSON.stringify(draftPayload(), null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tinkr-patch.json"; a.click();
    status("Exported patch JSON.");
  }

  function addHotspot(target) {
    if (!state.selected) return status("Select a hotspot element.");
    if (!target) return;
    state.prototypeLinks.push({ id: crypto.randomUUID(), selector: selectorFor(state.selected), target, label: state.selected.innerText?.slice(0, 40) || "Hotspot" });
    queueSave(); pushPanelState();
  }

  function addMotionPreset() {
    if (!state.selected) return status("Select an element.");
    const el = state.selected;
    const keyframe = { id: crypto.randomUUID(), selector: selectorFor(el), targetId: selectorFor(el), property: "opacity", from: "0", to: "1", duration: "600ms", delay: "0ms", easing: "ease" };
    state.motion.push(keyframe);
    el.style.animation = `tinkr-fade-${keyframe.id} ${keyframe.duration} ${keyframe.easing} forwards`;
    let style = document.getElementById("tinkr-motion-styles");
    if (!style) { style = document.createElement("style"); style.id = "tinkr-motion-styles"; document.head.append(style); }
    style.textContent += `@keyframes tinkr-fade-${keyframe.id}{from{opacity:0}to{opacity:1}}`;
    renderTimeline(); queueSave(); pushPanelState();
  }

  function finishShapeDraw(x, y, w, h) {
    const variant = state.tool.variant;
    if (state.drawSession?.type === "slice") {
      state.slices.push({ id: crypto.randomUUID(), x, y, w, h, scrollY: window.scrollY });
      status("Slice region saved.");
      state.drawSession = null; queueSave(); pushPanelState(); return;
    }
    if (state.tool.group === "text" && variant === "text") {
      const el = document.createElement("div");
      el.contentEditable = "true";
      el.textContent = "Text";
      Object.assign(el.style, { position: "absolute", left: `${x + window.scrollX}px`, top: `${y + window.scrollY}px`, minWidth: `${Math.max(w, 80)}px`, minHeight: `${Math.max(h, 24)}px`, padding: "8px", outline: "2px dashed #7ce9ff", zIndex: String(nextZ()) });
      insertOwnedElement(el, { anchor: document.body });
      state.drawSession = null; return;
    }
    if (state.tool.group === "shape") {
      const point = ownedCanvasPoint(x, y);
      const scale = ownedBoardScale();
      const layer = TC().createShape(variant, point.x, point.y, Math.abs(w) / scale, Math.abs(h) / scale);
      state.vectorLayers.push(layer);
      push({ type: "insert_vector", vector: layer }, () => { state.vectorLayers = state.vectorLayers.filter(v => v.id !== layer.id); renderVectorLayer(); });
      renderVectorLayer(); state.drawSession = null; queueSave(); status(`Added ${variant}.`);
    }
  }

  function finishPenPath(closed = false) {
    if (state.penNodes.length < 2) { state.penNodes = []; state.penSession = null; renderVectorLayer(); return; }
    const d = TC().bezierToD(state.penNodes, closed);
    const xs = state.penNodes.map(n => n.x), ys = state.penNodes.map(n => n.y);
    const stroke = TC().defaultStroke?.() || inkColor("--tk-ink-vector", "#a8b4ff");
    const layer = {
      id: TC().uid(), type: "path", x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
      fill: closed ? "rgba(168,180,255,0.15)" : "none", stroke, d, nodes: [...state.penNodes]
    };
    state.vectorLayers.push(layer);
    push({ type: "insert_vector", vector: layer }, () => { state.vectorLayers = state.vectorLayers.filter(v => v.id !== layer.id); renderVectorLayer(); });
    state.penNodes = []; state.penSession = null; renderVectorLayer(); queueSave(); status("Path created.");
  }

  function finishPencilStroke() {
    if (!state.strokeSession) return;
    const result = TC().finishStroke(state.strokeSession, { fidelity: "high" });
    state.strokeSession = null;
    if (!result.d || result.points.length < 2) { renderVectorLayer(); return; }
    const xs = result.points.map(p => p.x), ys = result.points.map(p => p.y);
    const stroke = inkColor("--tk-ink-pencil", "#9aa4b8");
    const layer = {
      id: TC().uid(), type: "path", x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
      fill: "none", stroke, d: result.d, nodes: result.points.map(p => ({ x: p.x, y: p.y }))
    };
    state.vectorLayers.push(layer);
    push({ type: "insert_vector", vector: layer }, () => { state.vectorLayers = state.vectorLayers.filter(v => v.id !== layer.id); renderVectorLayer(); });
    renderVectorLayer(); queueSave(); status("Pencil stroke committed.");
  }

  const AI_SAFE_STYLE_PROPERTIES = new Set([
    "color", "background", "backgroundColor", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "textAlign", "textTransform", "textDecoration", "textDecorationLine", "textOverflow", "whiteSpace", "overflow", "display", "opacity", "borderRadius", "borderColor", "borderWidth", "borderStyle", "boxShadow", "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "margin", "marginTop", "marginRight", "marginBottom", "marginLeft", "gap", "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight", "objectFit", "objectPosition", "filter", "justifyContent", "alignItems", "flexDirection", "flexWrap", "gridTemplateColumns", "gridTemplateRows", "gridAutoFlow", "visibility"
  ]);

  function validateAiOperations(operations) {
    if (!Array.isArray(operations) || !operations.length || operations.length > 8) return false;
    let insertCount = 0;
    return operations.every(op => {
      if (!op || typeof op !== "object") return false;
      if (op.type === "update_text") return typeof op.text === "string" && op.text.trim().length > 0 && op.text.length <= 3000;
      if (op.type === "hide") return Object.keys(op).every(key => key === "type");
      if (op.type === "insert_component") return ["cta", "testimonial", "feature"].includes(op.component) && ++insertCount <= 1;
      if (op.type === "set_styles") {
        const entries = Object.entries(op.styles || {});
        return entries.length > 0 && entries.length <= 20 && entries.every(([property, value]) => AI_SAFE_STYLE_PROPERTIES.has(property) && typeof value === "string" && value.length <= 256 && !/(?:url\s*\(|expression\s*\(|javascript\s*:|@import|behavior\s*:|[;{}<>])/i.test(value));
      }
      return false;
    });
  }

  function selectionMatchesFingerprint(target, selectionFingerprint) {
    if (!target || !selectionFingerprint) return false;
    return target.tagName.toLowerCase() === selectionFingerprint.tag &&
      (selectionFingerprint.text || "") === (target.innerText || "").trim().slice(0, 160);
  }

  async function refreshAiCapabilities() {
    const result = await api("/api/ai/capabilities", "GET");
    state.aiCapabilities = result?.ok ? result.data : { status: "unavailable", error: result?.data?.error || "Could not reach tinkr AI." };
    pushPanelState();
    return state.aiCapabilities;
  }

  async function generate(promptText) {
    if (!state.selected) return status("Select a section or element first.");
    const prompt = promptText?.trim(); if (!prompt) return status("Describe the change.");
    if (state.aiRequest) return status("AI is already preparing a preview.");

    const selected = state.selected;
    const selectionFingerprint = fingerprint(selected);
    const requestId = operationId("ai");
    state.aiRequest = { id: requestId, selectionFingerprint };
    state.preview = null;
    status("Generating AI preview…");
    try {
      const element = describe(selected);
      delete element.html;
      // The background service worker owns this request. Content scripts run on
      // arbitrary origins, so direct fetches caused the previous CORS failures.
      const result = await api("/api/patch", "POST", { prompt, element, tokens: state.tokens, requestId, selectionFingerprint }, requestId);
      if (state.aiRequest?.id !== requestId) return; // cancelled or superseded
      if (!result?.ok) {
        const detail = result?.data?.error || "AI request failed.";
        const code = result?.data?.code ? ` (${result.data.code})` : "";
        throw new Error(`${detail}${code}`);
      }
      const data = result.data || {};
      if (data.requestId && data.requestId !== requestId) throw new Error("AI response did not match this request.");
      if (!validateAiOperations(data.operations)) throw new Error("AI returned an unsafe or malformed patch.");
      state.preview = { ...data, requestId, selectionFingerprint };
      status("AI preview ready — review, then apply.");
    } catch (error) {
      state.preview = null;
      status(`AI unavailable: ${error?.message || "unknown error"}`);
    } finally {
      if (state.aiRequest?.id === requestId) state.aiRequest = null;
      pushPanelState();
    }
  }

  function cancelGenerate() {
    if (!state.aiRequest) return;
    const requestId = state.aiRequest.id;
    state.aiRequest = null;
    chrome.runtime.sendMessage({ type: "TINKR_CANCEL_API", requestId }).catch(() => {});
    status("AI preview cancelled.");
    pushPanelState();
  }

  function canAppendAiComponent(target) {
    return /^(SECTION|MAIN|ARTICLE|ASIDE|DIV|LI|UL|OL)$/i.test(target?.tagName);
  }

  function applyPreview() {
    const preview = state.preview;
    if (!preview?.operations?.length || !validateAiOperations(preview.operations)) return status("This AI preview is no longer valid.");
    const target = TC().resolvePatchTarget({ selector: preview.selectionFingerprint?.selector, target: preview.selectionFingerprint }, document);
    if (!selectionMatchesFingerprint(target, preview.selectionFingerprint)) {
      return status("The selected layer changed — generate a fresh preview.");
    }

    const historyStart = state.history.length;
    const patchesStart = state.patches.length;
    const originalSelection = state.selected;
    try {
      for (const op of preview.operations) {
        state.selected = target;
        if (op.type === "update_text") updateText(op.text);
        if (op.type === "set_styles") Object.entries(op.styles).forEach(([property, value]) => setStyle(property, value));
        if (op.type === "hide") hide();
        if (op.type === "insert_component") {
          insertComponent(op.component, { anchor: target, placement: canAppendAiComponent(target) ? "append" : "after", select: false });
        }
      }
      state.selected = target;
      state.preview = null;
      status("AI patch applied as reversible layers.");
    } catch (error) {
      while (state.history.length > historyStart) {
        const entry = state.history.pop();
        state.patches.pop();
        try { entry.inverse?.(); } catch { /* best-effort transaction rollback */ }
      }
      state.selected = originalSelection;
      state.patches.length = patchesStart;
      status(`AI patch was not applied: ${error?.message || "transaction failed"}`);
    }
  }

  function runLab(code, name) {
    if (!state.selected || state.pendingLab) return status("Select an element first.");
    const requestId = crypto.randomUUID();
    state.pendingLab = { requestId, code, target: selectorFor(state.selected), anchor: fingerprint(state.selected), name: name || `Code Lab ${state.labs.length + 1}` };
    state.root.querySelector("#tinkr-sandbox").contentWindow.postMessage({ type: "TINKR_RUN_LAB", requestId, code, context: { element: describe(state.selected), tokens: state.tokens }, params: {} }, "*");
    status("Running Code Lab…");
  }

  function applyLab() {
    const lab = state.pendingLab; if (!lab?.operations) return;
    lab.operations.forEach(op => {
      if (op.type === "set_styles") Object.entries(op.styles || {}).forEach(([k, v]) => setStyle(k, v));
      if (op.type === "update_text") updateText(op.text);
      if (op.type === "insert_component") insertComponent(op.component);
      if (op.type === "hide") hide();
    });
    state.labs.push({ id: lab.requestId, name: lab.name, code: lab.code, target: lab.target, anchor: lab.anchor, operations: lab.operations, enabled: true, createdAt: new Date().toISOString() });
    state.labHasOps = false; state.labOutput = null; state.pendingLab = null;
    queueSave(); status("Code Lab applied.");
  }

  window.addEventListener("message", event => {
    const data = event.data;
    if (data?.type !== "TINKR_LAB_RESULT" || data.requestId !== state.pendingLab?.requestId) return;
    if (data.error) { status(`Code Lab failed: ${data.error}`); state.pendingLab = null; state.labOutput = null; state.labHasOps = false; pushPanelState(); return; }
    state.pendingLab.operations = data.operations || [];
    state.labOutput = JSON.stringify(data.operations, null, 2);
    state.labHasOps = Boolean(data.operations?.length);
    status("Code Lab preview ready.");
    pushPanelState();
  });

  function runAction(name) {
    ({
      duplicate, copy, paste, delete: deleteSelected, undo, redo, reset, "reset-page": resetPage, save, "run-lab": () => {}, "apply-lab": applyLab,
      generate: () => {}, apply: applyPreview, checkpoint: createCheckpoint, "export-patch": exportPatchJson,
      "add-section": () => {}, "pin-comment": () => setTool("comment", "pin"),
      "toggle-viewport": () => { applyViewport(); status("Board-layer zoom refreshed; source page stays at native scale."); },
      "add-hotspot": () => requestTextInput({ title: "Prototype link", label: "Section selector or URL", placeholder: "#pricing or https://…", confirmLabel: "Add link" }, value => { if (!value) return false; addHotspot(value); }),
      "add-motion": addMotionPreset, "boolean-union": () => booleanOp("union"), "export-slice": exportSliceCapture
    })[name]?.();
  }

  async function handleCmd(cmd, payload) {
    if (cmd === "toggle") return state.active ? deactivate(payload) : activate();
    if (cmd === "deactivate") return deactivate(payload);
    if (cmd === "setPanel") {
      state.panel = payload.panel || "design";
      if (payload.panel === "inspect") setDevMode(true);
      else if (payload.panel === "proto") setProtoMode(true);
      else if (payload.panel === "design" || payload.panel === "canvas") setDevMode(false);
      pushPanelState();
      return getPanelState();
    }
    if (cmd === "setTool") { setTool(payload.group, payload.variant); return getPanelState(); }
    if (cmd === "openLayerPicker") {
      const rect = state.selected?.getBoundingClientRect();
      openLayerPicker(rect ? rect.left + Math.min(rect.width / 2, 160) : Math.round(window.innerWidth / 2), rect ? rect.top + Math.min(rect.height / 2, 80) : Math.round(window.innerHeight / 2));
      return getPanelState();
    }
    if (cmd === "showShortcutReference") { window.TinkrToolbar?.openShortcutReference?.(state.root); return getPanelState(); }
    if (cmd === "openCommandPalette") { window.TinkrToolbar?.openCommandPalette?.(state.root); return getPanelState(); }
    if (cmd === "toggleTimeline") { state.timelineOpen = !state.timelineOpen; state.root?.querySelector("#tinkr-timeline")?.classList.toggle("tinkr-hide", !state.timelineOpen); renderTimeline(); pushPanelState(); return getPanelState(); }
    if (cmd === "setDevMode") { setDevMode(Boolean(payload.on)); return getPanelState(); }
    if (cmd === "setProtoMode") { setProtoMode(Boolean(payload.on)); return getPanelState(); }
    if (cmd === "setViewport") { state.viewport = { ...state.viewport, ...payload }; applyViewport(); queueSave(); pushPanelState(); return getPanelState(); }
    if (cmd === "setBreakpoint") { state.breakpoint = payload.breakpoint; status(`Editing ${state.breakpoint === "base" ? "base" : state.breakpoint + "px override"}.`); pushPanelState(); return getPanelState(); }
    if (cmd === "refreshAuth") { await refreshAuthState(Boolean(payload.sync)); return getPanelState(); }
    if (cmd === "resolveSyncConflict") { await resolveSyncConflict(payload.action); return getPanelState(); }
    if (cmd === "setStyle") { setStyle(payload.property, payload.value); return getPanelState(); }
    if (cmd === "setToken") { state.tokens[payload.key] = payload.value; applyTokens(); queueSave(); pushPanelState(); return getPanelState(); }
    if (cmd === "createVariable") { createVariable(payload); return getPanelState(); }
    if (cmd === "updateVariable") { updateVariable(payload); return getPanelState(); }
    if (cmd === "applyVariable") { applyVariable(payload.id, payload.property); return getPanelState(); }
    if (cmd === "selectProxy") { selectProxy(payload.id); return getPanelState(); }
    if (cmd === "selectVector") { selectVector(payload.id); return getPanelState(); }
    if (cmd === "selectLayer") {
      const layer = resolveLayerRef(payload);
      if (layer.kind === "proxy" && layer.value) selectProxy(layer.value.id);
      else if (layer.kind === "vector" && layer.value) selectVector(layer.value.id);
      else if (layer.kind === "section" && layer.value) window.scrollTo({ top: Math.max(0, layer.value.scrollY - 80), behavior: "smooth" });
      else if (layer.value) select(layer.value);
      else status("That layer is no longer available on this page.");
      return getPanelState();
    }
    if (cmd === "setLayerState") { setLayerState(payload); return getPanelState(); }
    if (cmd === "reorderOwnedLayers") { reorderOwnedLayers(payload); return getPanelState(); }
    if (cmd === "setMoveMode") { state.moveMode = payload.mode === "structural" ? "structural" : "visual"; status(state.moveMode === "visual" ? "Visual canvas mode enabled." : "Structural reorder mode enabled."); return getPanelState(); }
    if (cmd === "openAssetPicker") { insertImageFromPicker(); return getPanelState(); }
    if (cmd === "insertAssetById") {
      const asset = state.assets.find(a => a.id === payload.id);
      const href = assetHref(asset);
      if (!asset || !href) {
        status("That asset is unavailable offline. Reconnect to tinkr Cloud and try again.");
        return getPanelState();
      }
      const point = ownedCanvasPoint(80, 80);
      const layer = TC().createShape("image", point.x, point.y, 240, 160, { href, assetId: asset.id });
      state.vectorLayers.push(layer);
      push({ type: "insert_vector", vector: layer }, () => { state.vectorLayers = state.vectorLayers.filter(v => v.id !== layer.id); renderVectorLayer(); });
      renderVectorLayer(); selectVector(layer.id); queueSave();
      return getPanelState();
    }
    if (cmd === "insertComponentById") {
      const item = state.components.find(c => c.id === payload.id);
      if (item) insertSavedComponent(item, payload.variantId || "default");
      return getPanelState();
    }
    if (cmd === "detachComponent") { detachComponentInstance(); return getPanelState(); }
    if (cmd === "updateComponentVariant") { updateComponentVariant(payload.componentId, payload.variantId || "default", payload.html); return getPanelState(); }
    if (cmd === "setStyleLib") { state.styles = payload.styles || state.styles; queueSave(); pushPanelState(); return getPanelState(); }
    if (cmd === "selectCrumb") { selectCrumb(payload.index); return getPanelState(); }
    if (cmd === "context") { contextAction(payload.action, payload.value); return getPanelState(); }
    if (cmd === "action") { runAction(payload.name); return getPanelState(); }
    if (cmd === "insertComponent") { insertComponent(payload.kind); return getPanelState(); }
    if (cmd === "autoLayout") { autoLayout(payload.kind); return getPanelState(); }
    if (cmd === "generate") { generate(payload.prompt); return getPanelState(); }
    if (cmd === "cancelGenerate") { cancelGenerate(); return getPanelState(); }
    if (cmd === "runLab") { runLab(payload.code, payload.name); return getPanelState(); }
    if (cmd === "addSection") { addSection(payload.label, state.selected); return getPanelState(); }
    if (cmd === "pinComment") { setTool("comment", "pin"); return getPanelState(); }
    if (cmd === "scrollSection") { const s = state.sections.find(x => x.id === payload.id); if (s) window.scrollTo({ top: s.scrollY - 80, behavior: "smooth" }); return getPanelState(); }
    return getPanelState();
  }

  function startDrag(event) {
    if (state.textEdit) {
      if (state.textEdit.el.contains(event.target)) return;
      finishInlineTextEdit(true);
    }
    // Placement picking is a click-only interaction.  It must run before the
    // regular selection pipeline, otherwise select() clears layerPick on the
    // pointer down that is meant to choose the target layer.
    if (state.layerPick && event.button === 0 && !isToolbarTarget(event.target)) {
      const target = pageElementAt(event.clientX, event.clientY);
      if (target && !isTinkr(target) && target !== state.selected) {
        event.preventDefault();
        return;
      }
    }
    const proxy = event.target?.closest?.("[data-tinkr-proxy-id]");
    if (proxy && event.button === 0 && TC().shouldSelectElements(state.tool)) {
      const layer = state.visualLayers.find(item => item.id === proxy.dataset.tinkrProxyId);
      if (layer) {
        if (layer.locked) { status("This visual layer is locked. Unlock it from Layers to move it."); return; }
        selectProxy(layer.id, { add: event.shiftKey });
        if (event.shiftKey) {
          state.suppressClick = true;
          setTimeout(() => { state.suppressClick = false; }, 0);
          event.preventDefault(); event.stopPropagation();
          return;
        }
        state.press = { kind: "proxy", layer, x: event.clientX, y: event.clientY };
        setInteraction("pending-click", { pointerId: event.pointerId, target: layer.id });
        state.suppressClick = true;
        event.preventDefault(); event.stopPropagation();
        return;
      }
    }
    if (event.target?.classList?.contains("tinkr-scale-handle") && state.tool.variant === "scale") {
      const handle = event.target.dataset.handle;
      const vector = state.vectorLayers.find(layer => layer.id === state.selectedVectorId);
      if (vector) {
        if (vector.locked) { status("This vector is locked. Unlock it from Layers to resize it."); return; }
        beginVectorScale(vector, handle, event);
        event.preventDefault(); event.stopPropagation(); return;
      }
      if (state.selected) {
        state.scaleSession = { handle, el: state.selected, start: snapshot(state.selected), rect: state.selected.getBoundingClientRect(), x: event.clientX, y: event.clientY, translate: translateParts(state.selected.style.translate) };
        setInteraction("resizing", { pointerId: event.pointerId, handle });
        capturePointer(event); event.preventDefault(); return;
      }
    }
    if (isToolbarTarget(event.target)) return;
    if (state.spaceHand || TC().shouldPan(state.tool)) {
      state.panSession = { x: event.clientX, y: event.clientY, scrollX: window.scrollX, scrollY: window.scrollY };
      setInteraction("panning", { pointerId: event.pointerId });
      capturePointer(event);
      event.preventDefault(); return;
    }
    if (state.tool.group === "draw" && state.tool.variant === "eyedropper") {
      sampleColorAt(event.clientX, event.clientY);
      event.preventDefault(); return;
    }
    if (state.tool.group === "draw" && state.tool.variant === "pencil") {
      state.strokeSession = TC().createStrokeSession("pencil");
      const point = ownedCanvasPoint(event.clientX, event.clientY);
      TC().addPoint(state.strokeSession, point.x, point.y);
      capturePointer(event);
      event.preventDefault(); return;
    }
    if (state.tool.group === "draw" && state.tool.variant === "pen") {
      const point = ownedCanvasPoint(event.clientX, event.clientY);
      const x = point.x, y = point.y;
      const editingLayer = state.vectorLayers.find(layer => layer.id === state.selectedVectorId) || null;
      const before = editingLayer ? copyPatchValue(editingLayer) : null;
      if (event.detail === 2) { finishPenPath(true); return; }
      const hit = TC().hitTestNode(state.penNodes, x, y);
      if (hit >= 0) {
        state.penSession = { nodeIndex: hit, drag: state.vectorEditMode === "bend" ? "bend" : "move", startX: x, startY: y, before };
      } else {
        const node = { x, y };
        state.penNodes.push(node);
        state.penSession = { nodeIndex: state.penNodes.length - 1, drag: "bend", startX: x, startY: y, origin: { ...node }, before };
      }
      capturePointer(event);
      renderVectorLayer(); event.preventDefault(); return;
    }
    if (TC().isCreationTool(state.tool) || state.drawSession?.type === "slice") {
      state.drawSession = { ...(state.drawSession || {}), startX: event.clientX, startY: event.clientY, active: true };
      setInteraction("drawing", { pointerId: event.pointerId, tool: state.tool.variant });
      capturePointer(event);
      event.preventDefault(); return;
    }
    if (event.button !== 0) return;
    if (state.tool.devMode) {
      const inspectTarget = selectCandidateAt(event);
      if (inspectTarget) {
        select(inspectTarget);
        event.preventDefault(); event.stopPropagation();
      }
      return;
    }

    if (!TC().shouldSelectElements(state.tool) && !TC().shouldScale(state.tool)) return;

    // Source pages are not a transformed artboard, so marquee selection is
    // intentionally limited to genuine blank page space and Tinkr-owned
    // layers. It never captures or mutates source DOM children.
    if (state.tool.group === "move" && state.tool.variant === "select" &&
      (event.target === document.body || event.target === document.documentElement) &&
      (state.visualLayers.length || state.vectorLayers.length)) {
      state.marquee = { startX: event.clientX, startY: event.clientY, rect: null };
      setInteraction("marquee", { pointerId: event.pointerId });
      capturePointer(event);
      event.preventDefault(); event.stopPropagation();
      return;
    }

    // Canvas layers have first refusal, then the deepest visible DOM node. This
    // makes text inside cards selectable without requiring an Alt-click.
    const vectorPoint = ownedCanvasPoint(event.clientX, event.clientY);
    const hitVector = [...state.vectorLayers].reverse().find(v => v.visible !== false && !v.locked && TC().hitTest(v, vectorPoint.x, vectorPoint.y));
    if (hitVector) {
      selectVector(hitVector.id, { add: event.shiftKey });
      if (event.shiftKey) {
        state.suppressClick = true;
        setTimeout(() => { state.suppressClick = false; }, 0);
        event.preventDefault(); event.stopPropagation();
        return;
      }
      state.vectorPress = { layer: hitVector, before: { ...hitVector }, x: event.clientX, y: event.clientY };
      setInteraction("pending-click", { pointerId: event.pointerId, target: hitVector.id });
      state.suppressClick = true;
      event.preventDefault(); event.stopPropagation();
      return;
    }
    const el = selectCandidateAt(event);
    if (!el) return;
    const ref = domLayerRef(el);
    if (ref?.locked) {
      status("This layer is locked. Unlock it from Layers to move it.");
      return;
    }
    select(el, { add: event.shiftKey });
    if (event.shiftKey) {
      // The browser sends a click after pointerdown. Preserve this one toggle
      // and consume the follow-up click so multi-select never immediately
      // toggles itself back or climbs the selection stack.
      state.suppressClick = true;
      setTimeout(() => { state.suppressClick = false; }, 0);
      event.preventDefault(); event.stopPropagation();
      return;
    }
    const owned = el.hasAttribute("data-tinkr-owned") || el.hasAttribute("data-tinkr-wireframe");
    state.press = { kind: "element", el, flow: state.moveMode === "structural" && !owned, x: event.clientX, y: event.clientY };
    setInteraction("pending-click", { pointerId: event.pointerId, target: selectorFor(el) });
    // Selection is immediate; movement starts only after a deliberate drag.
    state.suppressClick = true;
    event.preventDefault(); event.stopPropagation();
  }

  function moveDrag(event) {
    if (state.marquee) {
      updateMarquee(event.clientX, event.clientY);
      return;
    }
    if (state.vectorScaleSession) {
      updateVectorScale(state.vectorScaleSession, event);
      return;
    }
    if (state.vectorPress && !state.vectorDrag) {
      const press = state.vectorPress;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 4) {
        state.vectorDrag = press;
        state.vectorPress = null;
        capturePointer(event);
        setInteraction("dragging", { pointerId: event.pointerId, target: press.layer.id, kind: "vector" });
        status("Moving vector layer.");
      }
    }
    if (state.vectorDrag) {
      const drag = state.vectorDrag;
      const boardScale = Math.max(0.25, Number(state.viewport.scale) || 1);
      drag.layer.tx = Math.round((drag.before.tx || 0) + (event.clientX - drag.x) / boardScale);
      drag.layer.ty = Math.round((drag.before.ty || 0) + (event.clientY - drag.y) / boardScale);
      renderVectorLayer();
      placeVectorBox(drag.layer);
      return;
    }
    if (state.panSession) {
      const dx = event.clientX - state.panSession.x;
      const dy = event.clientY - state.panSession.y;
      window.scrollTo({ left: Math.max(0, state.panSession.scrollX - dx), top: Math.max(0, state.panSession.scrollY - dy) });
      return;
    }
    if (state.drawSession?.active && state.drawSession.startX != null) {
      const x = Math.min(state.drawSession.startX, event.clientX), y = Math.min(state.drawSession.startY, event.clientY);
      const w = Math.abs(event.clientX - state.drawSession.startX), h = Math.abs(event.clientY - state.drawSession.startY);
      const point = ownedCanvasPoint(x, y), scale = ownedBoardScale();
      state.drawSession.preview = TC().createShape(state.tool.variant === "rect" ? "rect" : state.tool.variant, point.x, point.y, w / scale, h / scale, { fill: "rgba(124,233,255,0.12)" });
      renderVectorLayer(); return;
    }
    if (state.strokeSession) {
      const point = ownedCanvasPoint(event.clientX, event.clientY);
      TC().schedulePoint(state.strokeSession, point.x, point.y, () => renderVectorLayer(), { shiftKey: event.shiftKey });
      return;
    }
    if (state.penSession && state.tool.group === "draw" && state.tool.variant === "pen") {
      const idx = state.penSession.nodeIndex;
      const node = state.penNodes[idx];
      if (!node) return;
      const point = ownedCanvasPoint(event.clientX, event.clientY);
      const x = point.x, y = point.y;
      if (state.penSession.drag === "move" || state.vectorEditMode === "move") {
        TC().moveNode(state.penNodes, idx, x, y);
        const layer = state.vectorLayers.find(v => v.id === state.selectedVectorId);
        if (layer) { layer.nodes = [...state.penNodes]; layer.d = TC().bezierToD(state.penNodes); }
      } else {
        node.cp2x = x; node.cp2y = y;
        if (idx > 0) {
          const prev = state.penNodes[idx - 1];
          prev.cp2x = x; prev.cp2y = y;
        }
      }
      renderVectorLayer(); return;
    }
    if (state.scaleSession) {
      const s = state.scaleSession, dx = event.clientX - s.x, dy = event.clientY - s.y;
      const el = s.el;
      const widthDelta = s.handle.includes("e") ? dx : s.handle.includes("w") ? -dx : 0;
      const heightDelta = s.handle.includes("s") ? dy : s.handle.includes("n") ? -dy : 0;
      let width = Math.max(20, s.rect.width + widthDelta), height = Math.max(20, s.rect.height + heightDelta);
      if (event.shiftKey && widthDelta && heightDelta) { const ratio = s.rect.width / Math.max(1, s.rect.height); if (Math.abs(widthDelta) > Math.abs(heightDelta)) height = Math.max(20, width / ratio); else width = Math.max(20, height * ratio); }
      if (widthDelta) el.style.width = `${Math.round(width)}px`;
      if (heightDelta) el.style.height = `${Math.round(height)}px`;
      // Resize from the handle that was grabbed. Translate lets source DOM
      // retain its original flow position instead of forcing a new layout mode.
      const nextTranslate = { ...s.translate };
      if (s.handle.includes("w")) nextTranslate.x += s.rect.width - width;
      if (s.handle.includes("n")) nextTranslate.y += s.rect.height - height;
      el.style.translate = `${Math.round(nextTranslate.x)}px ${Math.round(nextTranslate.y)}px`;
      status(`Scaling · ${Math.round(width)} × ${Math.round(height)}${event.shiftKey ? " · ratio locked" : ""}`);
      placeBox("#tinkr-selected", el); return;
    }
    if (state.press && !state.drag) {
      const press = state.press;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4) return;
      state.press = null;
      if (press.kind === "proxy") state.drag = beginProxyDrag(press.layer, { ...event, clientX: press.x, clientY: press.y });
      else state.drag = beginLayerDrag(press.el, { ...event, clientX: press.x, clientY: press.y }, press.flow);
      capturePointer(event);
      setInteraction(state.drag?.flow ? "reordering" : "dragging", { pointerId: event.pointerId, target: press.kind === "proxy" ? press.layer.id : selectorFor(press.el) });
      if (state.drag?.flow) status("Structural reorder · drag between sibling layers.");
      else status("Visual move · drop over another layer to place above it.");
    }
    if (!state.drag) return;
    const d = state.drag;
    if (d.kind === "proxy") {
      const scale = state.viewport.scale || 1;
      d.layer.x = Math.round(d.before.x + (event.clientX - d.x) / scale);
      d.layer.y = Math.round(d.before.y + (event.clientY - d.y) / scale);
      renderVisualLayers();
      return;
    }
    if (d.flow) {
      const hit = pageElementAt(event.clientX, event.clientY);
      let sibling = hit;
      while (sibling && sibling.parentElement !== d.parent) sibling = sibling.parentElement;
      if (sibling && sibling !== d.el) {
        const rect = sibling.getBoundingClientRect(), direction = getComputedStyle(d.parent).flexDirection;
        const horizontal = direction?.startsWith("row") || getComputedStyle(d.parent).display.includes("grid");
        const before = horizontal ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
        const ref = before ? sibling : sibling.nextElementSibling;
        if (ref !== d.el && d.el.nextElementSibling !== ref) {
          d.parent.insertBefore(d.el, ref);
          const indicator = state.root?.querySelector("#tinkr-insert-indicator");
          if (indicator) {
            Object.assign(indicator.style, horizontal
              ? { left: `${before ? rect.left : rect.right}px`, top: `${rect.top}px`, width: "2px", height: `${rect.height}px` }
              : { left: `${rect.left}px`, top: `${before ? rect.top : rect.bottom}px`, width: `${rect.width}px`, height: "2px" });
            indicator.classList.remove("tinkr-hide");
          }
          placeBox("#tinkr-selected", d.el);
        }
      }
      return;
    }
    // Source DOM is never canvas-scaled; map its movement one-to-one with the
    // pointer. Only owned proxies and vectors use the board-scale conversion.
    const dx = Math.round(event.clientX - d.x), dy = Math.round(event.clientY - d.y);
    d.el.style.translate = `${d.baseTranslate.x + dx}px ${d.baseTranslate.y + dy}px`;
    d.dropTarget = layerTargetAt(event.clientX, event.clientY, d.el);
    showLayerTarget(d.dropTarget);
    placeBox("#tinkr-selected", d.el);
  }

  function endDrag(event) {
    if (state.marquee) {
      updateMarquee(event.clientX, event.clientY);
      state.suppressClick = true;
      selectOwnedLayersInMarquee();
      releasePointer(event);
      setTimeout(() => { state.suppressClick = false; }, 0);
      return;
    }
    if (state.vectorScaleSession) {
      const session = state.vectorScaleSession;
      const after = { ...session.layer };
      const changed = ["x", "y", "scaleX", "scaleY"].some(key => after[key] !== session.before[key]);
      if (changed) {
        push(
          { type: "update_vector", vectorId: session.layer.id, before: session.before, after },
          () => { Object.assign(session.layer, session.before); renderVectorLayer(); placeVectorBox(session.layer); },
          () => { Object.assign(session.layer, after); renderVectorLayer(); placeVectorBox(session.layer); }
        );
        status("Vector resized.");
      } else Object.assign(session.layer, session.before);
      state.vectorScaleSession = null;
      renderVectorLayer();
      releasePointer(event);
      return;
    }
    if (state.vectorPress && !state.vectorDrag) {
      state.vectorPress = null;
      state.suppressClick = false;
      releasePointer(event);
      return;
    }
    if (state.vectorDrag) {
      const drag = state.vectorDrag;
      const moved = Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3;
      if (moved) {
        const after = { ...drag.layer };
        push({ type: "update_vector", vectorId: drag.layer.id, before: drag.before, after }, () => { Object.assign(drag.layer, drag.before); renderVectorLayer(); placeVectorBox(drag.layer); }, () => { Object.assign(drag.layer, after); renderVectorLayer(); placeVectorBox(drag.layer); });
        status("Vector moved.");
      } else Object.assign(drag.layer, drag.before);
      state.vectorDrag = null;
      renderVectorLayer();
      releasePointer(event);
      return;
    }
    if (state.panSession) { state.panSession = null; queueSave(); releasePointer(event); return; }
    if (state.drawSession?.active && state.drawSession.startX != null) {
      const x = Math.min(state.drawSession.startX, event.clientX), y = Math.min(state.drawSession.startY, event.clientY);
      const w = event.clientX - state.drawSession.startX, h = event.clientY - state.drawSession.startY;
      if (Math.abs(w) > 4 || Math.abs(h) > 4) finishShapeDraw(x, y, w, h);
      state.drawSession = null; state.drawSession?.preview && delete state.drawSession.preview;
      renderVectorLayer(); releasePointer(event); return;
    }
    if (state.strokeSession) {
      finishPencilStroke(); releasePointer(event); return;
    }
    if (state.penSession) {
      const session = state.penSession;
      state.penSession = null;
      const layer = state.vectorLayers.find(v => v.id === state.selectedVectorId);
      if (layer?.nodes) {
        layer.nodes = [...state.penNodes];
        layer.d = TC().bezierToD(state.penNodes);
        const after = copyPatchValue(layer);
        if (session.before && JSON.stringify(session.before) !== JSON.stringify(after)) {
          push({ type: "update_vector", vectorId: layer.id, before: session.before, after }, () => { Object.assign(layer, session.before); renderVectorLayer(); }, () => { Object.assign(layer, after); renderVectorLayer(); });
        }
      }
      releasePointer(event); return;
    }
    if (state.scaleSession) {
      const el = state.scaleSession.el;
      push({ type: "set_styles", selector: selectorFor(el), styles: { width: el.style.width, height: el.style.height, translate: el.style.translate } }, () => restore(el, state.scaleSession.start));
      state.scaleSession = null; releasePointer(event); return;
    }
    if (state.press && !state.drag) {
      state.press = null;
      // The click event follows pointerup. Keep the selection made on pointer
      // down, then release this guard immediately afterward.
      setTimeout(() => { state.suppressClick = false; }, 0);
      releasePointer(event);
      return;
    }
    if (!state.drag) return;
    const d = state.drag;
    if (d.kind === "proxy") {
      const moved = Math.hypot(event.clientX - d.x, event.clientY - d.y) > 3;
      if (moved) {
        state.suppressClick = true;
        if (d.promoted) recordVisualProxyCreation(d.layer, d.source);
        push({ type: "update_proxy", proxyId: d.layer.id, before: d.before, after: { ...d.layer } }, () => { Object.assign(d.layer, d.before); renderVisualLayers(); });
      } else {
        Object.assign(d.layer, d.before);
        discardPromotedProxy(d);
      }
      state.drag = null; releasePointer(event); renderVisualLayers();
      setTimeout(() => { state.suppressClick = false; }, 0);
      return;
    }
    if (d.flow) {
      const before = d.el.nextElementSibling;
      const changed = before !== d.originalNext;
      if (changed) push({ type: "reorder_dom", selector: d.selector, target: fingerprint(d.el), parent: selectorFor(d.parent), before: before ? selectorFor(before) : null }, () => d.parent.insertBefore(d.el, d.originalNext));
      else restore(d.el, d.before);
      state.root?.querySelector("#tinkr-insert-indicator")?.classList.add("tinkr-hide");
      state.drag = null; releasePointer(event); status(changed ? "Layer reordered." : "Reorder cancelled.");
      setTimeout(() => { state.suppressClick = false; }, 0);
      return;
    }
    commitLayerDrag(d);
    const moved = Math.hypot(event.clientX - d.x, event.clientY - d.y) > 3;
    if (moved) {
      state.suppressClick = true;
      push({ type: "move_layer", selector: selectorFor(d.el), target: fingerprint(d.el), before: { style: d.before.style }, after: { styles: { position: d.el.style.position, translate: d.el.style.translate, zIndex: d.el.style.zIndex } } }, () => restore(d.el, d.before));
      // Every overlap drop goes through the same normalized Arrange engine as
      // the inspector commands. This avoids z-index:auto arithmetic and
      // promotes cross-context targets to visual copies when necessary.
      if (d.dropTarget && d.dropTarget !== d.el) arrangeElement(d.el, "above", d.dropTarget);
    } else restore(d.el, d.before);
    state.root?.querySelector("#tinkr-layer-target")?.classList.add("tinkr-hide");
    state.drag = null; releasePointer(event);
    setTimeout(() => { state.suppressClick = false; }, 0);
  }

  function cancelPointerInteraction() {
    const pending = state.vectorScaleSession || state.vectorDrag || state.vectorPress || state.scaleSession || state.drawSession?.active || state.strokeSession || state.penSession || state.panSession || state.marquee || state.drag || state.press;
    if (!pending) return;
    onKey({ key: "Escape", target: document.body, preventDefault() {} });
  }

  // One capture-phase pointer move pipeline: manipulate first, then update
  // hover/cursor feedback from the settled interaction state.
  function onPointerMove(event) {
    moveDrag(event);
    onMove(event);
  }

  function onMove(event) {
    if (!state.active) return;
    if (isToolbarTarget(event.target)) {
      state.root?.querySelector("#tinkr-cursor")?.classList.add("tinkr-hide");
      state.root?.querySelector("#tinkr-cursor-label")?.classList.add("tinkr-hide");
      return;
    }
    scheduleOverlayRender();
    const el = pageElementAt(event.clientX, event.clientY);
    updateCursor(event, el);
    if (el && !isTinkr(el)) {
      if (state.layerPick && el !== state.selected) showLayerTarget(el);
      else if (state.layerPick) showLayerTarget(null);
      if (!state.drag && !state.tool.devMode && TC().shouldSelectElements(state.tool) && el !== state.hover) {
        state.hover = el; placeBox("#tinkr-hover", el);
      } else if (state.tool.devMode && el !== state.hover) {
        state.hover = el; renderDevOverlay();
      }
    } else if (state.hover && !state.drag) {
      state.hover = null; placeBox("#tinkr-hover");
    }
  }

  function onClick(event) {
    if (!state.active || isToolbarTarget(event.target)) return;
    if (state.workspaceMode === "dev") {
      // Dev Mode inspects on pointer-down and never activates the source page.
      event.preventDefault(); event.stopPropagation();
      return;
    }
    if (state.workspaceMode === "prototype") {
      event.preventDefault(); event.stopPropagation();
      const hit = pageElementAt(event.clientX, event.clientY);
      const selector = hit ? selectorFor(hit) : "";
      const link = state.prototypeLinks.find(item => item.selector === selector);
      if (!link) { status("No tinkr prototype interaction is linked to this layer."); return; }
      if (String(link.target).startsWith("#")) {
        const target = document.querySelector(link.target);
        if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); status(`Prototype moved to ${link.target}.`); return; }
      }
      const section = state.sections.find(item => item.id === link.target || item.label === link.target);
      if (section) { window.scrollTo({ top: Math.max(0, section.scrollY - 80), behavior: "smooth" }); status(`Prototype moved to ${section.label}.`); return; }
      status("Prototype links stay inside this tinkr remix; external navigation is disabled.");
      return;
    }
    if (state.layerPick && (state.selected || selectedProxy())) {
      const hit = pageElementAt(event.clientX, event.clientY);
      if (hit && !isTinkr(hit) && hit !== state.selected) {
        event.preventDefault(); event.stopPropagation();
        arrangeSelected(state.layerPick, hit);
        clearLayerPick();
        pushPanelState();
        return;
      }
    }
    const proxy = event.target?.closest?.("[data-tinkr-proxy-id]");
    if (proxy) { selectProxy(proxy.dataset.tinkrProxyId, { add: event.shiftKey }); event.preventDefault(); event.stopPropagation(); return; }
    if (state.suppressClick) { state.suppressClick = false; return; }
    if (state.tool.group === "comment" || state.pinCommentMode) {
      event.preventDefault(); event.stopPropagation();
      const target = pageElementAt(event.clientX, event.clientY) || document.body;
      requestTextInput({ title: "Add comment", label: "Comment", placeholder: "Leave clear feedback…", confirmLabel: "Post comment", multiline: true }, body => {
        if (!body) return false;
        addLocalComment(body, target);
        state.pinCommentMode = false;
        setTool("move", "select");
        status("Comment pinned.");
      });
      return;
    }
    if (state.spaceHand) return;
    if (state.tool.group === "draw" && state.tool.variant === "pen") return;
    if (TC().isCreationTool(state.tool)) return;
    if (state.spaceHand || TC().shouldPan(state.tool)) return;
    if (!TC().shouldSelectElements(state.tool) && state.tool.variant !== "scale") return;
    event.preventDefault(); event.stopPropagation();
    if (state.tool.group === "draw" && state.tool.variant === "eyedropper") {
      sampleColorAt(event.clientX, event.clientY); return;
    }
    const vectorPoint = ownedCanvasPoint(event.clientX, event.clientY);
    const hitVector = [...state.vectorLayers].reverse().find(v => v.visible !== false && !v.locked && TC().hitTest(v, vectorPoint.x, vectorPoint.y));
    if (hitVector) { selectVector(hitVector.id, { add: event.shiftKey }); return; }
    const hit = selectCandidateAt(event);
    if (!hit) return;
    select(hit, { add: event.shiftKey });
  }

  function onContextMenu(event) {
    if (!state.active || isToolbarTarget(event.target) || state.workspaceMode !== "design") return;
    if (!TC().shouldSelectElements(state.tool)) return;
    event.preventDefault();
    event.stopPropagation();
    openLayerPicker(event.clientX, event.clientY);
  }

  function onDoubleClick(event) {
    if (!state.active || isToolbarTarget(event.target) || state.workspaceMode !== "design") return;
    const target = pageElementAt(event.clientX, event.clientY);
    if (!target || !beginInlineTextEdit(target)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function selectParentLayer() {
    const parent = state.selected?.parentElement;
    if (!parent || parent === document.body || isTinkr(parent)) return status("This is already the top editable layer.");
    select(parent);
  }

  function selectChildLayer() {
    const child = [...(state.selected?.children || [])].find(node => !isTinkr(node) && !SKIP.has(node.tagName) && getComputedStyle(node).display !== "none");
    if (!child) return status("This layer has no editable child layers.");
    select(child);
  }

  function selectSiblingLayer(delta) {
    const siblings = [...(state.selected?.parentElement?.children || [])].filter(node => !isTinkr(node) && !SKIP.has(node.tagName) && getComputedStyle(node).display !== "none");
    const current = siblings.indexOf(state.selected);
    if (current < 0 || !siblings.length) return status("No sibling layers are available.");
    const next = siblings[(current + delta + siblings.length) % siblings.length];
    select(next);
  }

  function onKey(event) {
    if (!state.active) return;
    if (event.key === "Escape") {
      const picker = state.root?.querySelector("#tinkr-layer-picker");
      if (picker && !picker.classList.contains("tinkr-hide")) { closeLayerPicker(); status("Layer picker closed."); return; }
      if (state.layerPick) { clearLayerPick(); status("Layer placement cancelled."); return; }
      if (state.marquee) { clearMarquee(); releasePointer(event); status("Marquee selection cancelled."); return; }
      if (state.vectorScaleSession) { Object.assign(state.vectorScaleSession.layer, state.vectorScaleSession.before); state.vectorScaleSession = null; renderVectorLayer(); placeVectorBox(state.vectorLayers.find(layer => layer.id === state.selectedVectorId)); releasePointer(event); status("Vector resize cancelled."); return; }
      if (state.vectorDrag) { Object.assign(state.vectorDrag.layer, state.vectorDrag.before); state.vectorDrag = null; renderVectorLayer(); releasePointer(event); status("Vector move cancelled."); return; }
      if (state.vectorPress) { state.vectorPress = null; status("Vector move cancelled."); return; }
      if (state.press) { state.press = null; state.suppressClick = false; status("Move cancelled."); return; }
      if (state.drag) {
        const drag = state.drag;
        if (drag.kind === "proxy") { Object.assign(drag.layer, drag.before); discardPromotedProxy(drag); renderVisualLayers(); }
        else if (drag.flow) drag.parent?.insertBefore(drag.el, drag.originalNext);
        else restore(drag.el, drag.before);
        state.drag = null; state.root?.querySelector("#tinkr-layer-target")?.classList.add("tinkr-hide"); releasePointer(event); status("Move cancelled."); return;
      }
      if (state.scaleSession) { restore(state.scaleSession.el, state.scaleSession.start); state.scaleSession = null; releasePointer(event); status("Scale cancelled."); return; }
      if (state.drawSession?.active) { state.drawSession = null; renderVectorLayer(); releasePointer(event); status("Drawing cancelled."); return; }
      if (state.panSession) { state.panSession = null; releasePointer(event); status("Pan cancelled."); return; }
      if (state.strokeSession) { state.strokeSession = null; renderVectorLayer(); releasePointer(event); return; }
      if (state.penNodes.length) { state.penNodes = []; state.penSession = null; renderVectorLayer(); releasePointer(event); return; }
      if (state.tool.devMode) { setDevMode(false); return; }
      if (state.selected || state.selectedProxyId || state.selectedVectorId) {
        state.selected = null; state.selectedProxyId = null; state.selectedVectorId = null;
        setSelection(null);
        state.pickCycle = null;
        placeBox("#tinkr-selected"); renderVisualLayers(); renderVectorLayer();
        status("Selection cleared.");
        return;
      }
      deactivate({ flush: true }); return;
    }
    if (event.target.matches("input,textarea,[contenteditable='true']")) return;
    const mod = event.ctrlKey || event.metaKey;
    if (state.selected && event.key === "Enter") {
      event.preventDefault();
      event.shiftKey ? selectParentLayer() : selectChildLayer();
      return;
    }
    if (state.selected && event.key === "Tab") {
      event.preventDefault();
      selectSiblingLayer(event.shiftKey ? -1 : 1);
      return;
    }
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
    if ((event.key === "Delete" || event.key === "Backspace") && !state.tool.devMode) { event.preventDefault(); deleteSelected(); return; }
    if (event.code === "Space" && !event.repeat) {
      if (!state.spaceHand) state.spaceHand = true;
      event.preventDefault();
      pushPanelState();
      return;
    }
    if (event.shiftKey && event.key.toLowerCase() === "d") { event.preventDefault(); setDevMode(!state.tool.devMode); return; }
    if (event.shiftKey && event.key.toLowerCase() === "i") { event.preventDefault(); state.panel = "design"; status("Resources: use + components in side panel or drag from dashboard."); pushPanelState(); return; }
    if (event.shiftKey && event.key.toLowerCase() === "p") setTool("draw", "pencil");
    else if (event.key.toLowerCase() === "p") setTool("draw", "pen");
    if (event.shiftKey && event.key.toLowerCase() === "s") setTool("region", "section");
    else if (event.key.toLowerCase() === "s") setTool("region", "slice");
    if (event.shiftKey && event.key.toLowerCase() === "l") setTool("shape", "arrow");
    else if (event.key.toLowerCase() === "l") setTool("shape", "line");
    if (event.key.toLowerCase() === "v") setTool("move", "select");
    if (event.key.toLowerCase() === "h") setTool("move", "hand");
    if (event.key.toLowerCase() === "k") setTool("move", "scale");
    if (event.key.toLowerCase() === "i") setTool("draw", "eyedropper");
    if (event.key.toLowerCase() === "c" && !mod) setTool("comment", "pin");
    if (event.key.toLowerCase() === "r") setTool("shape", "rect");
    if (event.key.toLowerCase() === "f") setTool("region", "frame");
    if (event.key.toLowerCase() === "o") setTool("shape", "ellipse");
    if (event.key.toLowerCase() === "t") setTool("text", "text");
    if (state.selectedVectorId && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)) {
      const layer = state.vectorLayers.find(item => item.id === state.selectedVectorId);
      if (!layer) return;
      if (layer.locked) { event.preventDefault(); status("This vector is locked. Unlock it from Layers to move it."); return; }
      event.preventDefault();
      const before = { ...layer }, step = event.shiftKey ? 8 : 1;
      layer.tx = (Number(layer.tx) || 0) + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0);
      layer.ty = (Number(layer.ty) || 0) + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0);
      const after = { ...layer };
      renderVectorLayer(); placeVectorBox(layer);
      push({ type: "update_vector", vectorId: layer.id, before, after }, () => { Object.assign(layer, before); renderVectorLayer(); placeVectorBox(layer); }, () => { Object.assign(layer, after); renderVectorLayer(); placeVectorBox(layer); });
      return;
    }
    if (selectedProxy() && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)) {
      event.preventDefault(); const layer = selectedProxy(), before = { ...layer }, step = event.shiftKey ? 8 : 1;
      if (event.key === "ArrowUp") layer.y -= step;
      if (event.key === "ArrowDown") layer.y += step;
      if (event.key === "ArrowLeft") layer.x -= step;
      if (event.key === "ArrowRight") layer.x += step;
      renderVisualLayers(); push({ type: "update_proxy", proxyId: layer.id, before, after: { ...layer } }, () => { Object.assign(layer, before); renderVisualLayers(); });
      return;
    }
    if (state.selected && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key) && TC().shouldSelectElements(state.tool)) {
      event.preventDefault(); const step = event.shiftKey ? 8 : 1; const property = /Left|Right/.test(event.key) ? "left" : "top"; const direction = /Up|Left/.test(event.key) ? -1 : 1;
      const before = snapshot(state.selected);
      const prepared = prepareVisualLayer(state.selected);
      const current = translateParts(state.selected.style.translate);
      state.selected.style.translate = `${current.x + (property === "left" ? direction * step : 0)}px ${current.y + (property === "top" ? direction * step : 0)}px`;
      push({ type: "move_layer", selector: selectorFor(state.selected), target: fingerprint(state.selected), before: { style: before.style }, after: { styles: { position: state.selected.style.position, translate: state.selected.style.translate, zIndex: state.selected.style.zIndex } } }, () => restore(state.selected, prepared.before));
      placeBox("#tinkr-selected", state.selected);
    }
  }

  function onWheel(event) {
    if (!state.active || !event.ctrlKey) return;
    event.preventDefault();
    state.viewport.scale = Math.min(3, Math.max(0.25, state.viewport.scale + (event.deltaY > 0 ? -0.05 : 0.05)));
    applyViewport(); queueSave();
  }

  function onScroll() {
    if (!state.active) return;
    state.vectorRenderDirty = true;
    scheduleOverlayRender();
  }

  async function bootFromUrl() {
    const params = new URLSearchParams(location.search);
    const projectId = params.get("tinkr_project");
    const importToken = params.get("tinkr_import");
    if (projectId) {
      if (!state.signedIn) {
        setSyncState("signin", "Sign in to open this tinkr project.");
        return loadCachedProject(projectId);
      }
      const loaded = await loadCloudProject(projectId);
      if (loaded) return true;
      if (state.projectLoadStatus === 401 || state.projectLoadStatus === 0 || state.projectLoadStatus >= 500) {
        return loadCachedProject(projectId);
      }
      return false;
    }
    if (importToken) return importSharedRevision(importToken);
    return false;
  }

  async function hydrateDraft() {
    state.hydrating = true;
    pushPanelState();
    try {
      const openedProject = await bootFromUrl();
      if (!openedProject) await replay();
      if (state.projectId && state.signedIn) chrome.runtime.sendMessage({ type: "TINKR_REALTIME_JOIN", projectId: state.projectId });
      const hasLocalWork = Boolean(state.patches.length || state.vectorLayers.length || state.visualLayers.length || state.sections.length || state.assets.length);
      if (!openedProject && hasLocalWork && state.signedIn && navigator.onLine !== false) {
        clearTimeout(state.cloudSyncTimer);
        state.cloudSyncTimer = setTimeout(() => { syncCloud().catch(() => {}); }, 120);
      }
      await refreshAiCapabilities().catch(() => {});
      drawOverlay();
      if (state.sync.state === "signin") status("Design Mode · sign in to sync this remix.");
      else if (state.sync.state === "error" && /view.?only|editor_required/i.test(state.sync.error || "")) status("Design Mode · view-only access to this remix.");
      else if (["saved", "local", "saving"].includes(state.sync.state)) status("Design Mode · cloud sync enabled.");
      else status(state.sync.error ? `Design Mode · ${state.sync.error}` : "Design Mode · edits stay local until sync recovers.");
    } catch {
      status("Could not load your remix — edits stay local.");
    } finally {
      state.hydrating = false;
      pushPanelState();
    }
  }

  function onKeyUp(event) {
    if (!state.active || event.code !== "Space") return;
    if (state.spaceHand) {
      state.spaceHand = false;
      if (state.panSession) { state.panSession = null; queueSave(); }
      pushPanelState();
    }
  }

  function onWindowBlur() {
    if (!state.active) return;
    if (state.vectorScaleSession) {
      Object.assign(state.vectorScaleSession.layer, state.vectorScaleSession.before);
      state.vectorScaleSession = null;
      renderVectorLayer();
    }
    if (state.vectorDrag) {
      Object.assign(state.vectorDrag.layer, state.vectorDrag.before);
      state.vectorDrag = null;
      renderVectorLayer();
    }
    state.vectorPress = null;
    if (state.scaleSession) {
      restore(state.scaleSession.el, state.scaleSession.start);
      state.scaleSession = null;
    }
    state.press = null;
    if (state.drag) {
      if (state.drag.kind === "proxy") { Object.assign(state.drag.layer, state.drag.before); discardPromotedProxy(state.drag); renderVisualLayers(); }
      else if (state.drag.flow) state.drag.parent?.insertBefore(state.drag.el, state.drag.originalNext);
      else restore(state.drag.el, state.drag.before);
      state.drag = null;
    }
    // A blur can happen halfway through a shape, pencil, or pen gesture. None
    // of those partial records are a transaction yet, so discard them and
    // release the captured pointer rather than resuming a stale gesture later.
    state.drawSession = null;
    state.strokeSession = null;
    state.penSession = null;
    state.penNodes = [];
    clearMarquee();
    releasePointer();
    renderVectorLayer();
    state.suppressClick = false;
    setInteraction("idle");
    const hadPanSession = Boolean(state.panSession);
    state.panSession = null;
    if (!state.spaceHand) { if (hadPanSession) pushPanelState(); return; }
    state.spaceHand = false;
    pushPanelState();
  }

  function onVisibilityChange() {
    if (document.hidden) onWindowBlur();
  }

  function onNetworkOnline() {
    if (!state.active) return;
    if (state.signedIn) {
      setSyncState("saving");
      void syncCloud();
    }
  }

  function onNetworkOffline() {
    if (state.active) setSyncState("offline");
  }

  function onPageHide() {
    if (!state.active || state.skipPersist) return;
    clearTimeout(state.autosaveTimer);
    clearTimeout(state.cloudSyncTimer);
    save().then(() => deactivate({ silent: true }));
  }

  async function activate() {
    if (state.active) return getPanelState();
    const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
    state.signedIn = auth?.signedIn;
    if (!auth?.signedIn) {
      status("Sign in to use Design Mode.");
      return getPanelState();
    }
    createOverlay();
    state.active = true;
    state.breakpoint = "base";
    document.body.classList.add("tinkr-design-mode");
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDoubleClick, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("pointerdown", startDrag, true);
    document.addEventListener("pointerup", endDrag, true);
    document.addEventListener("pointercancel", cancelPointerInteraction, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("scroll", onScroll, true);
    state.onPageHide = onPageHide;
    window.addEventListener("pagehide", state.onPageHide);
    window.addEventListener("beforeunload", state.onPageHide);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("online", onNetworkOnline);
    window.addEventListener("offline", onNetworkOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    state.observer = new MutationObserver(records => {
      if (state.isReplaying || isTransientSession()) return;
      const pageMutation = records.some(record => {
        const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
        if (target && isTinkr(target)) return false;
        if (record.type === "attributes") return !String(record.attributeName || "").startsWith("data-tinkr-");
        if (record.type === "characterData") return Boolean(target && !target.closest?.("#tinkr-root"));
        return [...record.addedNodes, ...record.removedNodes].some(node => !isTinkr(node));
      });
      if (!pageMutation) return;
      clearTimeout(state.settleTimer);
      state.settleTimer = setTimeout(settleDomPatches, 160);
    });
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class", "src", "alt", "href", "hidden", "data-tinkr-anchor", "data-tinkr-op"]
    });
    chrome.runtime.sendMessage({ type: "TINKR_DESIGN_ACTIVE" }).catch(() => {});
    status("Loading your remix…");
    pushPanelState();
    const initialState = getPanelState();
    void hydrateDraft();
    return initialState;
  }

  async function deactivate(opts = {}) {
    if (!state.active) return getPanelState();
    const { flush = false, silent = false } = opts;
    // Closing Design Mode in the middle of a gesture must not leave an
    // unrecorded translate, temporary proxy, or captured pointer behind.
    // Treat it exactly like an interrupted gesture before persisting the
    // draft that remains.
    if (state.activePointerId != null || state.marquee || state.drag || state.press || state.vectorPress || state.vectorDrag || state.vectorScaleSession || state.scaleSession || state.drawSession?.active || state.strokeSession || state.penSession || state.panSession) {
      onWindowBlur();
    }
    if (state.textEdit) finishInlineTextEdit(true);
    if (flush) {
      clearTimeout(state.autosaveTimer);
      clearTimeout(state.cloudSyncTimer);
      await save();
    }
    state.active = false;
    state.spaceHand = false;
    state.toolBeforeSpace = null;
    state.strokeSession = null;
    state.penSession = null;
    state.panSession = null;
    state.scaleSession = null;
    state.vectorPress = null;
    state.vectorDrag = null;
    state.vectorScaleSession = null;
    state.drawSession = null;
    state.marquee = null;
    document.body.classList.remove("tinkr-design-mode", "tinkr-viewport-mode", "tinkr-dev-mode", "tinkr-proto-mode");
    if (state.overlayFrame) cancelAnimationFrame(state.overlayFrame);
    state.overlayFrame = 0;
    state.observer?.disconnect();
    state.observer = null;
    clearTimeout(state.autosaveTimer);
    clearTimeout(state.cloudSyncTimer);
    clearTimeout(state.settleTimer);
    clearTimeout(state.cursorTimer);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("pagehide", state.onPageHide);
    window.removeEventListener("beforeunload", state.onPageHide);
    window.removeEventListener("blur", onWindowBlur);
    window.removeEventListener("online", onNetworkOnline);
    window.removeEventListener("offline", onNetworkOffline);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("wheel", onWheel, true);
    ["pointermove", "click", "dblclick", "keydown", "keyup", "pointerdown", "pointerup", "pointercancel", "contextmenu"].forEach(type => document.removeEventListener(type, ({ pointermove: onPointerMove, click: onClick, dblclick: onDoubleClick, keydown: onKey, keyup: onKeyUp, pointerdown: startDrag, pointerup: endDrag, pointercancel: cancelPointerInteraction, contextmenu: onContextMenu })[type], true));
    state.toolbarCleanup?.();
    state.toolbarCleanup = null;
    teardownInjectedStyles();
    state.root?.remove();
    state.root = null;
    state.selected = null;
    state.hover = null;
    state.drag = null;
    setSelection(null);
    setInteraction("idle");
    chrome.runtime.sendMessage({ type: "TINKR_DESIGN_INACTIVE" }).catch(() => {});
    if (!silent) pushPanelState();
    return getPanelState();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "TINKR_REALTIME" && message.event?.type === "presence") {
      state.presence = message.event.state || [];
      renderPresence();
      return;
    }
    if (message.type === "TINKR_AUTH_CHANGED") {
      (async () => {
        try {
          await refreshAuthState(true);
          sendResponse({ ok: true });
        } catch (error) {
          sendResponse({ ok: false, error: error?.message || "Auth refresh failed" });
        }
      })();
      return true;
    }
    if (message.type === "TINKR_TOGGLE" || message.type === "TINKR_GET_STATE" || message.type === "TINKR_CMD") {
      (async () => {
        try {
          if (message.type === "TINKR_TOGGLE") sendResponse(await handleCmd("toggle", message.payload || {}));
          else if (message.type === "TINKR_GET_STATE") sendResponse(getPanelState());
          else sendResponse(await handleCmd(message.cmd, message.payload || {}));
        } catch (error) {
          sendResponse({ active: state.active, error: error?.message || "Command failed" });
        }
      })();
      return true;
    }
  });

  if (sessionStorage.getItem("tinkr:reactivate-design") === "1") {
    sessionStorage.removeItem("tinkr:reactivate-design");
    setTimeout(() => { activate().catch(() => {}); }, 50);
  }
})();
