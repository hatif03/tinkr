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
    active: false, selected: null, hover: null, patches: [], undo: [], clipboard: null, styleClipboard: null,
    drag: null, root: null, breakpoint: "base", observer: null, settleTimer: null, labs: [], pendingLab: null,
    projectId: null, signedIn: false, cloudSyncTimer: null, sections: [], slices: [], tokens: { ...DEFAULT_TOKENS },
    prototypeLinks: [], motion: [], comments: [], presence: [], panel: "design",
    viewport: { scale: 1, x: 0, y: 0 }, vectorLayers: [], selectedVectorId: null,
    styles: JSON.parse(JSON.stringify(DEFAULT_STYLES)), components: [],
    tool: TC()?.createDefaultTool?.() || { group: "move", variant: "select", devMode: false, protoMode: false },
    pinCommentMode: false, originalStyles: new Map(), preview: null, _status: "", labOutput: null, labHasOps: null,
    drawSession: null, panSession: null, scaleSession: null, penNodes: [], timelineOpen: false, presentMode: false
  };

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
  function nextZ() { return (state._z = (state._z || 1000) + 1); }
  function rgbToHex(value) { const m = value?.match(/\d+/g); return m?.length >= 3 ? `#${m.slice(0, 3).map(n => Number(n).toString(16).padStart(2, "0")).join("")}` : "#000000"; }

  function cursorState(el) {
    if (state.tool.devMode) return "inspect";
    if (state.tool.group === "comment" || state.pinCommentMode) return "comment";
    if (TC().shouldPan(state.tool)) return state.panSession ? "grabbing" : "hand";
    if (state.scaleSession || TC().shouldScale(state.tool)) return "scale";
    if (state.drag) return "grabbing";
    if (state.tool.group === "draw") return state.tool.variant === "pen" ? "pen" : "create";
    if (TC().isCreationTool(state.tool)) return "create";
    if (unsafeTarget(el)) return "locked";
    if (imageTarget(el)) return "image";
    if (textTarget(el)) return "text";
    return el === state.selected ? "selected" : "";
  }

  function updateCursor(event, el) {
    const cursor = state.root?.querySelector("#tinkr-cursor"), label = state.root?.querySelector("#tinkr-cursor-label");
    if (!cursor || !label) return;
    cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`;
    label.style.left = `${event.clientX}px`; label.style.top = `${event.clientY}px`;
    cursor.className = `tinkr-cursor ${cursorState(el)}`;
    if (state.tool.devMode) label.textContent = "Inspect values · read only";
    else if (state.tool.group === "comment") label.textContent = "Click to pin a comment";
    else if (TC().shouldPan(state.tool)) label.textContent = state.panSession ? "Panning canvas" : "Hand tool";
    else if (TC().shouldScale(state.tool)) label.textContent = state.selected ? "Drag a handle to scale" : "Select a layer to scale";
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
      <div id="tinkr-overlay" class="tinkr-overlay"></div><div id="tinkr-live-cursors"></div><div id="tinkr-pins"></div>
      <div class="tinkr-box" id="tinkr-hover"></div><div class="tinkr-box selected tinkr-hide" id="tinkr-selected"></div>`;
    const sandbox = document.createElement("iframe"); sandbox.src = chrome.runtime.getURL("sandbox.html"); sandbox.style.display = "none"; sandbox.id = "tinkr-sandbox"; root.append(sandbox);
    document.documentElement.append(root); state.root = root;
    window.TinkrToolbar?.mountToolbar(root, {
      setTool: (g, v) => setTool(g, v),
      toggleDevMode: () => setDevMode(!state.tool.devMode),
      toggleTimeline: () => { state.timelineOpen = !state.timelineOpen; state.root.querySelector("#tinkr-timeline")?.classList.toggle("tinkr-hide", !state.timelineOpen); renderTimeline(); pushPanelState(); },
      enterPresent: () => { state.presentMode = true; state.tool.protoMode = true; state.panel = "proto"; document.documentElement.requestFullscreen?.(); pushPanelState(); },
      openResources: () => { state.panel = "design"; status("Resources: use + components in side panel or drag from dashboard."); pushPanelState(); }
    });
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

  function isTinkr(node) { return node && (node === state.root || state.root?.contains(node)); }

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
    if (state.penNodes.length) {
      const d = TC().bezierToD(state.penNodes);
      svg.innerHTML += `<path d="${d}" fill="none" stroke="#7ce9ff" stroke-width="2" stroke-dasharray="4 4"/>`;
      state.penNodes.forEach((n, i) => {
        svg.innerHTML += `<circle cx="${n.x}" cy="${n.y}" r="4" fill="${i === 0 ? "#b8ff37" : "#7ce9ff"}"/>`;
      });
    }
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
          borderRadius: parseFloat(style.borderRadius) || 0, opacity: parseFloat(style.opacity) || 1
        },
        context: { text: textTarget(el), image: imageTarget(el) }
      };
    }
    return {
      active: state.active, signedIn: state.signedIn, status: state._status, breakpoint: state.breakpoint, panel: state.panel,
      tool: { ...state.tool }, pinCommentMode: state.pinCommentMode || state.tool.group === "comment",
      selection, sections: state.sections, slices: state.slices, tokens: state.tokens,
      styles: state.styles, vectorLayers: state.vectorLayers, prototypeLinks: state.prototypeLinks,
      motion: state.motion, presence: state.presence.slice(0, 6), preview: state.preview,
      labOutput: state.labOutput, labHasOps: state.labHasOps,
      devOutput: state.tool.devMode ? getDevOutput() : null,
      devSpec: state.tool.devMode ? getDevSpec() : null,
      timelineOpen: state.timelineOpen, viewport: state.viewport
    };
  }

  function pushPanelState() {
    window.TinkrToolbar?.syncToolbar(state.root, state.tool);
    chrome.runtime.sendMessage({ type: "TINKR_PANEL_UPDATE", state: getPanelState() }).catch(() => {});
  }

  function status(message) { state._status = message; pushPanelState(); }

  function setTool(group, variant) {
    TC().setTool(state.tool, group, variant);
    state.pinCommentMode = group === "comment";
    if (group === "region" && variant === "section") addSection(prompt("Section label", "Section") || "Section", state.selected);
    if (group === "region" && variant === "frame") insertComponent("wireframe");
    if (group === "region" && variant === "slice") { state.drawSession = { type: "slice", start: null }; status("Drag to define slice region."); }
    state.penNodes = [];
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
    if (state.tool.devMode) { state.selected = el; placeBox("#tinkr-selected", el); renderDevOverlay(); status(`Inspecting ${el.tagName.toLowerCase()}.`); return; }
    state.selected = el; placeBox("#tinkr-selected", el); status(`Selected ${el.tagName.toLowerCase()}.`);
  }

  function selectVector(id) {
    state.selectedVectorId = id;
    state.selected = null;
    placeBox("#tinkr-selected");
    status(`Selected vector ${id.slice(0, 8)}.`);
    pushPanelState();
  }

  function selectCrumb(index) {
    if (!state.selected) return;
    const ancestors = []; let node = state.selected;
    while (node && node !== document.body && ancestors.length < 5) { ancestors.unshift(node); node = node.parentElement; }
    if (ancestors[index]) select(ancestors[index]);
  }

  function contextAction(action, value) {
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
    if (action === "boolean-union" && state.selectedVectorId) booleanOp("union");
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

  function push(patch, inverse) {
    if (patch.selector) { const el = document.querySelector(patch.selector); if (el) patch.target = fingerprint(el); }
    patch.breakpoint = patch.breakpoint || state.breakpoint;
    state.patches.push(patch); state.undo.push(inverse);
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
    if (["fontSize", "padding", "borderRadius"].includes(property) && raw !== "" && !String(raw).includes("px")) value = `${raw}px`;
    if (state.breakpoint === "base") el.style[property] = value; else applyBreakpointStyle(el, state.breakpoint, { [property]: value });
    push({ type: "set_styles", selector: selectorFor(el), styles: { [property]: value }, breakpoint: state.breakpoint }, () => restore(el, before));
  }

  function responsiveKey(el) { let key = el.getAttribute("data-tinkr-anchor"); if (!key) { key = `t${Math.random().toString(36).slice(2,10)}`; el.setAttribute("data-tinkr-anchor", key); } return key; }
  function applyBreakpointStyle(el, breakpoint, styles) { const key = responsiveKey(el), id = `tinkr-responsive-${breakpoint}`, css = [...document.querySelectorAll(`style#${CSS.escape(id)}`)][0] || Object.assign(document.createElement("style"), { id }); if (!css.isConnected) document.head.append(css); css.textContent += `@media(max-width:${breakpoint}px){[data-tinkr-anchor="${key}"]{${Object.entries(styles).map(([k,v]) => `${k.replace(/[A-Z]/g,m=>`-${m.toLowerCase()}`)}:${v}!important`).join(";")}}}`; }
  function updateText(text) { const el = state.selected; if (!el) return; const before = snapshot(el); el.textContent = text; push({ type: "update_text", selector: selectorFor(el), text }, () => restore(el, before)); }
  function hide() { if (!state.selected || state.tool.devMode) return; const el = state.selected, before = snapshot(el); el.classList.add("tinkr-hidden"); push({ type: "hide", selector: selectorFor(el) }, () => restore(el, before)); state.selected = null; placeBox("#tinkr-selected"); pushPanelState(); }

  function sanitizedClone(el) { const clone = el.cloneNode(true); clone.querySelectorAll("script,iframe,form,style,link").forEach(n => n.remove()); clone.querySelectorAll("*").forEach(n => [...n.attributes].filter(a => a.name.startsWith("on") || a.name === "id").forEach(a => n.removeAttribute(a.name))); return clone; }
  function duplicate() { if (!state.selected || state.tool.devMode) return; const source = state.selected, clone = sanitizedClone(source); source.after(clone); push({ type: "insert_html", parent: selectorFor(source.parentElement), after: selectorFor(source), html: clone.outerHTML }, () => clone.remove()); select(clone); }
  function copy() { if (!state.selected) return; state.clipboard = sanitizedClone(state.selected).outerHTML; status("Component copied."); }
  function paste() { if (!state.selected || !state.clipboard || state.tool.devMode) return; const holder = document.createElement("div"); holder.innerHTML = state.clipboard; const clone = holder.firstElementChild; state.selected.after(clone); push({ type: "insert_html", parent: selectorFor(state.selected.parentElement), after: selectorFor(state.selected), html: clone.outerHTML }, () => clone.remove()); select(clone); }

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

  function insertComponent(kind) { const anchor = state.selected || document.body; const holder = document.createElement("div"); holder.innerHTML = componentHTML(kind); const el = holder.firstElementChild; anchor.after(el); push({ type: "insert_html", parent: selectorFor(anchor.parentElement), after: selectorFor(anchor), html: el.outerHTML }, () => el.remove()); select(el); }

  function autoLayout(kind) {
    if (!state.selected || state.tool.devMode) return status("Select a container first.");
    const el = state.selected, before = snapshot(el);
    if (kind === "flex") Object.assign(el.style, { display: "flex", flexWrap: "wrap", gap: state.tokens["--tinkr-gap"] });
    if (kind === "grid") Object.assign(el.style, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: state.tokens["--tinkr-gap"] });
    if (kind === "gap") Object.assign(el.style, { gap: state.tokens["--tinkr-gap"] });
    push({ type: "set_styles", selector: selectorFor(el), styles: Object.fromEntries([...el.style].map(k => [k, el.style[k]])) }, () => restore(el, before));
    status("Auto layout applied.");
  }

  function undo() { const inverse = state.undo.pop(); if (!inverse) return status("Nothing to undo."); state.patches.pop(); inverse(); status("Undid last change."); queueSave(); }
  function reset() { while (state.undo.length) state.undo.pop()(); state.patches = []; state.vectorLayers = []; state.selected = null; placeBox("#tinkr-selected"); renderVectorLayer(); status("All local edits reset."); queueSave(); }

  function draftPayload() {
    return {
      patches: state.patches, labs: state.labs, tokens: state.tokens, sections: state.sections, slices: state.slices,
      prototypeLinks: state.prototypeLinks, motion: state.motion, vectorLayers: state.vectorLayers,
      styles: state.styles, components: state.components
    };
  }

  async function save() {
    await chrome.storage.local.set({ [storageKey()]: { ...draftPayload(), projectId: state.projectId, viewport: state.viewport, updatedAt: new Date().toISOString() } });
    status(`Saved locally · ${state.patches.length} patches.`);
  }

  async function syncCloud() {
    const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
    state.signedIn = auth?.signedIn;
    if (!state.signedIn) return;
    const body = { current_draft: draftPayload(), canvas_meta: { sections: state.sections, viewportState: state.viewport }, sourceUrl: location.href, fingerprint: { pathname: location.pathname, title: document.title } };
    if (state.projectId) {
      const result = await api(`/api/projects/${state.projectId}`, "PATCH", body);
      status(result.ok ? "Synced to Tinkr Cloud." : `Cloud sync failed: ${result.data?.error || "unknown"}`);
      return;
    }
    const created = await api("/api/projects", "POST", { ...body, name: document.title.slice(0, 80) || "Untitled remix" });
    if (created.ok) {
      state.projectId = created.data.project.id;
      await chrome.storage.local.set({ [storageKey()]: { ...draftPayload(), projectId: state.projectId, updatedAt: new Date().toISOString() } });
      chrome.runtime.sendMessage({ type: "TINKR_REALTIME_JOIN", projectId: state.projectId });
      status("Created cloud project and synced.");
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
    state.styles = draft.styles || JSON.parse(JSON.stringify(DEFAULT_STYLES));
    state.components = draft.components || [];
    state.prototypeLinks = draft.prototypeLinks || [];
    state.motion = draft.motion || [];
    state.viewport = project.canvas_meta?.viewportState || state.viewport;
    applyTokens(); applyViewport(); resetAndReplay(); drawOverlay(); renderVectorLayer(); pushPanelState();
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
    resetAndReplay(); renderVectorLayer();
    status("Imported shared revision.");
  }

  function resetAndReplay() { state.undo = []; state.patches.forEach(p => applyPatch(p)); if (state.selected) placeBox("#tinkr-selected", state.selected); pushPanelState(); }

  async function replay() {
    const data = await chrome.storage.local.get(storageKey());
    const saved = data[storageKey()] || {};
    state.patches = saved.patches || [];
    state.labs = saved.labs || [];
    state.tokens = { ...DEFAULT_TOKENS, ...(saved.tokens || {}) };
    state.sections = saved.sections || [];
    state.slices = saved.slices || [];
    state.vectorLayers = saved.vectorLayers || [];
    state.styles = saved.styles || JSON.parse(JSON.stringify(DEFAULT_STYLES));
    state.prototypeLinks = saved.prototypeLinks || [];
    state.motion = saved.motion || [];
    state.projectId = saved.projectId || null;
    state.viewport = saved.viewport || state.viewport;
    applyTokens(); applyViewport();
    let missed = 0; state.patches.forEach(p => { if (!applyPatch(p)) missed++; });
    renderVectorLayer();
    if (state.patches.length) status(missed ? `${missed} patches need reattachment.` : `Restored ${state.patches.length} local changes.`);
    drawOverlay();
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
    if (state.penNodes.length < 2) { state.penNodes = []; renderVectorLayer(); return; }
    const d = TC().bezierToD(state.penNodes, closed);
    const xs = state.penNodes.map(n => n.x), ys = state.penNodes.map(n => n.y);
    const layer = { id: TC().uid(), type: "path", x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), fill: closed ? "rgba(124,233,255,0.15)" : "none", stroke: "#7ce9ff", d, nodes: [...state.penNodes] };
    state.vectorLayers.push(layer);
    push({ type: "insert_vector", vector: layer }, () => { state.vectorLayers = state.vectorLayers.filter(v => v.id !== layer.id); renderVectorLayer(); });
    state.penNodes = []; renderVectorLayer(); queueSave(); status("Path created.");
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
      duplicate, copy, paste, delete: hide, undo, reset, save, "run-lab": () => {}, "apply-lab": applyLab,
      generate: () => {}, apply: applyPreview, checkpoint: createCheckpoint, "export-patch": exportPatchJson,
      "add-section": () => {}, "pin-comment": () => setTool("comment", "pin"),
      "toggle-viewport": () => { applyViewport(); status("Viewport transform applied."); },
      "add-hotspot": () => addHotspot(prompt("Scroll target selector or URL", "")),
      "add-motion": addMotionPreset, "boolean-union": () => booleanOp("union")
    })[name]?.();
  }

  function handleCmd(cmd, payload) {
    if (cmd === "toggle") { state.active ? deactivate() : activate(); return getPanelState(); }
    if (cmd === "setPanel") { state.panel = payload.panel || "design"; if (payload.panel === "inspect") setDevMode(true); pushPanelState(); return getPanelState(); }
    if (cmd === "setTool") { setTool(payload.group, payload.variant); return getPanelState(); }
    if (cmd === "setDevMode") { setDevMode(Boolean(payload.on)); return getPanelState(); }
    if (cmd === "setProtoMode") { setProtoMode(Boolean(payload.on)); return getPanelState(); }
    if (cmd === "setViewport") { state.viewport = { ...state.viewport, ...payload }; applyViewport(); queueSave(); pushPanelState(); return getPanelState(); }
    if (cmd === "setBreakpoint") { state.breakpoint = payload.breakpoint; status(`Editing ${state.breakpoint === "base" ? "base" : state.breakpoint + "px override"}.`); return getPanelState(); }
    if (cmd === "setStyle") { setStyle(payload.property, payload.value); return getPanelState(); }
    if (cmd === "setToken") { state.tokens[payload.key] = payload.value; applyTokens(); queueSave(); pushPanelState(); return getPanelState(); }
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
    if (isTinkr(event.target)) return;
    if (TC().shouldPan(state.tool)) {
      state.panSession = { x: event.clientX, y: event.clientY, vx: state.viewport.x, vy: state.viewport.y };
      event.preventDefault(); return;
    }
    if (state.tool.group === "draw" && state.tool.variant === "pen") {
      const x = event.clientX, y = event.clientY;
      if (event.detail === 2) { finishPenPath(true); return; }
      state.penNodes.push({ x, y }); renderVectorLayer(); event.preventDefault(); return;
    }
    if (TC().isCreationTool(state.tool) || state.drawSession?.type === "slice") {
      state.drawSession = { ...(state.drawSession || {}), startX: event.clientX, startY: event.clientY, active: true };
      event.preventDefault(); return;
    }
    if (!state.selected || event.button !== 0 || state.tool.devMode || (!TC().shouldSelectElements(state.tool) && !TC().shouldScale(state.tool))) return;
    if (state.tool.variant === "scale" && event.target?.dataset?.handle) {
      state.scaleSession = { handle: event.target.dataset.handle, el: state.selected, start: snapshot(state.selected), rect: state.selected.getBoundingClientRect(), x: event.clientX, y: event.clientY };
      event.preventDefault(); return;
    }
    if (!state.selected.contains(event.target) && event.target !== state.selected) return;
    event.preventDefault();
    const el = state.selected, before = snapshot(el);
    const parent = el.parentElement, parentStyle = parent && getComputedStyle(parent);
    const flow = Boolean(parent && (parentStyle.display.includes("flex") || parentStyle.display.includes("grid") || getComputedStyle(el).position === "static"));
    state.drag = { el, before, x: event.clientX, y: event.clientY, left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0, flow, parent, originalNext: el.nextElementSibling, selector: selectorFor(el) };
    if (flow) status("Reorder mode · drag between siblings to place this layer.");
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
    if (state.tool.group === "draw" && state.tool.variant === "pencil") {
      state.penNodes.push({ x: event.clientX, y: event.clientY });
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
    if (d.flow) {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      let sibling = hit;
      while (sibling && sibling.parentElement !== d.parent) sibling = sibling.parentElement;
      if (sibling && sibling !== d.el) {
        const rect = sibling.getBoundingClientRect(), direction = getComputedStyle(d.parent).flexDirection;
        const horizontal = direction?.startsWith("row") || getComputedStyle(d.parent).display.includes("grid");
        const before = horizontal ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
        d.parent.insertBefore(d.el, before ? sibling : sibling.nextElementSibling);
        placeBox("#tinkr-selected", d.el);
      }
      return;
    }
    d.el.style.left = `${d.left + event.clientX - d.x}px`;
    d.el.style.top = `${d.top + event.clientY - d.y}px`;
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
    if (state.tool.group === "draw" && state.tool.variant === "pencil" && state.penNodes.length > 2) {
      const simplified = TC().simplifyPencil(state.penNodes.map(n => [n.x, n.y]));
      state.penNodes = simplified.map(([x, y]) => ({ x, y }));
      finishPenPath(false); return;
    }
    if (state.scaleSession) {
      const el = state.scaleSession.el;
      push({ type: "set_styles", selector: selectorFor(el), styles: { width: el.style.width, height: el.style.height } }, () => restore(el, state.scaleSession.start));
      state.scaleSession = null; return;
    }
    if (!state.drag) return;
    const d = state.drag;
    if (d.flow) {
      const before = d.el.nextElementSibling;
      const changed = before !== d.originalNext;
      if (changed) push({ type: "reorder", selector: d.selector, target: fingerprint(d.el), parent: selectorFor(d.parent), before: before ? selectorFor(before) : null }, () => d.parent.insertBefore(d.el, d.originalNext));
      else restore(d.el, d.before);
      state.drag = null; status(changed ? "Layer reordered." : "Reorder cancelled."); return;
    }
    const moved = d.el.style.left !== `${d.left}px` || d.el.style.top !== `${d.top}px`;
    if (moved) push({ type: "set_styles", selector: selectorFor(d.el), styles: { position: d.el.style.position, left: d.el.style.left, top: d.el.style.top } }, () => restore(d.el, d.before));
    else restore(d.el, d.before);
    state.drag = null;
  }

  function onMove(event) {
    if (!state.active) return;
    drawOverlay(); renderPins(); renderDevOverlay();
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (el && !isTinkr(el)) {
      updateCursor(event, el);
      if (!state.drag && !state.tool.devMode && TC().shouldSelectElements(state.tool) && el !== state.hover) {
        state.hover = el; placeBox("#tinkr-hover", el);
      } else if (state.tool.devMode && el !== state.hover) {
        state.hover = el; renderDevOverlay();
      }
    }
  }

  function onClick(event) {
    if (!state.active || isTinkr(event.target)) return;
    if (state.tool.group === "comment" || state.pinCommentMode) {
      event.preventDefault(); event.stopPropagation();
      const body = prompt("Pinned comment"); if (body) addLocalComment(body, document.elementFromPoint(event.clientX, event.clientY) || document.body);
      state.pinCommentMode = false; state.tool.group = "move"; state.tool.variant = "select"; pushPanelState(); return;
    }
    if (state.tool.group === "draw" && state.tool.variant === "pen") return;
    if (TC().isCreationTool(state.tool)) return;
    if (TC().shouldPan(state.tool)) return;
    if (!TC().shouldSelectElements(state.tool) && state.tool.variant !== "scale") return;
    event.preventDefault(); event.stopPropagation();
    const hitVector = [...state.vectorLayers].reverse().find(v => TC().hitTest(v, event.clientX, event.clientY));
    if (hitVector && event.altKey) { selectVector(hitVector.id); return; }
    select(event.altKey ? event.target.parentElement : event.target);
  }

  function onKey(event) {
    if (!state.active) return;
    if (event.key === "Escape") {
      if (state.penNodes.length) { state.penNodes = []; renderVectorLayer(); return; }
      if (state.tool.devMode) { setDevMode(false); return; }
      deactivate(); return;
    }
    if (event.target.matches("input,textarea,[contenteditable='true']")) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); return; }
    if ((event.key === "Delete" || event.key === "Backspace") && !state.tool.devMode) { event.preventDefault(); hide(); return; }
    if (event.key.toLowerCase() === "v") setTool("move", "select");
    if (event.key.toLowerCase() === "h") setTool("move", "hand");
    if (event.key.toLowerCase() === "k") setTool("move", "scale");
    if (event.key.toLowerCase() === "p" && !event.shiftKey) setTool("draw", "pen");
    if (event.key.toLowerCase() === "r") setTool("shape", "rect");
    if (event.key.toLowerCase() === "t") setTool("text", "text");
    if (state.selected && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key) && TC().shouldSelectElements(state.tool)) {
      event.preventDefault(); const step = event.shiftKey ? 8 : 1; const property = /Left|Right/.test(event.key) ? "left" : "top"; const direction = /Up|Left/.test(event.key) ? -1 : 1;
      const before = snapshot(state.selected); state.selected.style.position = getComputedStyle(state.selected).position === "static" ? "relative" : getComputedStyle(state.selected).position;
      state.selected.style[property] = `${(parseFloat(state.selected.style[property]) || 0) + direction * step}px`;
      push({ type: "set_styles", selector: selectorFor(state.selected), styles: { position: state.selected.style.position, [property]: state.selected.style[property] } }, () => restore(state.selected, before));
      placeBox("#tinkr-selected", state.selected);
    }
  }

  function onWheel(event) {
    if (!state.active || !event.ctrlKey) return;
    event.preventDefault();
    state.viewport.scale = Math.min(3, Math.max(0.25, state.viewport.scale + (event.deltaY > 0 ? -0.05 : 0.05)));
    applyViewport(); queueSave();
  }

  function onScroll() { if (state.active) { drawOverlay(); renderPins(); } }

  async function bootFromUrl() {
    const params = new URLSearchParams(location.search);
    const projectId = params.get("tinkr_project");
    const importToken = params.get("tinkr_import");
    const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
    state.signedIn = auth?.signedIn;
    if (projectId && state.signedIn) await loadCloudProject(projectId);
    else if (importToken) await importSharedRevision(importToken);
  }

  async function activate() {
    if (state.active) return getPanelState();
    createOverlay();
    state.active = true;
    document.body.classList.add("tinkr-design-mode");
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", startDrag, true);
    document.addEventListener("mouseup", endDrag, true);
    document.addEventListener("mousemove", moveDrag, true);
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("scroll", onScroll, true);
    state.observer = new MutationObserver(() => { clearTimeout(state.settleTimer); state.settleTimer = setTimeout(() => { if (state.active) state.patches.forEach(p => applyPatch(p)); }, 160); });
    state.observer.observe(document.body, { childList: true, subtree: true });
    await bootFromUrl();
    await replay();
    const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
    state.signedIn = auth?.signedIn;
    if (state.projectId && state.signedIn) chrome.runtime.sendMessage({ type: "TINKR_REALTIME_JOIN", projectId: state.projectId });
    pushPanelState();
    status(state.signedIn ? "Design Mode · cloud sync enabled." : "Design Mode · local only until sign-in.");
    return getPanelState();
  }

  function deactivate() {
    if (!state.active) return getPanelState();
    state.active = false;
    document.body.classList.remove("tinkr-design-mode", "tinkr-viewport-mode", "tinkr-dev-mode");
    document.body.style.transform = "";
    state.observer?.disconnect();
    window.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("wheel", onWheel, true);
    ["mousemove", "click", "keydown", "mousedown", "mouseup"].forEach(type => document.removeEventListener(type, ({ mousemove: onMove, click: onClick, keydown: onKey, mousedown: startDrag, mouseup: endDrag })[type], true));
    document.removeEventListener("mousemove", moveDrag, true);
    state.root?.remove(); state.root = null; state.selected = null; state.drag = null;
    pushPanelState();
    return getPanelState();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "TINKR_TOGGLE") { sendResponse(handleCmd("toggle")); return true; }
    if (message.type === "TINKR_GET_STATE") { sendResponse(getPanelState()); return true; }
    if (message.type === "TINKR_CMD") { sendResponse(handleCmd(message.cmd, message.payload || {})); return true; }
    if (message.type === "TINKR_REALTIME" && message.event?.type === "presence") {
      state.presence = message.event.state || [];
      renderPresence();
    }
  });
})();
