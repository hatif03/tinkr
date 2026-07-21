(() => {
  // A saved selector is a useful first hint, but it is not a durable identity.
  // Framework updates can make an nth-child selector point at a different
  // element, which is worse than leaving a patch unresolved. Keep the search
  // deliberately bounded and require a fingerprint match before mutating DOM.
  const MAX_ANCHOR_CANDIDATES = 240;

  function insertedOperationId(patch) {
    const value = patch && (patch.operationId || patch.layerId || patch.id);
    return value ? String(value) : "";
  }

  function findInsertedNode(patch, documentRef = document) {
    const operationId = insertedOperationId(patch);
    if (!operationId) return null;
    for (const node of documentRef.querySelectorAll("[data-tinkr-op]")) {
      if (node.getAttribute("data-tinkr-op") === operationId) return node;
    }
    return null;
  }

  function removeInsertedNode(patch, documentRef = document) {
    const node = findInsertedNode(patch, documentRef);
    if (!node) return false;
    node.remove();
    return true;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function nodeText(node) {
    return normalizeText(node?.innerText ?? node?.textContent);
  }

  function fingerprintEntries(value) {
    if (!value || typeof value !== "object") return [];
    const entries = [];
    const add = candidate => {
      if (!candidate || typeof candidate !== "object") return;
      const tag = candidate.tag || candidate.tagName;
      const stable = candidate.stable || candidate.stableAttributes || candidate.attributes;
      const text = candidate.text ?? candidate.textContent;
      // Do not confuse non-anchor metadata (for example a source page
      // fingerprint with pathname/title) with an element fingerprint. A
      // selector on its own is deliberately treated as a legacy hint, not a
      // fingerprint strong enough to validate a mutation.
      if (!tag && !stable && !text) return;
      entries.push(candidate);
    };
    add(value);
    return entries;
  }

  function patchFingerprints(patch) {
    const values = [
      patch?.target,
      patch?.fallback_fingerprint,
      patch?.fallbackFingerprint,
      patch?.fingerprint,
      patch?.anchor
    ];
    const fingerprints = [];
    values.forEach(value => {
      fingerprintEntries(value).forEach(fingerprint => {
        if (!fingerprints.includes(fingerprint)) fingerprints.push(fingerprint);
      });
    });
    return fingerprints;
  }

  function exactFingerprints(patch, fallbacks) {
    // The primary target is the identity attached to the operation itself.
    // Explicit fallback fingerprints are only for recovery once that exact
    // selector is no longer credible; they must not weaken selector validation.
    const primary = fingerprintEntries(patch?.target);
    return primary.length ? primary : fallbacks;
  }

  function stableEntries(fingerprint) {
    const stable = fingerprint?.stable || fingerprint?.stableAttributes || fingerprint?.stable_attributes || fingerprint?.attributes;
    if (Array.isArray(stable)) {
      return stable.filter(entry => Array.isArray(entry) && entry.length >= 2).map(([key, value]) => [String(key), value]);
    }
    if (stable && typeof stable === "object") return Object.entries(stable);
    return [];
  }

  function changedTargetFields(patch) {
    const fields = { text: false, attributes: new Set() };
    // `push()` captures the anchor after an edit. A text/HTML patch therefore
    // cannot require its *post-edit* text to exist before the patch is applied.
    // Its tag and all other stable attributes remain mandatory identity checks.
    if (["update_text", "update_html"].includes(patch?.type)) fields.text = true;
    if (patch?.type === "set_attributes") {
      Object.keys(patch.attributes || {}).forEach(name => fields.attributes.add(name));
    }
    return fields;
  }

  function textMatches(actual, expected) {
    const wanted = normalizeText(expected);
    if (!wanted) return true;
    const observed = normalizeText(actual);
    if (observed === wanted) return true;
    // Element fingerprints intentionally cap text to 160 chars. Preserve that
    // contract without accepting an arbitrary substring elsewhere in a node.
    return wanted.length >= 160 && observed.startsWith(wanted);
  }

  function matchesFingerprint(node, fingerprint, patch) {
    if (!node || !fingerprint) return false;
    const expectedTag = String(fingerprint.tag || fingerprint.tagName || "").toLowerCase();
    if (expectedTag && String(node.tagName || "").toLowerCase() !== expectedTag) return false;

    const changed = changedTargetFields(patch);
    for (const [name, value] of stableEntries(fingerprint)) {
      if (changed.attributes.has(name)) continue;
      const expected = value === null || value === undefined ? null : String(value);
      if (node.getAttribute?.(name) !== expected) return false;
    }
    if (!changed.text && !textMatches(nodeText(node), fingerprint.text ?? fingerprint.textContent)) return false;
    return true;
  }

  function recordResolution(documentRef, status, details = {}) {
    // Keep the public resolver return type stable (Element | null), while
    // retaining a tiny diagnostic for the reattach UI to inspect later.
    try {
      documentRef.__tinkrPatchResolution = { status, ...details };
    } catch { /* Some host documents disallow expando properties. */ }
  }

  function boundedSelectorNodes(documentRef, selector) {
    if (!selector || typeof selector !== "string") return { nodes: [], truncated: false };
    try {
      const list = documentRef.querySelectorAll(selector);
      const length = Number(list?.length) || 0;
      return {
        nodes: Array.from(list || []).slice(0, MAX_ANCHOR_CANDIDATES),
        truncated: length > MAX_ANCHOR_CANDIDATES
      };
    } catch {
      return { nodes: [], truncated: false };
    }
  }

  function boundedTagNodes(documentRef, tag) {
    const safeTag = String(tag || "").toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/i.test(safeTag)) return { nodes: [], truncated: false };
    try {
      const list = documentRef.getElementsByTagName
        ? documentRef.getElementsByTagName(safeTag)
        : documentRef.querySelectorAll(safeTag);
      const length = Number(list?.length) || 0;
      const nodes = [];
      for (let index = 0; index < Math.min(length, MAX_ANCHOR_CANDIDATES); index += 1) nodes.push(list[index]);
      return { nodes, truncated: length > MAX_ANCHOR_CANDIDATES };
    } catch {
      return { nodes: [], truncated: false };
    }
  }

  function matchingNodes(nodes, fingerprints, patch) {
    if (!fingerprints.length) return [...new Set(nodes)];
    return [...new Set(nodes.filter(node => fingerprints.some(fingerprint => matchesFingerprint(node, fingerprint, patch))))];
  }

  function resolvePatchTarget(patch, documentRef = document) {
    if (!patch || !documentRef) return null;
    const fingerprints = patchFingerprints(patch);
    const primaryFingerprints = exactFingerprints(patch, fingerprints);
    const selectors = [patch.selector, ...fingerprints.map(fingerprint => fingerprint.selector)]
      .filter((selector, index, all) => typeof selector === "string" && selector && all.indexOf(selector) === index);

    // A selector can be a broad selector in old drafts. Even there, accept it
    // only if it produces exactly one validated candidate. This protects a
    // changed source page from receiving a patch on a lookalike sibling.
    let selectorWasAmbiguous = false;
    for (const selector of selectors) {
      const { nodes, truncated } = boundedSelectorNodes(documentRef, selector);
      const matches = matchingNodes(nodes, primaryFingerprints, patch);
      if (!truncated && matches.length === 1) {
        recordResolution(documentRef, fingerprints.length ? "exact" : "legacy-exact", { selector });
        return matches[0];
      }
      if (matches.length > 1 || (truncated && matches.length)) {
        selectorWasAmbiguous = true;
        recordResolution(documentRef, "ambiguous", { selector, candidates: matches.length, truncated });
      }
    }

    // If the saved selector no longer agrees with the fingerprint, use only a
    // bounded tag search. A fallback must still be a unique full fingerprint
    // match; a best-effort score is intentionally not good enough to edit a
    // third-party page.
    const tags = [...new Set(fingerprints.map(fingerprint => fingerprint.tag || fingerprint.tagName).filter(Boolean))];
    const candidates = [];
    let truncated = false;
    tags.forEach(tag => {
      const result = boundedTagNodes(documentRef, tag);
      candidates.push(...result.nodes);
      truncated = truncated || result.truncated;
    });
    const matches = matchingNodes(candidates, fingerprints, patch);
    if (!truncated && matches.length === 1) {
      recordResolution(documentRef, "fallback", { tag: String(matches[0].tagName || "").toLowerCase() });
      return matches[0];
    }
    if (matches.length > 1 || (truncated && matches.length)) {
      recordResolution(documentRef, "ambiguous", { candidates: matches.length, truncated });
    } else if (selectorWasAmbiguous) {
      recordResolution(documentRef, "ambiguous");
    } else {
      recordResolution(documentRef, "unresolved");
    }
    return null;
  }

  function applyBreakpointStyle(el, breakpoint, styles, documentRef = document) {
    let key = el.getAttribute("data-tinkr-anchor");
    if (!key) {
      const siblings = el.parentElement ? [...el.parentElement.children] : [];
      const selector = el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}-${siblings.indexOf(el)}`;
      let hash = 2166136261;
      for (const char of selector) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      key = `t${(hash >>> 0).toString(36)}`;
      el.setAttribute("data-tinkr-anchor", key);
    }
    const registry = documentRef.__tinkrBreakpointStyles || (documentRef.__tinkrBreakpointStyles = {});
    registry[breakpoint] = registry[breakpoint] || {};
    registry[breakpoint][key] = { ...(registry[breakpoint][key] || {}), ...styles };
    const id = `tinkr-responsive-${breakpoint}`;
    let css = documentRef.querySelector(`style#${CSS.escape(id)}`);
    if (!css) { css = documentRef.createElement("style"); css.id = id; documentRef.head.append(css); }
    const rules = Object.entries(registry[breakpoint]).map(([anchor, values]) => {
      const declarations = Object.entries(values).map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}!important`).join(";");
      return `[data-tinkr-anchor="${anchor}"]{${declarations}}`;
    }).join("");
    css.textContent = `@media(max-width:${breakpoint}px){${rules}}`;
  }

  function replaceTextPreservingMarkup(el, text) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    const nodes = []; let node;
    while ((node = walker.nextNode())) nodes.push(node);
    if (!nodes.length) { el.textContent = text; return; }
    nodes[0].nodeValue = text;
    nodes.slice(1).forEach(item => { item.nodeValue = ""; });
  }

  function isPatchApplied(patch, documentRef = document) {
    if (!patch) return true;
    if (patch.type === "insert_html") return Boolean(findInsertedNode(patch, documentRef));
    // These layer records are materialized by the content script rather than this
    // DOM patch applicator, so replaying them here would be misleading.
    if (["insert_vector", "update_vector", "vector_layers", "update_proxy"].includes(patch.type)) return true;
    if (patch.type === "set_layer_order" && Array.isArray(patch.layers)) {
      return patch.layers.every(layer => {
        const target = resolvePatchTarget(layer, documentRef);
        return Boolean(target) && Object.entries(layer.styles || {}).every(([property, value]) => target.style[property] === String(value));
      });
    }
    const target = resolvePatchTarget(patch, documentRef);
    if (!target) return false;
    if (patch.type === "update_text") return target.textContent === patch.text;
    if (patch.type === "update_html") return target.innerHTML === patch.html;
    if (patch.type === "hide") return target.classList.contains("tinkr-hidden");
    if (patch.type === "set_styles") {
      if (patch.breakpoint && patch.breakpoint !== "base") return true;
      return Object.entries(patch.styles || {}).every(([property, value]) => target.style[property] === String(value));
    }
    if (patch.type === "set_attributes") return Object.entries(patch.attributes || {}).every(([name, value]) => target.getAttribute(name) === String(value));
    if (patch.type === "move_layer") {
      return Object.entries(patch.after?.styles || patch.styles || {}).every(([property, value]) => target.style[property] === String(value));
    }
    if (patch.type === "create_proxy" || patch.type === "hide_source") return target.style.opacity === "0";
    if (patch.type === "reorder" || patch.type === "reorder_dom") {
      const parent = patch.parent && documentRef.querySelector(patch.parent);
      if (!parent || target.parentElement !== parent) return false;
      const before = patch.before && documentRef.querySelector(patch.before);
      return before ? target.nextElementSibling === before : target === parent.lastElementChild;
    }
    return true;
  }

  function applyPatch(patch, documentRef = document) {
    // Vector/proxy state lives in the draft payload and is materialized by the
    // content script. Treat those records as already applied during DOM replay.
    if (["insert_vector", "update_vector", "vector_layers", "update_proxy"].includes(patch.type)) return true;
    const el = resolvePatchTarget(patch, documentRef);
    if (!el && patch.type !== "insert_html" && patch.type !== "insert_vector" && patch.type !== "update_proxy" && patch.type !== "set_layer_order") return false;
    if (patch.type === "set_styles") {
      patch.breakpoint && patch.breakpoint !== "base"
        ? applyBreakpointStyle(el, patch.breakpoint, patch.styles, documentRef)
        : Object.assign(el.style, patch.styles);
    }
    if (patch.type === "set_attributes") Object.entries(patch.attributes || {}).forEach(([name, value]) => el.setAttribute(name, String(value)));
    if (patch.type === "update_text") {
      if (patch.preserveMarkup) replaceTextPreservingMarkup(el, patch.text);
      else el.textContent = patch.text;
    }
    if (patch.type === "update_html") el.innerHTML = patch.html;
    if (patch.type === "hide") el.classList.add("tinkr-hidden");
    if (patch.type === "insert_html") {
      const existing = findInsertedNode(patch, documentRef);
      if (existing) return true;
      const parent = documentRef.querySelector(patch.parent);
      if (!parent) return false;
      const holder = documentRef.createElement("div");
      holder.innerHTML = patch.html;
      const insert = holder.firstElementChild;
      if (!insert) return false;
      const operationId = insertedOperationId(patch);
      if (operationId) {
        insert.setAttribute("data-tinkr-owned", "true");
        insert.setAttribute("data-tinkr-op", operationId);
      }
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
    if (patch.type === "set_layer_order") {
      if (Array.isArray(patch.layers)) {
        let applied = false;
        patch.layers.forEach(layer => {
          const node = resolvePatchTarget(layer, documentRef);
          if (!node) return;
          Object.assign(node.style, layer.styles || {});
          applied = true;
        });
        return applied;
      }
      if (!el) return false;
      Object.assign(el.style, patch.after || {});
    }
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
  Object.assign(window.TinkrCanvas, {
    resolvePatchTarget,
    applyPatch,
    applyDraft,
    applyBreakpointStyle,
    isPatchApplied,
    findInsertedNode,
    removeInsertedNode
  });
})();
