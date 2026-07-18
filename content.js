(() => {
  if (window.__tinkrLoaded) return;
  window.__tinkrLoaded = true;

  const CURSOR_COLORS = ["#b8ff37", "#7ce9ff", "#ff9da2", "#c4a1ff", "#ffb347", "#6ee7b7"];
  const DEFAULT_TOKENS = { "--tinkr-primary": "#b8ff37", "--tinkr-surface": "#13151c", "--tinkr-text": "#f7f7fa", "--tinkr-muted": "#9d9da7", "--tinkr-radius": "12px", "--tinkr-gap": "16px" };

  const state = {
    active: false, selected: null, hover: null, patches: [], undo: [], clipboard: null, styleClipboard: null,
    drag: null, root: null, breakpoint: "base", observer: null, settleTimer: null, labs: [], pendingLab: null,
    projectId: null, signedIn: false, cloudSyncTimer: null, sections: [], tokens: { ...DEFAULT_TOKENS },
    prototypeLinks: [], motion: [], comments: [], presence: [], panel: "design", viewport: { scale: 1, x: 0, y: 0 },
    pinCommentMode: false, originalStyles: new Map(), preview: null, _status: "", labOutput: null, labHasOps: false
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

  const textTarget = el => /^(P|SPAN|H1|H2|H3|H4|H5|H6|LI|LABEL|A|BUTTON)$/i.test(el?.tagName);
  const imageTarget = el => el?.tagName === "IMG" || getComputedStyle(el).backgroundImage !== "none";
  const unsafeTarget = el => /^(IFRAME|CANVAS|VIDEO|AUDIO|EMBED|OBJECT)$/i.test(el?.tagName) || el?.closest("form,[contenteditable='true'],[data-tinkr-protected]");
  function fingerprint(el) { const r = el.getBoundingClientRect(); return { selector: selectorFor(el), tag: el.tagName.toLowerCase(), stable: ["data-testid","name","aria-label","role"].map(k => [k, el.getAttribute(k)]).filter(([,v]) => v), text: (el.innerText || "").trim().slice(0,160), box: [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)] }; }
  function anchorAt(x, y) { return { scrollX: window.scrollX, scrollY: window.scrollY, x, y, zIndex: nextZ() }; }
  function nextZ() { return (state._z = (state._z || 1000) + 1); }
  function rgbToHex(value) { const m = value?.match(/\d+/g); return m?.length >= 3 ? `#${m.slice(0, 3).map(n => Number(n).toString(16).padStart(2, "0")).join("")}` : "#000000"; }

  function cursorState(el) { if (state.drag) return "drag"; if (unsafeTarget(el)) return "locked"; if (imageTarget(el)) return "image"; if (textTarget(el)) return "text"; return el === state.selected ? "selected" : ""; }

  function updateCursor(event, el) {
    const cursor = state.root?.querySelector("#tinkr-cursor"), label = state.root?.querySelector("#tinkr-cursor-label");
    if (!cursor || !label) return;
    cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`;
    label.style.left = `${event.clientX}px`; label.style.top = `${event.clientY}px`;
    cursor.className = `tinkr-cursor ${cursorState(el)}`;
    if (el) { const s = getComputedStyle(el), r = el.getBoundingClientRect(); label.textContent = `${el.tagName.toLowerCase()} · ${s.display} · ${Math.round(r.width)} × ${Math.round(r.height)}`; }
    if (state.projectId && state.signedIn) {
      clearTimeout(state.cursorTimer);
      state.cursorTimer = setTimeout(() => chrome.runtime.sendMessage({ type: "TINKR_REALTIME_CURSOR", projectId: state.projectId, payload: { scrollX: window.scrollX, scrollY: window.scrollY, clientX: event.clientX, clientY: event.clientY } }), 80);
    }
  }

  function createOverlay() {
    const root = document.createElement("div"); root.id = "tinkr-root";
    root.innerHTML = `<div id="tinkr-cursor" class="tinkr-cursor"></div><div id="tinkr-cursor-label" class="tinkr-cursor-label">Inspect</div>
      <div id="tinkr-overlay" class="tinkr-overlay"></div><div id="tinkr-live-cursors"></div><div id="tinkr-pins"></div>
      <div class="tinkr-box" id="tinkr-hover"></div><div class="tinkr-box selected tinkr-hide" id="tinkr-selected"></div>`;
    const sandbox = document.createElement("iframe"); sandbox.src = chrome.runtime.getURL("sandbox.html"); sandbox.style.display = "none"; sandbox.id = "tinkr-sandbox"; root.append(sandbox);
    document.documentElement.append(root); state.root = root;
  }

  function placeBox(id, el) { const box = state.root?.querySelector(id); if (!box) return; if (!el) return box.classList.add("tinkr-hide"); const r = el.getBoundingClientRect(); Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }); box.classList.remove("tinkr-hide"); }
  function isTinkr(node) { return node && (node === state.root || state.root?.contains(node)); }

  function getDevOutput() {
    if (!state.selected) return "Select an element for Dev Mode specs.";
    const el = state.selected, computed = getComputedStyle(el), rect = el.getBoundingClientRect();
    if (!state.originalStyles.has(el)) state.originalStyles.set(el, { style: el.getAttribute("style") || "" });
    const original = state.originalStyles.get(el)?.style || "";
    const cssLines = ["display","color","backgroundColor","fontSize","padding","margin","borderRadius","width","height"].map(k => `  ${k.replace(/[A-Z]/g,m=>`-${m.toLowerCase()}`)}: ${computed[k]};`);
    return `Selector: ${selectorFor(el)}\n\nComputed CSS:\n${cssLines.join("\n")}\n\nTailwind-ish:\nw-[${Math.round(rect.width)}px] h-[${Math.round(rect.height)}px]\n\nInline diff:\n- ${original || "(none)"}\n+ ${el.getAttribute("style") || "(none)"}\n\nA11y: role=${el.getAttribute("role") || "—"}, alt=${el.getAttribute("alt") || "—"}`;
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
          backgroundColor: rgbToHex(style.backgroundColor),
          color: rgbToHex(style.color),
          fontSize: parseFloat(style.fontSize) || 0,
          padding: parseFloat(style.padding) || 0,
          borderRadius: parseFloat(style.borderRadius) || 0,
          opacity: parseFloat(style.opacity) || 1
        },
        context: { text: textTarget(el), image: imageTarget(el) }
      };
    }
    return {
      active: state.active,
      status: state._status,
      breakpoint: state.breakpoint,
      panel: state.panel,
      pinCommentMode: state.pinCommentMode,
      selection,
      sections: state.sections,
      tokens: state.tokens,
      prototypeLinks: state.prototypeLinks,
      motion: state.motion,
      presence: state.presence.slice(0, 6),
      preview: state.preview,
      labOutput: state.labOutput,
      labHasOps: state.labHasOps,
      devOutput: state.panel === "dev" ? getDevOutput() : null
    };
  }

  function pushPanelState() {
    chrome.runtime.sendMessage({ type: "TINKR_PANEL_UPDATE", state: getPanelState() }).catch(() => {});
  }

  function status(message) { state._status = message; pushPanelState(); }

  function select(el) {
    if (!el || SKIP.has(el.tagName) || isTinkr(el)) return;
    state.selected = el; placeBox("#tinkr-selected", el);
    status(`Selected ${el.tagName.toLowerCase()}.`);
  }

  function selectCrumb(index) {
    if (!state.selected) return;
    const ancestors = []; let node = state.selected;
    while (node && node !== document.body && ancestors.length < 5) { ancestors.unshift(node); node = node.parentElement; }
    if (ancestors[index]) select(ancestors[index]);
  }

  function contextAction(action, value) {
    const el = state.selected; if (!el) return;
    if (action === "edit" && value !== undefined) updateText(value);
    if (action === "upper") setStyle("textTransform", "uppercase");
    if (action === "cover") setStyle("objectFit", "cover");
    if (action === "contain") setStyle("objectFit", "contain");
    if (action === "alt" && value !== undefined) el.setAttribute("alt", value);
    if (action === "copy-style") { state.styleClipboard = el.getAttribute("style") || ""; status("Style copied."); }
    if (action === "paste-style" && state.styleClipboard !== null) { const before = snapshot(el); el.setAttribute("style", state.styleClipboard); push({ type: "set_styles", selector: selectorFor(el), styles: Object.fromEntries([...el.style].map(k => [k, el.style[k]])) }, () => restore(el, before)); }
    if (action === "ready") { el.setAttribute("data-tinkr-ready", "true"); addSection("Ready for dev", el); status("Marked ready for build."); }
    if (action === "note" && value) addLocalComment(value, el);
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
    if (!state.selected) return status("Select an element first.");
    const el = state.selected, before = snapshot(el); let value = raw;
    if (["fontSize", "padding", "borderRadius"].includes(property) && raw !== "") value = `${raw}px`;
    if (state.breakpoint === "base") el.style[property] = value; else applyBreakpointStyle(el, state.breakpoint, { [property]: value });
    push({ type: "set_styles", selector: selectorFor(el), styles: { [property]: value }, breakpoint: state.breakpoint }, () => restore(el, before));
  }

  function responsiveKey(el) { let key = el.getAttribute("data-tinkr-anchor"); if (!key) { key = `t${Math.random().toString(36).slice(2,10)}`; el.setAttribute("data-tinkr-anchor", key); } return key; }
  function applyBreakpointStyle(el, breakpoint, styles) { const key = responsiveKey(el), id = `tinkr-responsive-${breakpoint}`, css = [...document.querySelectorAll(`style#${CSS.escape(id)}`)][0] || Object.assign(document.createElement("style"), { id }); if (!css.isConnected) document.head.append(css); css.textContent += `@media(max-width:${breakpoint}px){[data-tinkr-anchor="${key}"]{${Object.entries(styles).map(([k,v]) => `${k.replace(/[A-Z]/g,m=>`-${m.toLowerCase()}`)}:${v}!important`).join(";")}}}`; }
  function updateText(text) { const el = state.selected; if (!el) return; const before = snapshot(el); el.textContent = text; push({ type: "update_text", selector: selectorFor(el), text }, () => restore(el, before)); }
  function hide() { if (!state.selected) return; const el = state.selected, before = snapshot(el); el.classList.add("tinkr-hidden"); push({ type: "hide", selector: selectorFor(el) }, () => restore(el, before)); state.selected = null; placeBox("#tinkr-selected"); pushPanelState(); }

  function sanitizedClone(el) { const clone = el.cloneNode(true); clone.querySelectorAll("script,iframe,form,style,link").forEach(n => n.remove()); clone.querySelectorAll("*").forEach(n => [...n.attributes].filter(a => a.name.startsWith("on") || a.name === "id").forEach(a => n.removeAttribute(a.name))); return clone; }
  function duplicate() { if (!state.selected) return status("Select an element first."); const source = state.selected, clone = sanitizedClone(source); source.after(clone); push({ type: "insert_html", parent: selectorFor(source.parentElement), after: selectorFor(source), html: clone.outerHTML }, () => clone.remove()); select(clone); }
  function copy() { if (!state.selected) return status("Select an element first."); state.clipboard = sanitizedClone(state.selected).outerHTML; status("Component copied."); }
  function paste() { if (!state.selected || !state.clipboard) return; const holder = document.createElement("div"); holder.innerHTML = state.clipboard; const clone = holder.firstElementChild; state.selected.after(clone); push({ type: "insert_html", parent: selectorFor(state.selected.parentElement), after: selectorFor(state.selected), html: clone.outerHTML }, () => clone.remove()); select(clone); }

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
    if (!state.selected) return status("Select a container first.");
    const el = state.selected, before = snapshot(el);
    if (kind === "flex") Object.assign(el.style, { display: "flex", flexWrap: "wrap", gap: state.tokens["--tinkr-gap"] });
    if (kind === "grid") Object.assign(el.style, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: state.tokens["--tinkr-gap"] });
    if (kind === "gap") Object.assign(el.style, { gap: state.tokens["--tinkr-gap"] });
    push({ type: "set_styles", selector: selectorFor(el), styles: Object.fromEntries([...el.style].map(k => [k, el.style[k]])) }, () => restore(el, before));
    status("Auto layout applied.");
  }

  function undo() { const inverse = state.undo.pop(); if (!inverse) return status("Nothing to undo."); state.patches.pop(); inverse(); status("Undid last change."); queueSave(); }
  function reset() { while (state.undo.length) state.undo.pop()(); state.patches = []; state.selected = null; placeBox("#tinkr-selected"); status("All local edits reset."); queueSave(); }

  function draftPayload() { return { patches: state.patches, labs: state.labs, tokens: state.tokens, sections: state.sections, prototypeLinks: state.prototypeLinks, motion: state.motion }; }

  async function save() {
    await chrome.storage.local.set({ [storageKey()]: { ...draftPayload(), projectId: state.projectId, updatedAt: new Date().toISOString() } });
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
    const result = await api(`/api/projects/${state.projectId}/revisions`, "POST", { name: `Checkpoint ${new Date().toLocaleString()}`, patches: state.patches, fingerprint: { pathname: location.pathname } });
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
    state.prototypeLinks = draft.prototypeLinks || [];
    state.motion = draft.motion || [];
    state.viewport = project.canvas_meta?.viewportState || state.viewport;
    applyTokens(); resetAndReplay(); drawOverlay(); pushPanelState();
    chrome.runtime.sendMessage({ type: "TINKR_REALTIME_JOIN", projectId });
    status(`Loaded cloud project "${project.name}".`);
  }

  async function importSharedRevision(token) {
    const { apiUrl } = await chrome.storage.local.get({ apiUrl: TINKR_CONFIG.apiUrl });
    const response = await fetch(`${apiUrl}/api/review/${token}`);
    const data = await response.json();
    if (!response.ok) return status(data.error || "Import failed.");
    state.patches = data.revision?.patch_snapshot || [];
    resetAndReplay();
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
    state.prototypeLinks = saved.prototypeLinks || [];
    state.motion = saved.motion || [];
    state.projectId = saved.projectId || null;
    applyTokens();
    let missed = 0; state.patches.forEach(p => { if (!applyPatch(p)) missed++; });
    if (state.patches.length) status(missed ? `${missed} patches need reattachment.` : `Restored ${state.patches.length} local changes.`);
    drawOverlay();
  }

  function applyPatch(patch) {
    const el = resolvePatchTarget(patch); if (!el && patch.type !== "insert_html") return false;
    if (patch.type === "set_styles") patch.breakpoint && patch.breakpoint !== "base" ? applyBreakpointStyle(el, patch.breakpoint, patch.styles) : Object.assign(el.style, patch.styles);
    if (patch.type === "update_text") el.textContent = patch.text;
    if (patch.type === "hide") el.classList.add("tinkr-hidden");
    if (patch.type === "insert_html") { const parent = document.querySelector(patch.parent); if (!parent) return false; const holder = document.createElement("div"); holder.innerHTML = patch.html; const insert = holder.firstElementChild; const after = document.querySelector(patch.after); (after?.parentElement === parent ? after : parent.lastElementChild)?.after(insert); }
    return true;
  }

  function resolvePatchTarget(patch) {
    let el = patch.selector && document.querySelector(patch.selector);
    if (el) return el;
    const target = patch.target; if (!target?.tag) return null;
    const candidates = [...document.querySelectorAll(target.tag)].filter(node => (!target.text || (node.innerText || "").trim().includes(target.text.slice(0, 32))) && (target.stable || []).every(([k,v]) => node.getAttribute(k) === v));
    return candidates.length === 1 ? candidates[0] : null;
  }

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
    const keyframe = { id: crypto.randomUUID(), selector: selectorFor(el), property: "opacity", from: "0", to: "1", duration: "600ms", delay: "0ms" };
    state.motion.push(keyframe);
    el.style.animation = `tinkr-fade-${keyframe.id} ${keyframe.duration} ease forwards`;
    let style = document.getElementById("tinkr-motion-styles");
    if (!style) { style = document.createElement("style"); style.id = "tinkr-motion-styles"; document.head.append(style); }
    style.textContent += `@keyframes tinkr-fade-${keyframe.id}{from{opacity:0}to{opacity:1}}`;
    queueSave(); pushPanelState();
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
      state.preview = data;
      status("Patch ready.");
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
    state.preview = null;
    status("AI patch applied.");
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
      "add-section": () => {}, "pin-comment": () => { state.pinCommentMode = true; status("Click the page to pin a comment."); },
      "toggle-viewport": () => { document.body.classList.toggle("tinkr-viewport-mode"); status(document.body.classList.contains("tinkr-viewport-mode") ? "Pan/zoom mode on." : "Pan/zoom mode off."); },
      "add-hotspot": () => addHotspot(prompt("Scroll target selector or URL", "")),
      "add-motion": addMotionPreset
    })[name]?.();
  }

  function handleCmd(cmd, payload) {
    if (cmd === "toggle") { state.active ? deactivate() : activate(); return getPanelState(); }
    if (cmd === "setPanel") { state.panel = payload.panel || "design"; pushPanelState(); return getPanelState(); }
    if (cmd === "setBreakpoint") { state.breakpoint = payload.breakpoint; status(`Editing ${state.breakpoint === "base" ? "base" : state.breakpoint + "px override"}.`); return getPanelState(); }
    if (cmd === "setStyle") { setStyle(payload.property, payload.value); return getPanelState(); }
    if (cmd === "setToken") { state.tokens[payload.key] = payload.value; applyTokens(); queueSave(); pushPanelState(); return getPanelState(); }
    if (cmd === "selectCrumb") { selectCrumb(payload.index); return getPanelState(); }
    if (cmd === "context") { contextAction(payload.action, payload.value); return getPanelState(); }
    if (cmd === "action") { runAction(payload.name); return getPanelState(); }
    if (cmd === "insertComponent") { insertComponent(payload.kind); return getPanelState(); }
    if (cmd === "autoLayout") { autoLayout(payload.kind); return getPanelState(); }
    if (cmd === "generate") { generate(payload.prompt); return getPanelState(); }
    if (cmd === "runLab") { runLab(payload.code, payload.name); return getPanelState(); }
    if (cmd === "addSection") { addSection(payload.label, state.selected); return getPanelState(); }
    if (cmd === "pinComment") { state.pinCommentMode = true; status("Click the page to pin a comment."); return getPanelState(); }
    if (cmd === "scrollSection") { const s = state.sections.find(x => x.id === payload.id); if (s) window.scrollTo({ top: s.scrollY - 80, behavior: "smooth" }); return getPanelState(); }
    return getPanelState();
  }

  function startDrag(event) { if (!state.selected || event.button !== 0 || isTinkr(event.target) || !state.selected.contains(event.target)) return; event.preventDefault(); const el = state.selected, before = snapshot(el); state.drag = { el, before, x: event.clientX, y: event.clientY, left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 }; el.style.position = getComputedStyle(el).position === "static" ? "relative" : getComputedStyle(el).position; }
  function moveDrag(event) { if (!state.drag) return; const d = state.drag; d.el.style.left = `${d.left + event.clientX - d.x}px`; d.el.style.top = `${d.top + event.clientY - d.y}px`; placeBox("#tinkr-selected", d.el); }
  function endDrag() { if (!state.drag) return; const d = state.drag; const moved = d.el.style.left !== `${d.left}px` || d.el.style.top !== `${d.top}px`; if (moved) push({ type: "set_styles", selector: selectorFor(d.el), styles: { position: d.el.style.position, left: d.el.style.left, top: d.el.style.top } }, () => restore(d.el, d.before)); else restore(d.el, d.before); state.drag = null; }

  function onMove(event) {
    if (!state.active) return;
    drawOverlay(); renderPins();
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (el && !isTinkr(el)) { updateCursor(event, el); if (!state.drag && el !== state.hover) { state.hover = el; placeBox("#tinkr-hover", el); } }
  }

  function onClick(event) {
    if (!state.active || isTinkr(event.target)) return;
    if (state.pinCommentMode) {
      event.preventDefault(); event.stopPropagation();
      const body = prompt("Pinned comment"); if (body) addLocalComment(body, document.elementFromPoint(event.clientX, event.clientY) || document.body);
      state.pinCommentMode = false; pushPanelState(); return;
    }
    event.preventDefault(); event.stopPropagation();
    select(event.altKey ? event.target.parentElement : event.target);
  }

  function onKey(event) {
    if (!state.active) return;
    if (event.key === "Escape") { deactivate(); return; }
    if ((event.key === "Delete" || event.key === "Backspace") && !event.target.matches("input,textarea")) { event.preventDefault(); hide(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
    if (state.selected && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)) {
      event.preventDefault(); const step = event.shiftKey ? 8 : 1; const property = /Left|Right/.test(event.key) ? "left" : "top"; const direction = /Up|Left/.test(event.key) ? -1 : 1;
      const before = snapshot(state.selected); state.selected.style.position = getComputedStyle(state.selected).position === "static" ? "relative" : getComputedStyle(state.selected).position;
      state.selected.style[property] = `${(parseFloat(state.selected.style[property]) || 0) + direction * step}px`;
      push({ type: "set_styles", selector: selectorFor(state.selected), styles: { position: state.selected.style.position, [property]: state.selected.style[property] } }, () => restore(state.selected, before));
      placeBox("#tinkr-selected", state.selected);
    }
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
    window.addEventListener("scroll", onScroll, true);
    state.observer = new MutationObserver(() => { clearTimeout(state.settleTimer); state.settleTimer = setTimeout(() => { if (state.active) state.patches.forEach(p => applyPatch(p)); }, 160); });
    state.observer.observe(document.body, { childList: true, subtree: true });
    await bootFromUrl();
    await replay();
    const auth = await chrome.runtime.sendMessage({ type: "TINKR_GET_AUTH" });
    state.signedIn = auth?.signedIn;
    if (state.projectId && state.signedIn) chrome.runtime.sendMessage({ type: "TINKR_REALTIME_JOIN", projectId: state.projectId });
    status(state.signedIn ? "Design Mode · cloud sync enabled." : "Design Mode · local only until sign-in.");
    return getPanelState();
  }

  function deactivate() {
    if (!state.active) return getPanelState();
    state.active = false;
    document.body.classList.remove("tinkr-design-mode", "tinkr-viewport-mode");
    state.observer?.disconnect();
    window.removeEventListener("scroll", onScroll, true);
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
