(() => {
  function resolvePatchTarget(patch, documentRef = document) {
    let el = patch.selector && documentRef.querySelector(patch.selector);
    if (el && patch.type !== "reorder") return el;
    const target = patch.target;
    if (!target?.tag) return el || null;
    const candidates = [...documentRef.querySelectorAll(target.tag)].filter(node =>
      (!target.text || (node.innerText || "").trim().includes(target.text.slice(0, 32))) &&
      (target.stable || []).every(([k, v]) => node.getAttribute(k) === v)
    );
    return candidates.length === 1 ? candidates[0] : el || null;
  }

  function applyBreakpointStyle(el, breakpoint, styles, documentRef = document) {
    let key = el.getAttribute("data-tinkr-anchor");
    if (!key) { key = `t${Math.random().toString(36).slice(2, 10)}`; el.setAttribute("data-tinkr-anchor", key); }
    const id = `tinkr-responsive-${breakpoint}`;
    let css = documentRef.querySelector(`style#${CSS.escape(id)}`);
    if (!css) { css = documentRef.createElement("style"); css.id = id; documentRef.head.append(css); }
    css.textContent += `@media(max-width:${breakpoint}px){[data-tinkr-anchor="${key}"]{${Object.entries(styles).map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}!important`).join(";")}}}`;
  }

  function applyPatch(patch, documentRef = document) {
    const el = resolvePatchTarget(patch, documentRef);
    if (!el && patch.type !== "insert_html" && patch.type !== "insert_vector" && patch.type !== "update_proxy") return false;
    if (patch.type === "set_styles") {
      patch.breakpoint && patch.breakpoint !== "base"
        ? applyBreakpointStyle(el, patch.breakpoint, patch.styles, documentRef)
        : Object.assign(el.style, patch.styles);
    }
    if (patch.type === "update_text") el.textContent = patch.text;
    if (patch.type === "hide") el.classList.add("tinkr-hidden");
    if (patch.type === "insert_html") {
      const parent = documentRef.querySelector(patch.parent);
      if (!parent) return false;
      const holder = documentRef.createElement("div");
      holder.innerHTML = patch.html;
      const insert = holder.firstElementChild;
      const after = patch.after ? documentRef.querySelector(patch.after) : null;
      if (after?.parentElement === parent) after.after(insert);
      else parent.append(insert);
    }
    if (patch.type === "reorder") {
      const parent = documentRef.querySelector(patch.parent);
      if (!parent) return false;
      const before = patch.before ? documentRef.querySelector(patch.before) : null;
      if (before?.parentElement === parent) parent.insertBefore(el, before);
      else parent.append(el);
    }
    if (patch.type === "reorder_dom") {
      const parent = documentRef.querySelector(patch.parent);
      if (!parent) return false;
      const before = patch.before ? documentRef.querySelector(patch.before) : null;
      if (before?.parentElement === parent) parent.insertBefore(el, before);
      else parent.append(el);
    }
    if (patch.type === "move_layer") Object.assign(el.style, patch.after?.styles || patch.styles || {});
    if (patch.type === "set_layer_order") Object.assign(el.style, patch.after || {});
    if (patch.type === "create_proxy") {
      Object.assign(el.style, { opacity: "0", pointerEvents: "none" });
      el.setAttribute("data-tinkr-proxy-source", patch.proxy?.id || "true");
    }
    if (patch.type === "hide_source") Object.assign(el.style, patch.after || { opacity: "0", pointerEvents: "none" });
    if (patch.type === "restore_source") {
      if (patch.after?.style === null) el.removeAttribute("style");
      else if (patch.after?.style) el.setAttribute("style", patch.after.style);
      el.removeAttribute("data-tinkr-proxy-source");
    }
    return true;
  }

  function applyDraft(draft, documentRef = document) {
    const patches = draft?.patches || [];
    let missed = 0;
    patches.forEach(p => { if (!applyPatch(p, documentRef)) missed++; });
    return { applied: patches.length - missed, missed };
  }

  window.TinkrCanvas = window.TinkrCanvas || {};
  Object.assign(window.TinkrCanvas, { resolvePatchTarget, applyPatch, applyDraft, applyBreakpointStyle });
})();
