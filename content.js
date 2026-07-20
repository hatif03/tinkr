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
    viewport: { scale: 1, x: 0, y: 0 }, vectorLayers: [], selectedVectorId: null, visualLayers: [], selectedProxyId: null,
    styles: JSON.parse(JSON.stringify(DEFAULT_STYLES)), components: [], variables: [], assets: [],
    tool: TC()?.createDefaultTool?.() || { group: "move", variant: "select", devMode: false, protoMode: false },
    pinCommentMode: false, originalStyles: new Map(), preview: null, _status: "", labOutput: null, labHasOps: null,
    drawSession: null, panSession: null, scaleSession: null, penNodes: [], penSession: null,
    strokeSession: null, vectorEditMode: "move", timelineOpen: false, presentMode: false,
    toolbarCleanup: null, spaceHand: false, toolBeforeSpace: null, onPageHide: null, suppressClick: false,
    moveMode: "visual", activePointerId: null,
    skipPersist: false
  };

  function toolStatusLabel() {
    const key = `${state.tool.group}:${state.tool.variant}`;
    return TC().TOOL_LABELS?.[key] || `${state.tool.group} · ${state.tool.variant}`;
  }

  function inkColor(name, fallback) {
    return TC().strokeInk?.(name, fallback) || fallback;
  }

  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "HTML", "BODY"]);
  const storageKey = () => `tinkr:${location.origin}${location.pathname}`;
  const api = (path, method, body) => chrome.runtime.sendMessage({ type: "TINKR_API", path, method, body });

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
  const unsafeTarget = el => /^(IFRAME|CANVAS|VIDEO|AUDIO|EMBED|OBJECT)$/i.test(el?.tagName) || el?.closest("form,[contenteditable='true'],[data-tinkr-protected]");
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
      if (mapped === "scale" && state.scaleSession) return "scale";
      if (mapped === "move" && state.drag) return "grabbing";
      return mapped;
    }
    if (state.tool.devMode) return "inspect";
    if (state.tool.group === "comment" || state.pinCommentMode) return "comment";
    if (state.drag) return "grabbing";
    if (unsafeTarget(el)) return "locked";
    if (imageTarget(el)) return "image";
    if (textTarget(el) && state.tool.group === "move") return "text";
    return el === state.selected ? "selected" : "move";
  }

  function updateCursor(event, el) {
    const cursor = state.root?.querySelector("#tinkr-cursor"), label = state.root?.querySelector("#tinkr-cursor-label");
    if (!cursor || !label) return;
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
      state.cursorTimer = setTimeout(() => chrome.runtime.sendMessage({ type: "TINKR_REALTIME_CURSOR", projectId: state.projectId, payload: { scrollX: window.scrollX, scrollY: window.scrollY, clientX: event.clientX, clientY: event.clientY } }), 80);
    }
  }

  function applyViewport() {
    document.body.classList.add("tinkr-viewport-mode");
    document.body.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
  }

  function createOverlay() {
    const root = document.createElement("div"); root.id = "tinkr-root";
    root.innerHTML = `<div id="tinkr-cursor" class="tinkr-cursor"></div><div id="tinkr-cursor-label" class="tinkr-cursor-label">Inspect</div>
      <div id="tinkr-overlay" class="tinkr-overlay"></div><div id="tinkr-proxy-layer" class="tinkr-proxy-layer"></div><div id="tinkr-live-cursors"></div><div id="tinkr-pins"></div>
      <div class="tinkr-box" id="tinkr-hover"></div><div class="tinkr-box selected tinkr-hide" id="tinkr-selected"></div><div class="tinkr-box layer-target tinkr-hide" id="tinkr-layer-target"></div><div id="tinkr-insert-indicator" class="tinkr-insert-indicator tinkr-hide"></div>`;
    const sandbox = document.createElement("iframe"); sandbox.src = chrome.runtime.getURL("sandbox.html"); sandbox.style.display = "none"; sandbox.id = "tinkr-sandbox"; root.append(sandbox);
    document.documentElement.append(root); state.root = root;
    const mount = window.TinkrToolbar?.mountToolbar(root, {
      setTool: (g, v) => setTool(g, v),
      toggleDevMode: () => setDevMode(!state.tool.devMode),
      toggleTimeline: () => { state.timelineOpen = !state.timelineOpen; state.root.querySelector("#tinkr-timeline")?.classList.toggle("tinkr-hide", !state.timelineOpen); renderTimeline(); pushPanelState(); },
      enterPresent: () => { state.presentMode = true; state.tool.protoMode = true; state.panel = "proto"; document.documentElement.requestFullscreen?.(); pushPanelState(); },
      openResources: () => { state.panel = "design"; status("Resources: use + components in side panel or drag from dashboard."); pushPanelState(); },
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
    Object.assign(box.style, { left: `${layer.x - window.scrollX}px`, top: `${layer.y - window.scrollY}px`, width: `${layer.width}px`, height: `${layer.height}px` });
    box.classList.remove("tinkr-hide");
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
    host.innerHTML = state.visualLayers.map(layer => `<div class="tinkr-visual-proxy${layer.id === state.selectedProxyId ? " is-selected" : ""}" data-tinkr-proxy-id="${layer.id}" style="left:${layer.x - window.scrollX}px;top:${layer.y - window.scrollY}px;width:${layer.width}px;height:${layer.height}px;z-index:${layer.zIndex}">${layer.html}</div>`).join("");
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
    return Boolean(node.closest(".tinkr-toolbar, .tinkr-vector-toolbar, .tinkr-timeline, .tinkr-tool-menu, .tinkr-scale-handle"));
  }

  function pageElementAt(x, y) {
    const stack = document.elementsFromPoint?.(x, y) || [document.elementFromPoint(x, y)];
    for (const node of stack) {
      if (!node || node.nodeType !== 1 || isTinkr(node) || SKIP.has(node.tagName)) continue;
      return node;
    }
    return null;
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
    const prepared = prepareVisualLayer(el);
    drag.mode = "visual";
    drag.before = prepared.before;
    drag.baseTranslate = prepared.translate;
    drag.startZIndex = prepared.zIndex;
    return drag;
  }

  function beginProxyDrag(layer, event) { return { kind: "proxy", layer, before: { ...layer }, x: event.clientX, y: event.clientY }; }
  function capturePointer(event) { if (event.pointerId == null) return; state.activePointerId = event.pointerId; try { document.documentElement.setPointerCapture(event.pointerId); } catch { /* best effort */ } }
  function releasePointer(event) { if (event.pointerId != null) { try { document.documentElement.releasePointerCapture(event.pointerId); } catch { /* already released */ } } state.activePointerId = null; }

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
    const draft = state.drawSession?.preview;
    const layers = draft ? [...state.vectorLayers, draft] : state.vectorLayers;
    svg.innerHTML = layers.map(l => TC().renderLayer(l)).join("");
    if (state.strokeSession) {
      svg.innerHTML += TC().renderStrokePreview(state.strokeSession);
    } else if (state.penNodes.length) {
      svg.innerHTML += TC().renderPenPreview(state.penNodes, state.penSession?.nodeIndex ?? -1);
    }
    window.TinkrToolbar?.syncVectorToolbar?.(state.root, state.selectedVectorId, state.vectorEditMode);
  }

  function getPanelState() {
    const el = state.selected;
    let selection = null;
    if (el) {
      const style = getComputedStyle(el);
      const ancestors = []; let node = el;
      while (node && node !== document.body && ancestors.length < 5) { ancestors.unshift(node); node = node.parentElement; }
      selection = {
        tag: el.tagName.toLowerCase(),
        type: textTarget(el) ? "Text" : imageTarget(el) ? "Image" : "Component",
        parentDisplay: getComputedStyle(el.parentElement || el).display,
        crumbs: ancestors.map((n, i) => ({ tag: n.tagName.toLowerCase(), index: i })),
        styles: {
          backgroundColor: rgbToHex(style.backgroundColor), color: rgbToHex(style.color),
          fontSize: parseFloat(style.fontSize) || 0, padding: parseFloat(style.padding) || 0,
          borderRadius: parseFloat(style.borderRadius) || 0, opacity: parseFloat(style.opacity) || 1,
          fontWeight: style.fontWeight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
          textAlign: style.textAlign, textTransform: style.textTransform, objectFit: style.objectFit,
          objectPosition: style.objectPosition, filter: style.filter, gap: style.gap
        },
        context: { text: textTarget(el), image: imageTarget(el) }
      };
    } else if (selectedProxy()) {
      const layer = selectedProxy();
      selection = {
        tag: "tinkr-proxy", type: "Visual copy", parentDisplay: "Tinkr canvas", crumbs: [],
        styles: { backgroundColor: "#000000", color: "#ffffff", fontSize: 0, padding: 0, borderRadius: 0, opacity: 1, fontWeight: "", lineHeight: "", letterSpacing: "", textAlign: "", textTransform: "", objectFit: "", objectPosition: "", filter: "", gap: "" },
        context: { text: false, image: false }, proxy: true, zIndex: layer.zIndex
      };
    }
    return {
      active: state.active, signedIn: state.signedIn, status: state._status, breakpoint: state.breakpoint, panel: state.panel,
      tool: { ...state.tool }, activeToolLabel: toolStatusLabel(), pinCommentMode: state.pinCommentMode || state.tool.group === "comment",
      selection, sections: state.sections, slices: state.slices, tokens: state.tokens,
      styles: state.styles, vectorLayers: state.vectorLayers, visualLayers: state.visualLayers, components: state.components, variables: state.variables, assets: state.assets, prototypeLinks: state.prototypeLinks,
      motion: state.motion, presence: state.presence.slice(0, 6), preview: state.preview,
      labOutput: state.labOutput, labHasOps: state.labHasOps,
      devOutput: state.tool.devMode ? getDevOutput() : null,
      devSpec: state.tool.devMode ? getDevSpec() : null,
      a11ySnapshot: state.selected ? getA11ySnapshot(state.selected) : null,
      timelineOpen: state.timelineOpen, viewport: state.viewport, moveMode: state.moveMode,
      canUndo: state.history.length > 0, canRedo: state.future.length > 0, editCount: state.history.length
    };
  }

  function pushPanelState() {
    window.TinkrToolbar?.syncToolbar(state.root, { ...state.tool, timelineOpen: state.timelineOpen });
    chrome.runtime.sendMessage({ type: "TINKR_PANEL_UPDATE", state: getPanelState() }).catch(() => {});
  }

  function status(message) { state._status = message; pushPanelState(); }

  function setTool(group, variant) {
    TC().setTool(state.tool, group, variant);
    state.pinCommentMode = group === "comment";
    if (group === "move" && variant === "select") {
      setDevMode(false);
      state.spaceHand = false;
      state.panSession = null;
    }
    if (group === "region" && variant === "section") addSection(prompt("Section label", "Section") || "Section", state.selected);
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
    TC().setDevMode(state.tool, on);
    state.panel = on ? "inspect" : "design";
    document.body.classList.toggle("tinkr-dev-mode", on);
    renderDevOverlay(); pushPanelState();
  }

  function setProtoMode(on) {
    TC().setProtoMode(state.tool, on);
    state.panel = on ? "proto" : "design";
    pushPanelState();
  }

  function select(el) {
    if (!el || SKIP.has(el.tagName) || isTinkr(el)) return;
    state.selectedProxyId = null;
    if (state.tool.devMode) { state.selected = el; placeBox("#tinkr-selected", el); renderDevOverlay(); status(`Inspecting ${el.tagName.toLowerCase()}.`); pushPanelState(); return; }
    state.selected = el; placeBox("#tinkr-selected", el); status(`Selected ${el.tagName.toLowerCase()}.`);
    pushPanelState();
  }

  function selectProxy(id) {
    const layer = state.visualLayers.find(item => item.id === id); if (!layer) return;
    state.selected = null; state.selectedVectorId = null; state.selectedProxyId = id;
    placeBox("#tinkr-hover"); renderVisualLayers(); placeProxyBox("#tinkr-selected", layer);
    status(`Selected visual copy · z ${layer.zIndex}.`); pushPanelState();
  }

  function selectVector(id) {
    state.selectedVectorId = id;
    state.selected = null; state.selectedProxyId = null;
    placeBox("#tinkr-selected");
    const layer = state.vectorLayers.find(v => v.id === id);
    if (layer?.nodes?.length) state.penNodes = [...layer.nodes];
    status(`Vector selected · use edit bar to adjust points.`);
    renderVectorLayer();
    pushPanelState();
  }

  function runVectorEdit(action) {
    const layer = state.vectorLayers.find(v => v.id === state.selectedVectorId);
    if (!layer?.nodes?.length && action !== "close") return status("Select a path with anchor points.");
    if (action === "move") { state.vectorEditMode = "move"; status("Move point · drag anchors on path."); }
    if (action === "bend") { state.vectorEditMode = "bend"; status("Bend · drag to set curve handles."); }
    if (action === "close") {
      if (state.penNodes.length > 2) finishPenPath(true);
      else if (layer?.nodes?.length > 2) {
        layer.d = TC().bezierToD(layer.nodes, true);
        layer.nodes = [...layer.nodes];
        renderVectorLayer(); queueSave();
        status("Path closed.");
      }
    }
    if (action === "delete") {
      const idx = state.penSession?.nodeIndex ?? layer.nodes.length - 1;
      layer.nodes = TC().deleteNode(layer.nodes, idx);
      state.penNodes = [...layer.nodes];
      layer.d = TC().bezierToD(layer.nodes);
      if (!layer.nodes.length) {
        state.vectorLayers = state.vectorLayers.filter(v => v.id !== layer.id);
        state.selectedVectorId = null;
        state.penNodes = [];
      }
      renderVectorLayer(); queueSave();
      status("Point deleted.");
    }
    renderVectorLayer(); pushPanelState();
  }

  function insertImageFromPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const href = URL.createObjectURL(file);
      state.assets.push({ id: crypto.randomUUID(), name: file.name, mimeType: file.type, byteSize: file.size, href, createdAt: new Date().toISOString() });
      const layer = TC().createShape("image", window.scrollX + 80, window.scrollY + 80, 240, 160, { href });
      state.vectorLayers.push(layer);
      push({ type: "insert_vector", vector: layer }, () => { state.vectorLayers = state.vectorLayers.filter(v => v.id !== layer.id); renderVectorLayer(); });
      renderVectorLayer(); queueSave();
      selectVector(layer.id);
      status("Image inserted · drag handles to resize on canvas.");
    };
    input.click();
  }

  function attachTextOnPath() {
    const layer = state.vectorLayers.find(v => v.id === state.selectedVectorId);
    if (!layer?.d) return status("Select a vector path first (Alt+click).");
    const text = prompt("Text on path", "Label");
    if (!text) return;
    const textLayer = {
      id: TC().uid(), type: "textPath", d: layer.d, text, fontSize: 14,
      stroke: TC().defaultStroke?.() || inkColor("--tk-ink-vector", "#a8b4ff"),
      fill: inkColor("--tk-text", "#f6f7fa"), x: layer.x, y: layer.y, w: layer.w, h: layer.h
    };
    state.vectorLayers.push(textLayer);
    push({ type: "insert_vector", vector: textLayer }, () => { state.vectorLayers = state.vectorLayers.filter(v => v.id !== textLayer.id); renderVectorLayer(); });
    renderVectorLayer(); queueSave();
    status("Text on path added.");
    pushPanelState();
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
    if (action === "alt" && value !== undefined) el.setAttribute("alt", value);
    if (action === "copy-style") { state.styleClipboard = el.getAttribute("style") || ""; status("Style copied."); }
    if (action === "paste-style" && state.styleClipboard !== null) { const before = snapshot(el); el.setAttribute("style", state.styleClipboard); push({ type: "set_styles", selector: selectorFor(el), styles: Object.fromEntries([...el.style].map(k => [k, el.style[k]])) }, () => restore(el, before)); }
    if (action === "ready") { el.setAttribute("data-tinkr-ready", "true"); addSection("Ready for dev", el); status("Marked ready for build."); }
    if (action === "note" && value) addLocalComment(value, el);
    if (action === "apply-text-style" && value) { const st = state.styles.text.find(t => t.id === value); if (st) Object.entries({ fontFamily: st.fontFamily, fontSize: st.fontSize, fontWeight: st.fontWeight, lineHeight: st.lineHeight }).forEach(([k,v]) => setStyle(k, v)); }
    if (action === "apply-color-style" && value) { const c = state.styles.colors.find(t => t.id === value); if (c) setStyle("color", c.value); }
    if (action === "extract-tokens") extractTokensFromSelection();
    if (action === "boolean-union" && state.selectedVectorId) booleanOp("union");
    if (action === "make-component") makeComponentFromSelection();
    if (action === "visual-copy") createVisualProxy();
    if (action === "move-visual") { state.moveMode = "visual"; status("Visual canvas mode · drag layers anywhere."); pushPanelState(); }
    if (action === "move-structural") { state.moveMode = "structural"; status("Structural mode · drag to reorder within the source layout."); pushPanelState(); }
  }

  function makeComponentFromSelection() {
    if (!state.selected) return status("Select a layer to make a component.");
    const el = state.selected.cloneNode(true);
    el.querySelectorAll("script,iframe,form").forEach(node => node.remove());
    const component = { id: crypto.randomUUID(), name: (state.selected.getAttribute("aria-label") || state.selected.tagName.toLowerCase()).slice(0, 60), html: el.outerHTML, createdAt: new Date().toISOString() };
    state.components.push(component);
    queueSave(); status(`Saved ${component.name} to components.`); pushPanelState();
  }

  function createVariable(payload) {
    const name = String(payload?.name || "").trim();
    const value = String(payload?.value || "").trim();
    if (!name || !value) return status("Variable needs a name and value.");
    const variable = { id: crypto.randomUUID(), name: name.replace(/\s+/g, "-"), type: payload?.type || "color", value };
    state.variables = [...state.variables.filter(v => v.name !== variable.name), variable];
    queueSave(); status(`Variable ${variable.name} saved.`); pushPanelState();
  }

  function applyVariable(id) {
    const variable = state.variables.find(v => v.id === id);
    if (!variable || !state.selected) return status("Select a layer before applying a variable.");
    const property = variable.type === "spacing" ? "gap" : variable.type === "radius" ? "borderRadius" : variable.type === "typography" ? "fontSize" : "color";
    setStyle(property, variable.value);
    status(`Applied ${variable.name}.`);
  }

  function booleanOp(op) {
    if (state.vectorLayers.length < 2) return status("Select two vectors for boolean ops.");
    const a = state.vectorLayers[state.vectorLayers.length - 2];
    const b = state.vectorLayers[state.vectorLayers.length - 1];
    if (op === "union") {
      const merged = TC().booleanUnion(a, b);
      state.vectorLayers = state.vectorLayers.slice(0, -2).concat(merged);
      push({ type: "insert_vector", vector: merged }, () => {});
      renderVectorLayer(); queueSave();
    }
  }

  function snapshot(el) { return { style: el.getAttribute("style"), html: el.innerHTML, hidden: el.classList.contains("tinkr-hidden") }; }
  function restore(el, before) { if (before.style === null) el.removeAttribute("style"); else el.setAttribute("style", before.style); el.innerHTML = before.html; el.classList.toggle("tinkr-hidden", before.hidden); placeBox("#tinkr-selected", el); pushPanelState(); }

  function translateParts(value) {
    const parts = String(value || "0px 0px").trim().split(/\s+/).map(part => parseFloat(part) || 0);
    return { x: parts[0] || 0, y: parts[1] || 0 };
  }

  function prepareVisualLayer(el) {
    const computed = getComputedStyle(el);
    const before = snapshot(el);
    if (computed.position === "static") el.style.position = "relative";
    if (!el.style.zIndex || el.style.zIndex === "auto") el.style.zIndex = String(nextZ());
    return { before, translate: translateParts(el.style.translate), zIndex: Number(el.style.zIndex) || nextZ() };
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

  function arrangeElement(el, direction, target = null) {
    if (!el) return status("Select a layer first.");
    const before = snapshot(el);
    const siblings = [...(el.parentElement?.children || [])].filter(node => node.nodeType === 1 && !isTinkr(node));
    const zValues = siblings.map(node => Number(getComputedStyle(node).zIndex)).filter(Number.isFinite);
    const current = Number(getComputedStyle(el).zIndex);
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    let z = Number.isFinite(current) ? current : 0;
    if (target) z = (Number(getComputedStyle(target).zIndex) || 0) + (direction === "below" ? -1 : 1);
    else if (direction === "front") z = Math.max(0, ...zValues) + 1;
    else if (direction === "back") z = Math.min(0, ...zValues) - 1;
    else if (direction === "forward") z += 1;
    else if (direction === "backward") z -= 1;
    el.style.zIndex = String(z);
    push({ type: "set_layer_order", selector: selectorFor(el), target: fingerprint(el), before: { style: before.style }, after: { position: el.style.position, zIndex: el.style.zIndex } }, () => restore(el, before));
    status(`Layer moved ${direction === "front" ? "to front" : direction === "back" ? "to back" : direction}.`);
  }

  function arrangeProxy(layer, direction) {
    if (!layer) return status("Select a visual copy first.");
    const before = { ...layer };
    const zs = state.visualLayers.map(item => Number(item.zIndex) || 0);
    if (direction === "front") layer.zIndex = Math.max(0, ...zs) + 1;
    else if (direction === "back") layer.zIndex = Math.min(0, ...zs) - 1;
    else if (direction === "forward") layer.zIndex += 1;
    else if (direction === "backward") layer.zIndex -= 1;
    renderVisualLayers();
    push({ type: "update_proxy", proxyId: layer.id, before, after: { ...layer } }, () => { Object.assign(layer, before); renderVisualLayers(); pushPanelState(); }, () => { renderVisualLayers(); pushPanelState(); });
    status(`Visual copy moved ${direction}.`);
  }

  function arrangeSelected(direction) {
    const proxy = selectedProxy();
    if (proxy) return arrangeProxy(proxy, direction);
    if (!state.selected) return status("Select a layer first.");
    const target = (direction === "above" || direction === "below") ? state.hover : null;
    if ((direction === "above" || direction === "below") && (!target || target === state.selected)) return status("Hover a target layer, then choose place above or below.");
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

  function push(patch, inverse, forward) {
    if (patch.selector) { const el = document.querySelector(patch.selector); if (el) patch.target = fingerprint(el); }
    patch.breakpoint = patch.breakpoint || state.breakpoint;
    state.patches.push(patch);
    state.history.push({ patch, inverse, forward: forward || (() => applyPatch(patch)) });
    state.future = [];
    queueSave();
  }

  function queueSave() {
    status("Saving draft…");
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(save, 500);
    clearTimeout(state.cloudSyncTimer);
    state.cloudSyncTimer = setTimeout(syncCloud, 1200);
  }

  function setStyle(property, raw) {
    if (!state.selected || state.tool.devMode) return status(state.tool.devMode ? "Dev Mode is read-only." : "Select an element first.");
    const el = state.selected, before = snapshot(el); let value = raw;
    if (["fontSize", "padding", "borderRadius", "lineHeight", "letterSpacing", "gap", "maxWidth", "maxHeight"].includes(property) && raw !== "" && !String(raw).includes("px") && !String(raw).includes("%") && !String(raw).includes("rem")) value = `${raw}px`;
    if (state.breakpoint === "base") el.style[property] = value; else applyBreakpointStyle(el, state.breakpoint, { [property]: value });
    push({ type: "set_styles", selector: selectorFor(el), styles: { [property]: value }, breakpoint: state.breakpoint }, () => restore(el, before));
  }

  function responsiveKey(el) { let key = el.getAttribute("data-tinkr-anchor"); if (!key) { key = `t${Math.random().toString(36).slice(2,10)}`; el.setAttribute("data-tinkr-anchor", key); } return key; }
  function applyBreakpointStyle(el, breakpoint, styles) { const key = responsiveKey(el), id = `tinkr-responsive-${breakpoint}`, css = [...document.querySelectorAll(`style#${CSS.escape(id)}`)][0] || Object.assign(document.createElement("style"), { id }); if (!css.isConnected) document.head.append(css); css.textContent += `@media(max-width:${breakpoint}px){[data-tinkr-anchor="${key}"]{${Object.entries(styles).map(([k,v]) => `${k.replace(/[A-Z]/g,m=>`-${m.toLowerCase()}`)}:${v}!important`).join(";")}}}`; }
  function updateText(text) { const el = state.selected; if (!el) return; const before = snapshot(el); el.textContent = text; push({ type: "update_text", selector: selectorFor(el), text }, () => restore(el, before)); }
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

  function sanitizedClone(el) { const clone = el.cloneNode(true); clone.querySelectorAll("script,iframe,form,style,link").forEach(n => n.remove()); clone.querySelectorAll("*").forEach(n => [...n.attributes].filter(a => a.name.startsWith("on") || a.name === "id").forEach(a => n.removeAttribute(a.name))); return clone; }
  function duplicate() { if (!state.selected || state.tool.devMode) return; const source = state.selected, clone = sanitizedClone(source); clone.setAttribute("data-tinkr-owned", "true"); source.after(clone); push({ type: "insert_html", parent: selectorFor(source.parentElement), after: selectorFor(source), html: clone.outerHTML }, () => clone.remove()); select(clone); }
  function copy() { if (!state.selected) return; state.clipboard = sanitizedClone(state.selected).outerHTML; status("Component copied."); }
  function paste() { if (!state.selected || !state.clipboard || state.tool.devMode) return; const holder = document.createElement("div"); holder.innerHTML = state.clipboard; const clone = holder.firstElementChild; clone?.setAttribute("data-tinkr-owned", "true"); state.selected.after(clone); push({ type: "insert_html", parent: selectorFor(state.selected.parentElement), after: selectorFor(state.selected), html: clone.outerHTML }, () => clone.remove()); select(clone); }

  function componentHTML(kind) {
    const t = state.tokens;
    const content = {
      cta: `<section style="padding:32px;background:${t["--tinkr-surface"]};color:${t["--tinkr-text"]};border-radius:${t["--tinkr-radius"]};text-align:center"><h2 style="margin:0 0 8px;font-size:28px">Ready to build something better?</h2><p style="margin:0 0 18px;color:${t["--tinkr-muted"]}">Turn inspiration into a launch-ready concept.</p><button style="background:${t["--tinkr-primary"]};border:0;border-radius:8px;padding:11px 16px;font-weight:700">Join the waitlist</button></section>`,
      testimonial: `<blockquote style="margin:0;padding:24px;border:1px solid #d9dce3;border-radius:${t["--tinkr-radius"]};background:#fff"><p style="font-size:18px;margin:0 0 14px">"Tinkr got us from inspiration to a real concept in minutes."</p><footer style="font-size:13px;color:#61646d">Maya Chen · Founder</footer></blockquote>`,
      feature: `<article style="padding:22px;border:1px solid #d9dce3;border-radius:${t["--tinkr-radius"]};background:#fff"><div style="font-size:24px">✦</div><h3 style="margin:10px 0 6px">Make it yours</h3><p style="margin:0;color:#626672">Start with the page you see, then explore freely.</p></article>`,
      wireframe: `<div data-tinkr-wireframe="true" style="min-height:240px;border:2px dashed #7ce9ff;border-radius:${t["--tinkr-radius"]};background:#7ce9ff12;padding:${t["--tinkr-gap"]};display:grid;place-items:center;color:#7ce9ff;font:600 14px Inter,sans-serif">Wireframe frame</div>`
    };
    return content[kind];
  }

  function insertComponent(kind) { const anchor = state.selected || document.body; const holder = document.createElement("div"); holder.innerHTML = componentHTML(kind); const el = holder.firstElementChild; if (!el) return; el.setAttribute("data-tinkr-owned", "true"); if (anchor === document.body) document.body.append(el); else anchor.after(el); push({ type: "insert_html", parent: anchor === document.body ? "body" : selectorFor(anchor.parentElement), after: anchor === document.body ? null : selectorFor(anchor), html: el.outerHTML }, () => el.remove()); select(el); }

  function autoLayout(kind) {
    if (!state.selected || state.tool.devMode) return status("Select a container first.");
    const el = state.selected, before = snapshot(el);
    if (kind === "flex") Object.assign(el.style, { display: "flex", flexWrap: "wrap", gap: state.tokens["--tinkr-gap"] });
    if (kind === "grid") Object.assign(el.style, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: state.tokens["--tinkr-gap"] });
    if (kind === "gap") Object.assign(el.style, { gap: state.tokens["--tinkr-gap"] });
    push({ type: "set_styles", selector: selectorFor(el), styles: Object.fromEntries([...el.style].map(k => [k, el.style[k]])) }, () => restore(el, before));
    status("Auto layout applied.");
  }

  function undo() {
    const entry = state.history.pop();
    if (!entry) return status("Nothing to undo.");
    state.patches.pop();
    state.future.push(entry);
    entry.inverse();
    state.selected = null;
    placeBox("#tinkr-selected");
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
    state.selected = null;
    state.selectedVectorId = null;
    state.hover = null;
    state.history = [];
    state.future = [];
    state.patches = [];
    document.body.style.transform = "";
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
    if (!skipConfirm && !confirm("Reset all edits? The page will return to its original state.")) return;

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

  function draftPayload() {
    return {
      patches: state.patches, labs: state.labs, tokens: state.tokens, sections: state.sections, slices: state.slices,
      prototypeLinks: state.prototypeLinks, motion: state.motion, vectorLayers: state.vectorLayers, visualLayers: state.visualLayers,
      styles: state.styles, components: state.components, variables: state.variables, assets: state.assets, moveMode: state.moveMode
    };
  }

  async function save() {
    await chrome.storage.local.set({ [storageKey()]: { ...draftPayload(), projectId: state.projectId, viewport: state.viewport, updatedAt: new Date().toISOString() } });
    status(`Saved locally · ${state.patches.length} patches.`);
  }

  async function syncCloud() {
    try {
      const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
      state.signedIn = auth?.signedIn;
      if (!state.signedIn) return;
      const body = { current_draft: draftPayload(), canvas_meta: { sections: state.sections, viewportState: state.viewport }, sourceUrl: location.href, fingerprint: { pathname: location.pathname, title: document.title } };
      if (state.projectId) {
        const result = await api(`/api/projects/${state.projectId}`, "PATCH", body);
        if (result?.ok) status("Synced to Tinkr Cloud.");
        else if (result) status(`Cloud sync failed: ${result.data?.error || "unknown"}`);
        return;
      }
      const created = await api("/api/projects", "POST", { ...body, name: document.title.slice(0, 80) || "Untitled remix" });
      if (created?.ok) {
        state.projectId = created.data.project.id;
        await chrome.storage.local.set({ [storageKey()]: { ...draftPayload(), projectId: state.projectId, updatedAt: new Date().toISOString() } });
        chrome.runtime.sendMessage({ type: "TINKR_REALTIME_JOIN", projectId: state.projectId });
        status("Created cloud project and synced.");
      }
    } catch {
      /* API offline — local edits still saved */
    }
  }

  async function createCheckpoint() {
    if (!state.signedIn || !state.projectId) return status("Sign in and sync to create a checkpoint.");
    const result = await api(`/api/projects/${state.projectId}/revisions`, "POST", {
      name: `Checkpoint ${new Date().toLocaleString()}`, patches: state.patches,
      draft_snapshot: draftPayload(), fingerprint: { pathname: location.pathname }
    });
    status(result.ok ? "Checkpoint saved." : `Checkpoint failed: ${result.data?.error}`);
  }

  async function loadCloudProject(projectId) {
    const result = await api(`/api/projects/${projectId}`, "GET");
    if (!result.ok) return status(`Could not load project: ${result.data?.error}`);
    const project = result.data.project;
    state.projectId = project.id;
    const draft = project.current_draft || {};
    state.patches = draft.patches || [];
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
    state.moveMode = draft.moveMode || "visual";
    state.prototypeLinks = draft.prototypeLinks || [];
    state.motion = draft.motion || [];
    state.viewport = project.canvas_meta?.viewportState || state.viewport;
    applyTokens(); applyViewport(); resetAndReplay(); drawOverlay(); renderVectorLayer(); renderVisualLayers(); pushPanelState();
    chrome.runtime.sendMessage({ type: "TINKR_REALTIME_JOIN", projectId });
    status(`Loaded cloud project "${project.name}".`);
  }

  async function importSharedRevision(token) {
    const { apiUrl } = await chrome.storage.local.get({ apiUrl: TINKR_CONFIG.apiUrl });
    const response = await fetch(`${apiUrl}/api/review/${token}`);
    const data = await response.json();
    if (!response.ok) return status(data.error || "Import failed.");
    const snap = data.revision?.draft_snapshot || {};
    state.patches = snap.patches || data.revision?.patch_snapshot || [];
    state.vectorLayers = snap.vectorLayers || [];
    state.visualLayers = snap.visualLayers || [];
    resetAndReplay(); renderVectorLayer(); renderVisualLayers();
    status("Imported shared revision.");
  }

  function resetAndReplay() { state.history = []; state.future = []; state.patches.forEach(p => applyPatch(p)); if (state.selected) placeBox("#tinkr-selected", state.selected); pushPanelState(); }

  async function replay() {
    const data = await chrome.storage.local.get(storageKey());
    const saved = data[storageKey()] || {};
    state.patches = saved.patches || [];
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
    state.moveMode = saved.moveMode || "visual";
    state.prototypeLinks = saved.prototypeLinks || [];
    state.motion = saved.motion || [];
    state.projectId = saved.projectId || null;
    state.viewport = saved.viewport || state.viewport;
    applyTokens(); applyViewport();
    let missed = 0; state.patches.forEach(p => { if (!applyPatch(p)) missed++; });
    renderVectorLayer(); renderVisualLayers();
    if (state.patches.length) status(missed ? `${missed} patches need reattachment.` : `Restored ${state.patches.length} local changes.`);
    drawOverlay();
  }

  function isTransientSession() {
    return Boolean(state.drag || state.scaleSession || state.panSession || state.strokeSession || state.penSession || state.drawSession?.active);
  }

  function settleDomPatches() {
    if (!state.active || isTransientSession()) return;
    const missing = state.patches.some(p => ["insert_html", "reorder", "reorder_dom", "insert_vector", "move_layer", "set_layer_order", "create_proxy", "hide_source"].includes(p.type) && !TC().resolvePatchTarget(p, document));
    if (!missing) return;
    state.patches.forEach(p => applyPatch(p));
  }

  function applyPatch(patch) { return TC().applyPatch(patch, document); }

  function applyTokens() {
    let style = document.getElementById("tinkr-tokens");
    if (!style) { style = document.createElement("style"); style.id = "tinkr-tokens"; document.head.append(style); }
    style.textContent = `:root{${Object.entries(state.tokens).map(([k,v]) => `${k}:${v}`).join(";")}}`;
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
      document.body.append(el);
      push({ type: "insert_html", parent: "body", after: selectorFor(document.body.lastElementChild), html: el.outerHTML }, () => el.remove());
      select(el); state.drawSession = null; return;
    }
    if (state.tool.group === "shape") {
      const layer = TC().createShape(variant, x, y, Math.abs(w), Math.abs(h));
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

  async function generate(promptText) {
    if (!state.selected) return status("Select an element first.");
    const prompt = promptText?.trim(); if (!prompt) return status("Describe the change.");
    status("Generating AI patch…");
    const { apiUrl } = await chrome.storage.local.get({ apiUrl: TINKR_CONFIG.apiUrl });
    try {
      const response = await fetch(`${apiUrl}/api/patch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, element: describe(state.selected), tokens: state.tokens }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "failed");
      state.preview = data; status("Patch ready.");
    } catch (error) { status(`AI unavailable: ${error.message}`); state.preview = null; }
    pushPanelState();
  }

  function applyPreview() {
    if (!state.preview?.operations?.length) return;
    state.preview.operations.forEach(op => {
      if (op.type === "update_text" && op.text) updateText(op.text);
      if (op.type === "set_styles" && op.styles) Object.entries(op.styles).forEach(([k, v]) => setStyle(k, v));
      if (op.type === "hide") hide();
      if (op.type === "insert_component" && op.component) insertComponent(op.component);
    });
    state.preview = null; status("AI patch applied.");
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
      "toggle-viewport": () => { applyViewport(); status("Viewport transform applied."); },
      "add-hotspot": () => addHotspot(prompt("Scroll target selector or URL", "")),
      "add-motion": addMotionPreset, "boolean-union": () => booleanOp("union"), "export-slice": exportSliceCapture
    })[name]?.();
  }

  async function handleCmd(cmd, payload) {
    if (cmd === "toggle") return state.active ? deactivate(payload) : activate();
    if (cmd === "deactivate") return deactivate(payload);
    if (cmd === "setPanel") {
      state.panel = payload.panel || "design";
      if (payload.panel === "inspect") setDevMode(true);
      else if (payload.panel === "design" || payload.panel === "canvas") setDevMode(false);
      pushPanelState();
      return getPanelState();
    }
    if (cmd === "setTool") { setTool(payload.group, payload.variant); return getPanelState(); }
    if (cmd === "setDevMode") { setDevMode(Boolean(payload.on)); return getPanelState(); }
    if (cmd === "setProtoMode") { setProtoMode(Boolean(payload.on)); return getPanelState(); }
    if (cmd === "setViewport") { state.viewport = { ...state.viewport, ...payload }; applyViewport(); queueSave(); pushPanelState(); return getPanelState(); }
    if (cmd === "setBreakpoint") { state.breakpoint = payload.breakpoint; status(`Editing ${state.breakpoint === "base" ? "base" : state.breakpoint + "px override"}.`); return getPanelState(); }
    if (cmd === "setStyle") { setStyle(payload.property, payload.value); return getPanelState(); }
    if (cmd === "setToken") { state.tokens[payload.key] = payload.value; applyTokens(); queueSave(); pushPanelState(); return getPanelState(); }
    if (cmd === "createVariable") { createVariable(payload); return getPanelState(); }
    if (cmd === "applyVariable") { applyVariable(payload.id); return getPanelState(); }
    if (cmd === "selectProxy") { selectProxy(payload.id); return getPanelState(); }
    if (cmd === "setMoveMode") { state.moveMode = payload.mode === "structural" ? "structural" : "visual"; status(state.moveMode === "visual" ? "Visual canvas mode enabled." : "Structural reorder mode enabled."); return getPanelState(); }
    if (cmd === "openAssetPicker") { insertImageFromPicker(); return getPanelState(); }
    if (cmd === "insertAssetById") { const asset = state.assets.find(a => a.id === payload.id); if (asset) { const layer = TC().createShape("image", window.scrollX + 80, window.scrollY + 80, 240, 160, { href: asset.href }); state.vectorLayers.push(layer); push({ type: "insert_vector", vector: layer }, () => { state.vectorLayers = state.vectorLayers.filter(v => v.id !== layer.id); renderVectorLayer(); }); renderVectorLayer(); selectVector(layer.id); queueSave(); } return getPanelState(); }
    if (cmd === "insertComponentById") { const item = state.components.find(c => c.id === payload.id); if (item) { const anchor = state.selected || document.body; const holder = document.createElement("div"); holder.innerHTML = item.html; const el = holder.firstElementChild; if (el) { el.setAttribute("data-tinkr-owned", "true"); anchor.after(el); push({ type: "insert_html", parent: selectorFor(anchor.parentElement), after: selectorFor(anchor), html: el.outerHTML }, () => el.remove()); select(el); } } return getPanelState(); }
    if (cmd === "setStyleLib") { state.styles = payload.styles || state.styles; queueSave(); pushPanelState(); return getPanelState(); }
    if (cmd === "selectCrumb") { selectCrumb(payload.index); return getPanelState(); }
    if (cmd === "context") { contextAction(payload.action, payload.value); return getPanelState(); }
    if (cmd === "action") { runAction(payload.name); return getPanelState(); }
    if (cmd === "insertComponent") { insertComponent(payload.kind); return getPanelState(); }
    if (cmd === "autoLayout") { autoLayout(payload.kind); return getPanelState(); }
    if (cmd === "generate") { generate(payload.prompt); return getPanelState(); }
    if (cmd === "runLab") { runLab(payload.code, payload.name); return getPanelState(); }
    if (cmd === "addSection") { addSection(payload.label, state.selected); return getPanelState(); }
    if (cmd === "pinComment") { setTool("comment", "pin"); return getPanelState(); }
    if (cmd === "scrollSection") { const s = state.sections.find(x => x.id === payload.id); if (s) window.scrollTo({ top: s.scrollY - 80, behavior: "smooth" }); return getPanelState(); }
    return getPanelState();
  }

  function startDrag(event) {
    const proxy = event.target?.closest?.("[data-tinkr-proxy-id]");
    if (proxy && event.button === 0 && TC().shouldSelectElements(state.tool)) {
      const layer = state.visualLayers.find(item => item.id === proxy.dataset.tinkrProxyId);
      if (layer) { selectProxy(layer.id); state.drag = beginProxyDrag(layer, event); capturePointer(event); event.preventDefault(); return; }
    }
    if (event.target?.classList?.contains("tinkr-scale-handle") && state.tool.variant === "scale" && state.selected) {
      state.scaleSession = { handle: event.target.dataset.handle, el: state.selected, start: snapshot(state.selected), rect: state.selected.getBoundingClientRect(), x: event.clientX, y: event.clientY };
      capturePointer(event); event.preventDefault(); return;
    }
    if (isToolbarTarget(event.target)) return;
    if (state.spaceHand || TC().shouldPan(state.tool)) {
      state.panSession = { x: event.clientX, y: event.clientY, vx: state.viewport.x, vy: state.viewport.y };
      event.preventDefault(); return;
    }
    if (state.tool.group === "draw" && state.tool.variant === "eyedropper") {
      sampleColorAt(event.clientX, event.clientY);
      event.preventDefault(); return;
    }
    if (state.tool.group === "draw" && state.tool.variant === "pencil") {
      state.strokeSession = TC().createStrokeSession("pencil");
      TC().addPoint(state.strokeSession, event.clientX, event.clientY);
      event.preventDefault(); return;
    }
    if (state.tool.group === "draw" && state.tool.variant === "pen") {
      const x = event.clientX, y = event.clientY;
      if (event.detail === 2) { finishPenPath(true); return; }
      const hit = TC().hitTestNode(state.penNodes, x, y);
      if (hit >= 0) {
        state.penSession = { nodeIndex: hit, drag: state.vectorEditMode === "bend" ? "bend" : "move", startX: x, startY: y };
      } else {
        const node = { x, y };
        state.penNodes.push(node);
        state.penSession = { nodeIndex: state.penNodes.length - 1, drag: "bend", startX: x, startY: y, origin: { ...node } };
      }
      renderVectorLayer(); event.preventDefault(); return;
    }
    if (TC().isCreationTool(state.tool) || state.drawSession?.type === "slice") {
      state.drawSession = { ...(state.drawSession || {}), startX: event.clientX, startY: event.clientY, active: true };
      event.preventDefault(); return;
    }
    if (event.button !== 0 || state.tool.devMode) return;

    if (TC().shouldSelectElements(state.tool)) {
      const hit = pageElementAt(event.clientX, event.clientY);
      if (hit) select(event.altKey ? hit.parentElement : hit);
    }

    if (!state.selected || (!TC().shouldSelectElements(state.tool) && !TC().shouldScale(state.tool))) return;

    if (!eventOnSelected(event)) return;
    event.preventDefault();
    const el = state.selected;
    const parent = el.parentElement;
    const owned = el.hasAttribute("data-tinkr-owned") || el.hasAttribute("data-tinkr-wireframe");
    const flow = state.moveMode === "structural" && !owned;
    state.drag = beginLayerDrag(el, event, flow);
    capturePointer(event);
    if (flow) status("Structural reorder · drag between sibling layers.");
    else status("Visual move · drop over another layer to place above it.");
  }

  function moveDrag(event) {
    if (state.panSession) {
      state.viewport.x = state.panSession.vx + (event.clientX - state.panSession.x);
      state.viewport.y = state.panSession.vy + (event.clientY - state.panSession.y);
      applyViewport(); return;
    }
    if (state.drawSession?.active && state.drawSession.startX != null) {
      const x = Math.min(state.drawSession.startX, event.clientX), y = Math.min(state.drawSession.startY, event.clientY);
      const w = Math.abs(event.clientX - state.drawSession.startX), h = Math.abs(event.clientY - state.drawSession.startY);
      state.drawSession.preview = TC().createShape(state.tool.variant === "rect" ? "rect" : state.tool.variant, x, y, w, h, { fill: "rgba(124,233,255,0.12)" });
      renderVectorLayer(); return;
    }
    if (state.strokeSession) {
      TC().schedulePoint(state.strokeSession, event.clientX, event.clientY, () => renderVectorLayer(), { shiftKey: event.shiftKey });
      return;
    }
    if (state.penSession && state.tool.group === "draw" && state.tool.variant === "pen") {
      const idx = state.penSession.nodeIndex;
      const node = state.penNodes[idx];
      if (!node) return;
      const x = event.clientX, y = event.clientY;
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
      status(`Scaling · ${Math.round(width)} × ${Math.round(height)}${event.shiftKey ? " · ratio locked" : ""}`);
      placeBox("#tinkr-selected", el); return;
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
    const scale = state.viewport.scale || 1;
    const dx = Math.round((event.clientX - d.x) / scale), dy = Math.round((event.clientY - d.y) / scale);
    d.el.style.translate = `${d.baseTranslate.x + dx}px ${d.baseTranslate.y + dy}px`;
    d.dropTarget = layerTargetAt(event.clientX, event.clientY, d.el);
    showLayerTarget(d.dropTarget);
    placeBox("#tinkr-selected", d.el);
  }

  function endDrag(event) {
    if (state.panSession) { state.panSession = null; queueSave(); return; }
    if (state.drawSession?.active && state.drawSession.startX != null) {
      const x = Math.min(state.drawSession.startX, event.clientX), y = Math.min(state.drawSession.startY, event.clientY);
      const w = event.clientX - state.drawSession.startX, h = event.clientY - state.drawSession.startY;
      if (Math.abs(w) > 4 || Math.abs(h) > 4) finishShapeDraw(x, y, w, h);
      state.drawSession = null; state.drawSession?.preview && delete state.drawSession.preview;
      renderVectorLayer(); return;
    }
    if (state.strokeSession) {
      finishPencilStroke(); return;
    }
    if (state.penSession) {
      state.penSession = null;
      const layer = state.vectorLayers.find(v => v.id === state.selectedVectorId);
      if (layer?.nodes) { layer.nodes = [...state.penNodes]; layer.d = TC().bezierToD(state.penNodes); queueSave(); }
      return;
    }
    if (state.scaleSession) {
      const el = state.scaleSession.el;
      push({ type: "set_styles", selector: selectorFor(el), styles: { width: el.style.width, height: el.style.height } }, () => restore(el, state.scaleSession.start));
      state.scaleSession = null; return;
    }
    if (!state.drag) return;
    const d = state.drag;
    if (d.kind === "proxy") {
      const moved = Math.hypot(event.clientX - d.x, event.clientY - d.y) > 3;
      if (moved) {
        state.suppressClick = true;
        push({ type: "update_proxy", proxyId: d.layer.id, before: d.before, after: { ...d.layer } }, () => { Object.assign(d.layer, d.before); renderVisualLayers(); });
      } else Object.assign(d.layer, d.before);
      state.drag = null; releasePointer(event); renderVisualLayers(); return;
    }
    if (d.flow) {
      const before = d.el.nextElementSibling;
      const changed = before !== d.originalNext;
      if (changed) push({ type: "reorder_dom", selector: d.selector, target: fingerprint(d.el), parent: selectorFor(d.parent), before: before ? selectorFor(before) : null }, () => d.parent.insertBefore(d.el, d.originalNext));
      else restore(d.el, d.before);
      state.root?.querySelector("#tinkr-insert-indicator")?.classList.add("tinkr-hide");
      state.drag = null; releasePointer(event); status(changed ? "Layer reordered." : "Reorder cancelled."); return;
    }
    commitLayerDrag(d);
    const moved = Math.hypot(event.clientX - d.x, event.clientY - d.y) > 3;
    if (moved) {
      state.suppressClick = true;
      if (d.dropTarget && d.dropTarget !== d.el) d.el.style.zIndex = String((Number(getComputedStyle(d.dropTarget).zIndex) || 0) + 1);
      push({ type: "move_layer", selector: selectorFor(d.el), target: fingerprint(d.el), before: { style: d.before.style }, after: { styles: { position: d.el.style.position, translate: d.el.style.translate, zIndex: d.el.style.zIndex } } }, () => restore(d.el, d.before));
    } else restore(d.el, d.before);
    state.root?.querySelector("#tinkr-layer-target")?.classList.add("tinkr-hide");
    state.drag = null; releasePointer(event);
  }

  function onMove(event) {
    if (!state.active) return;
    drawOverlay(); renderPins(); renderDevOverlay();
    const el = pageElementAt(event.clientX, event.clientY);
    updateCursor(event, el);
    if (el && !isTinkr(el)) {
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
    const proxy = event.target?.closest?.("[data-tinkr-proxy-id]");
    if (proxy) { selectProxy(proxy.dataset.tinkrProxyId); event.preventDefault(); event.stopPropagation(); return; }
    if (state.suppressClick) { state.suppressClick = false; return; }
    if (state.tool.group === "comment" || state.pinCommentMode) {
      event.preventDefault(); event.stopPropagation();
      const body = prompt("Pinned comment"); if (body) addLocalComment(body, pageElementAt(event.clientX, event.clientY) || document.body);
      state.pinCommentMode = false; state.tool.group = "move"; state.tool.variant = "select"; pushPanelState(); return;
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
    const hitVector = [...state.vectorLayers].reverse().find(v => TC().hitTest(v, event.clientX, event.clientY));
    if (hitVector && (event.altKey || state.tool.group === "draw")) { selectVector(hitVector.id); return; }
    const hit = pageElementAt(event.clientX, event.clientY);
    if (!hit) return;
    select(event.altKey ? hit.parentElement : hit);
  }

  function onKey(event) {
    if (!state.active) return;
    if (event.key === "Escape") {
      if (state.drag) {
        const drag = state.drag;
        if (drag.kind === "proxy") { Object.assign(drag.layer, drag.before); renderVisualLayers(); }
        else restore(drag.el, drag.before);
        state.drag = null; state.root?.querySelector("#tinkr-layer-target")?.classList.add("tinkr-hide"); releasePointer(event); status("Move cancelled."); return;
      }
      if (state.scaleSession) { restore(state.scaleSession.el, state.scaleSession.start); state.scaleSession = null; releasePointer(event); status("Scale cancelled."); return; }
      if (state.strokeSession) { state.strokeSession = null; renderVectorLayer(); return; }
      if (state.penNodes.length) { state.penNodes = []; state.penSession = null; renderVectorLayer(); return; }
      if (state.tool.devMode) { setDevMode(false); return; }
      deactivate({ flush: true }); return;
    }
    if (event.target.matches("input,textarea,[contenteditable='true']")) return;
    const mod = event.ctrlKey || event.metaKey;
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

  function onScroll() { if (state.active) { drawOverlay(); renderPins(); renderVisualLayers(); } }

  async function bootFromUrl() {
    const params = new URLSearchParams(location.search);
    const projectId = params.get("tinkr_project");
    const importToken = params.get("tinkr_import");
    const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
    state.signedIn = auth?.signedIn;
    if (projectId && state.signedIn) await loadCloudProject(projectId);
    else if (importToken) await importSharedRevision(importToken);
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
    if (!state.spaceHand) return;
    state.spaceHand = false;
    state.panSession = null;
    pushPanelState();
  }

  function onVisibilityChange() {
    if (document.hidden) onWindowBlur();
  }

  function onPageHide() {
    if (!state.active || state.skipPersist) return;
    clearTimeout(state.autosaveTimer);
    clearTimeout(state.cloudSyncTimer);
    save().then(() => deactivate({ silent: true }));
  }

  async function activate() {
    if (state.active) return getPanelState();
    createOverlay();
    state.active = true;
    document.body.classList.add("tinkr-design-mode");
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("pointerdown", startDrag, true);
    document.addEventListener("pointerup", endDrag, true);
    document.addEventListener("pointercancel", endDrag, true);
    document.addEventListener("pointermove", moveDrag, true);
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("scroll", onScroll, true);
    state.onPageHide = onPageHide;
    window.addEventListener("pagehide", state.onPageHide);
    window.addEventListener("beforeunload", state.onPageHide);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    state.observer = new MutationObserver(() => {
      if (isTransientSession()) return;
      clearTimeout(state.settleTimer);
      state.settleTimer = setTimeout(settleDomPatches, 160);
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
    await bootFromUrl();
    await replay();
    const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
    state.signedIn = auth?.signedIn;
    if (state.projectId && state.signedIn) chrome.runtime.sendMessage({ type: "TINKR_REALTIME_JOIN", projectId: state.projectId });
    chrome.runtime.sendMessage({ type: "TINKR_DESIGN_ACTIVE" }).catch(() => {});
    pushPanelState();
    status(state.signedIn ? "Design Mode · cloud sync enabled." : "Design Mode · local only until sign-in.");
    return getPanelState();
  }

  async function deactivate(opts = {}) {
    if (!state.active) return getPanelState();
    const { flush = false, silent = false } = opts;
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
    state.drawSession = null;
    document.body.classList.remove("tinkr-design-mode", "tinkr-viewport-mode", "tinkr-dev-mode");
    document.body.style.transform = "";
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
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("wheel", onWheel, true);
    ["pointermove", "click", "keydown", "keyup", "pointerdown", "pointerup", "pointercancel"].forEach(type => document.removeEventListener(type, ({ pointermove: onMove, click: onClick, keydown: onKey, keyup: onKeyUp, pointerdown: startDrag, pointerup: endDrag, pointercancel: endDrag })[type], true));
    document.removeEventListener("pointermove", moveDrag, true);
    state.toolbarCleanup?.();
    state.toolbarCleanup = null;
    teardownInjectedStyles();
    state.root?.remove();
    state.root = null;
    state.selected = null;
    state.hover = null;
    state.drag = null;
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
