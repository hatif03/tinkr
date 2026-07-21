(() => {
  const toolbarInstances = new WeakMap();
  const COMMAND_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14v14H5z"/><path d="m9 9 2 2-2 2M14 15h3"/></svg>`;
  const SHORTCUT_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M9.7 9a2.4 2.4 0 1 1 4 1.8c-.9.8-1.7 1.2-1.7 2.5"/><path d="M12 16.8h.01"/></svg>`;

  const TC = () => window.TinkrCanvas || {};

  function iconHtml(name) {
    const icons = TC().ICONS || {};
    return icons[name] || icons.shape || "";
  }

  function buildVectorToolbarHtml() {
    const I = TC().ICONS || {};
    const button = (action, icon, label) =>
      `<button type="button" class="tinkr-vector-btn" data-vector-edit="${action}" aria-label="${label}" title="${label}"><span class="tinkr-vector-btn-icon">${icon || ""}</span><span class="tinkr-vector-btn-label">${label}</span></button>`;
    return `<div id="tinkr-vector-toolbar" class="tinkr-vector-toolbar tinkr-interactive tinkr-hide" data-tinkr-interactive="vector-toolbar" role="toolbar" aria-label="Vector edit">
      ${button("move", I.vectorMove, "Move point")}${button("bend", I.vectorBend, "Bend point")}${button("close", I.vectorClose, "Close path")}${button("delete", I.vectorDelete, "Delete point")}
    </div>`;
  }

  function buildShortcutReferenceHtml() {
    const row = (keys, label) => `<li><kbd>${keys}</kbd><span>${label}</span></li>`;
    return `<section id="tinkr-shortcut-reference" class="tinkr-shortcut-reference tinkr-tool-menu tinkr-interactive tinkr-hide" data-tinkr-interactive="shortcut-reference" role="dialog" aria-modal="false" aria-labelledby="tinkr-shortcut-title">
      <header><div><p>tinkr shortcuts</p><h2 id="tinkr-shortcut-title">Work faster on the page</h2></div><button type="button" class="tinkr-overlay-close" data-shortcuts-close aria-label="Close shortcut reference">&times;</button></header>
      <div class="tinkr-shortcut-columns">
        <ul>${row("V", "Select and move")}${row("H / Space", "Hand and pan")}${row("K", "Scale selection")}${row("F / R / O", "Frame, rectangle, ellipse")}${row("T", "Add text")}</ul>
        <ul>${row("P / Shift+P", "Pen / pencil")}${row("C", "Comment")}${row("Shift+D", "Dev Mode")}${row("Ctrl / Cmd + /", "Quick actions")}${row("Esc", "Cancel or clear")}</ul>
      </div>
    </section>`;
  }

  function buildCommandPaletteHtml() {
    return `<section id="tinkr-command-palette" class="tinkr-command-palette tinkr-tool-menu tinkr-interactive tinkr-hide" data-tinkr-interactive="command-palette" role="dialog" aria-modal="false" aria-labelledby="tinkr-command-title">
      <div class="tinkr-command-search"><span aria-hidden="true">${COMMAND_ICON}</span><input id="tinkr-command-search-input" type="text" autocomplete="off" spellcheck="false" placeholder="Search tools and actions" aria-label="Search tinkr actions" aria-controls="tinkr-command-results" /><kbd>Esc</kbd></div>
      <h2 id="tinkr-command-title" class="tinkr-sr-only">tinkr quick actions</h2>
      <div id="tinkr-command-results" class="tinkr-command-results" role="listbox" aria-label="Quick actions"></div>
      <footer><span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span></footer>
    </section>`;
  }

  function buildToolbarHtml() {
    const groups = TC().TOOL_GROUPS || {};
    const I = TC().ICONS || {};
    const menu = (group, items) => items.map((variant) => {
      const icon = iconHtml(variant.icon || variant.id);
      return `<button type="button" class="tinkr-tool-menu-item" role="menuitemradio" aria-checked="false" data-tool-group="${group}" data-tool-variant="${variant.id}">
        <span class="tinkr-tool-menu-leading"><span class="tinkr-tool-check" aria-hidden="true">&#10003;</span><span class="tinkr-tool-menu-icon">${icon}</span><span class="tinkr-tool-menu-label">${variant.label}</span></span>
        <kbd>${variant.shortcut || ""}</kbd></button>`;
    }).join("");
    const tool = (group) => {
      const definition = groups[group];
      if (!definition) return "";
      return `<div class="tinkr-tool-group"><button type="button" class="tinkr-tool-btn ${group === "move" ? "active" : ""}" data-tool-trigger="${group}" aria-label="${definition.label} tools" aria-expanded="false" aria-haspopup="menu" title="${definition.label} tools">${definition.icon || ""}</button><div class="tinkr-tool-menu tinkr-interactive tinkr-hide" data-tinkr-interactive="tool-menu" data-menu="${group}" role="menu">${menu(group, definition.variants || [])}</div></div>`;
    };

    return `${buildVectorToolbarHtml()}<div id="tinkr-toolbar" class="tinkr-toolbar tinkr-interactive" data-tinkr-interactive="toolbar" role="toolbar" aria-label="tinkr canvas tools">${tool("move")}${tool("region")}${tool("shape")}${tool("draw")}${tool("text")}<button type="button" class="tinkr-tool-btn" data-tool-action="resources" aria-label="Resources" title="Resources (Shift+I)">${I.resource || ""}</button><span class="tinkr-tool-sep"></span><button type="button" class="tinkr-tool-btn" data-tool-action="undo" aria-label="Undo" title="Undo (Ctrl+Z)">${I.undo || ""}</button><button type="button" class="tinkr-tool-btn" data-tool-action="redo" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">${I.redo || ""}</button><button type="button" class="tinkr-tool-btn" data-tool-action="delete" aria-label="Delete selection" title="Delete (Del)">${I.trash || ""}</button><span class="tinkr-tool-sep"></span><button type="button" class="tinkr-tool-btn" data-tool-action="hand" aria-label="Hand tool" title="Hand (H)">${I.hand || ""}</button><button type="button" class="tinkr-tool-btn" data-tool-action="comment" aria-label="Add comment" title="Comment (C)">${I.comment || ""}</button><span class="tinkr-tool-sep"></span><button type="button" class="tinkr-tool-btn" data-tool-action="present" aria-label="Present prototype" title="Present preview">${I.present || ""}</button><button type="button" class="tinkr-tool-btn" data-tool-action="timeline" aria-label="Motion timeline" title="Motion timeline">${I.motion || ""}</button><button type="button" class="tinkr-tool-btn tinkr-dev-toggle" data-tool-action="devmode" aria-label="Dev Mode" title="Dev Mode (Shift+D)">${I.devMode || ""}</button><span class="tinkr-tool-sep"></span><button type="button" class="tinkr-tool-btn" data-tool-action="command" aria-label="Quick actions" title="Quick actions (Ctrl or Cmd + /)">${COMMAND_ICON}</button><button type="button" class="tinkr-tool-btn" data-tool-action="shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">${SHORTCUT_ICON}</button></div><div id="tinkr-timeline" class="tinkr-timeline tinkr-interactive tinkr-hide" data-tinkr-interactive="timeline"><div class="tinkr-timeline-bar"><button type="button" data-timeline="play" aria-label="Play motion timeline">${I.play || ""}</button><button type="button" data-timeline="keyframe" aria-label="Add keyframe">&#9670;</button><span class="tinkr-timeline-time">0 ms</span><div class="tinkr-timeline-ruler"></div></div><div id="tinkr-timeline-tracks" class="tinkr-timeline-tracks"></div></div>${buildCommandPaletteHtml()}${buildShortcutReferenceHtml()}<div id="tinkr-dialog-host" class="tinkr-dialog-host"></div><svg id="tinkr-vector-layer" class="tinkr-vector-layer"></svg><div id="tinkr-dev-overlay" class="tinkr-dev-overlay tinkr-hide"></div><div id="tinkr-scale-handles" class="tinkr-scale-handles tinkr-hide"></div>`;
  }

  function isTypingTarget(target) {
    return Boolean(target?.matches?.("input, textarea, select, [contenteditable='true']"));
  }

  function closeMenus(instance) {
    instance.toolbar.querySelectorAll(".tinkr-tool-menu[data-menu]").forEach((menu) => menu.classList.add("tinkr-hide"));
    instance.toolbar.querySelectorAll("[data-tool-trigger]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
  }

  function closeCommandPalette(root) {
    const instance = toolbarInstances.get(root);
    const palette = root?.querySelector?.("#tinkr-command-palette");
    if (!instance || !palette || palette.classList.contains("tinkr-hide")) return false;
    palette.classList.add("tinkr-hide");
    instance.paletteIndex = 0;
    instance.paletteEntries = [];
    instance.lastFocus?.focus?.({ preventScroll: true });
    return true;
  }

  function closeShortcutReference(root) {
    const instance = toolbarInstances.get(root);
    const reference = root?.querySelector?.("#tinkr-shortcut-reference");
    if (!instance || !reference || reference.classList.contains("tinkr-hide")) return false;
    reference.classList.add("tinkr-hide");
    instance.lastFocus?.focus?.({ preventScroll: true });
    return true;
  }

  function commandEntries(instance) {
    const { handlers, root } = instance;
    const entries = [];
    const add = (id, label, shortcut, run, keywords = "") => entries.push({ id, label, shortcut, run, search: `${label} ${shortcut} ${keywords}`.toLowerCase() });
    const groups = TC().TOOL_GROUPS || {};
    Object.entries(groups).forEach(([group, definition]) => {
      (definition.variants || []).forEach((variant) => {
        add(`tool:${group}:${variant.id}`, variant.label, variant.shortcut || "", () => handlers.setTool?.(group, variant.id), `${definition.label} tool`);
      });
    });
    add("resources", "Open resources", "Shift+I", () => handlers.openResources?.(), "assets components variables");
    add("undo", "Undo", "Ctrl+Z", () => handlers.undo?.(), "history");
    add("redo", "Redo", "Ctrl+Shift+Z", () => handlers.redo?.(), "history");
    add("delete", "Delete selection", "Del", () => handlers.deleteSelected?.(), "remove layer");
    add("comment", "Add comment", "C", () => handlers.setTool?.("comment", "pin"), "feedback");
    add("present", "Present prototype", "", () => handlers.enterPresent?.(), "preview prototype");
    add("timeline", "Toggle motion timeline", "", () => handlers.toggleTimeline?.(), "animation keyframe");
    add("devmode", "Toggle Dev Mode", "Shift+D", () => handlers.toggleDevMode?.(), "inspect css source");
    if (typeof handlers.openAI === "function") add("ai", "Remix selection with AI", "", () => handlers.openAI(), "generate rewrite component");
    add("shortcuts", "Show keyboard shortcuts", "?", () => {
      if (typeof handlers.openShortcutReference === "function") handlers.openShortcutReference();
      else openShortcutReference(root);
    }, "help");
    return entries;
  }

  function renderCommandPalette(instance, query = "") {
    const root = instance.root;
    const results = root.querySelector("#tinkr-command-results");
    if (!results) return;
    const normalizedQuery = query.trim().toLowerCase();
    instance.paletteEntries = commandEntries(instance).filter((entry) => !normalizedQuery || entry.search.includes(normalizedQuery));
    instance.paletteIndex = Math.min(Math.max(instance.paletteIndex || 0, 0), Math.max(0, instance.paletteEntries.length - 1));
    results.replaceChildren();
    if (!instance.paletteEntries.length) {
      const empty = document.createElement("p");
      empty.className = "tinkr-command-empty";
      empty.textContent = "No matching actions";
      results.append(empty);
      return;
    }
    instance.paletteEntries.forEach((entry, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tinkr-command-item";
      button.dataset.commandId = entry.id;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === instance.paletteIndex));
      const name = document.createElement("span");
      name.textContent = entry.label;
      button.append(name);
      if (entry.shortcut) {
        const shortcut = document.createElement("kbd");
        shortcut.textContent = entry.shortcut;
        button.append(shortcut);
      }
      button.addEventListener("pointermove", () => {
        instance.paletteIndex = index;
        renderCommandPalette(instance, root.querySelector("#tinkr-command-search-input")?.value || "");
      });
      button.addEventListener("click", () => runCommand(instance, index));
      results.append(button);
    });
  }

  function runCommand(instance, index = instance.paletteIndex) {
    const entry = instance.paletteEntries[index];
    if (!entry) return;
    closeCommandPalette(instance.root);
    try { entry.run?.(); } catch (error) { console.warn("tinkr command failed", error); }
  }

  function openCommandPalette(root, options = {}) {
    const instance = toolbarInstances.get(root);
    const palette = root?.querySelector?.("#tinkr-command-palette");
    if (!instance || !palette) return null;
    closeMenus(instance);
    closeShortcutReference(root);
    instance.lastFocus = document.activeElement;
    instance.paletteIndex = 0;
    palette.classList.remove("tinkr-hide");
    const input = palette.querySelector("#tinkr-command-search-input");
    if (input) {
      input.value = options.query || "";
      renderCommandPalette(instance, input.value);
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }
    return palette;
  }

  function openShortcutReference(root) {
    const instance = toolbarInstances.get(root);
    const reference = root?.querySelector?.("#tinkr-shortcut-reference");
    if (!instance || !reference) return null;
    closeMenus(instance);
    closeCommandPalette(root);
    instance.lastFocus = document.activeElement;
    reference.classList.remove("tinkr-hide");
    requestAnimationFrame(() => reference.querySelector("[data-shortcuts-close]")?.focus({ preventScroll: true }));
    return reference;
  }

  function closeDialog(root, reason = "cancel", options = {}) {
    const instance = toolbarInstances.get(root);
    const dialog = instance?.dialog;
    if (!dialog) return false;
    instance.dialog = null;
    dialog.backdrop.remove();
    if (!options.silent && reason !== "confirm") dialog.options.onCancel?.(reason);
    dialog.lastFocus?.focus?.({ preventScroll: true });
    return true;
  }

  function openDialog(root, options = {}) {
    const instance = toolbarInstances.get(root);
    const host = root?.querySelector?.("#tinkr-dialog-host");
    if (!instance || !host) return null;
    closeDialog(root, "replace", { silent: true });
    closeMenus(instance);
    closeCommandPalette(root);
    closeShortcutReference(root);

    const title = options.title || "tinkr";
    const confirmLabel = options.confirmLabel || "Save";
    const backdrop = document.createElement("div");
    backdrop.className = "tinkr-dialog-backdrop tinkr-tool-menu tinkr-interactive";
    backdrop.dataset.tinkrInteractive = "dialog";
    const dialog = document.createElement("form");
    dialog.className = "tinkr-dialog tinkr-interactive";
    dialog.dataset.tinkrInteractive = "dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const titleId = `tinkr-dialog-title-${Date.now()}`;
    dialog.setAttribute("aria-labelledby", titleId);

    const header = document.createElement("header");
    const heading = document.createElement("h2");
    heading.id = titleId;
    heading.textContent = title;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tinkr-overlay-close";
    close.setAttribute("aria-label", "Close dialog");
    close.innerHTML = "&times;";
    header.append(heading, close);
    dialog.append(header);

    if (options.description) {
      const description = document.createElement("p");
      description.className = "tinkr-dialog-description";
      description.textContent = options.description;
      dialog.append(description);
    }

    const fieldId = `tinkr-dialog-field-${Date.now()}`;
    if (options.label) {
      const label = document.createElement("label");
      label.htmlFor = fieldId;
      label.textContent = options.label;
      dialog.append(label);
    }
    const field = options.multiline ? document.createElement("textarea") : document.createElement("input");
    field.id = fieldId;
    field.className = "tinkr-dialog-field";
    if (field instanceof HTMLInputElement) field.type = options.type || "text";
    field.value = options.value || "";
    field.placeholder = options.placeholder || "";
    field.required = options.allowEmpty !== true;
    field.autocomplete = "off";
    dialog.append(field);

    const error = document.createElement("p");
    error.className = "tinkr-dialog-error tinkr-hide";
    error.setAttribute("role", "alert");
    dialog.append(error);

    const actions = document.createElement("footer");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "tinkr-button tinkr-button-secondary";
    cancel.textContent = options.cancelLabel || "Cancel";
    const confirm = document.createElement("button");
    confirm.type = "submit";
    confirm.className = "tinkr-button tinkr-button-primary";
    confirm.textContent = confirmLabel;
    actions.append(cancel, confirm);
    dialog.append(actions);
    backdrop.append(dialog);
    host.append(backdrop);

    const controller = {
      element: dialog,
      field,
      close: (reason = "cancel") => closeDialog(root, reason)
    };
    const dialogState = { backdrop, options, lastFocus: document.activeElement, controller };
    instance.dialog = dialogState;

    const cancelDialog = () => controller.close("cancel");
    close.addEventListener("click", cancelDialog);
    cancel.addEventListener("click", cancelDialog);
    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) cancelDialog();
    });
    dialog.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = field.value;
      if (field.required && !value.trim()) {
        error.textContent = "Enter a value to continue.";
        error.classList.remove("tinkr-hide");
        field.focus();
        return;
      }
      confirm.disabled = true;
      error.classList.add("tinkr-hide");
      try {
        const result = await options.onConfirm?.(value, controller);
        if (result !== false) controller.close("confirm");
      } catch (err) {
        error.textContent = err?.message || "Could not save this change.";
        error.classList.remove("tinkr-hide");
      } finally {
        if (instance.dialog === dialogState) confirm.disabled = false;
      }
    });
    requestAnimationFrame(() => field.focus({ preventScroll: true }));
    return controller;
  }

  function mountToolbar(root, handlers = {}) {
    root.insertAdjacentHTML("beforeend", buildToolbarHtml());
    const toolbar = root.querySelector("#tinkr-toolbar");
    const vectorBar = root.querySelector("#tinkr-vector-toolbar");
    if (!toolbar) return null;
    const instance = { root, toolbar, vectorBar, handlers, paletteEntries: [], paletteIndex: 0, dialog: null, lastFocus: null };
    instance.requestCommandPalette = () => {
      if (typeof handlers.openCommandPalette === "function") handlers.openCommandPalette();
      else openCommandPalette(root);
    };
    instance.requestShortcutReference = () => {
      if (typeof handlers.openShortcutReference === "function") handlers.openShortcutReference();
      else openShortcutReference(root);
    };
    toolbarInstances.set(root, instance);

    const onDocPointer = (event) => {
      if (event.target?.closest?.(".tinkr-interactive, .tinkr-scale-handle")) return;
      closeMenus(instance);
    };
    const onKeyDown = (event) => {
      const palette = root.querySelector("#tinkr-command-palette");
      const shortcuts = root.querySelector("#tinkr-shortcut-reference");
      if (event.key === "Escape") {
        const handled = closeDialog(root) || closeCommandPalette(root) || closeShortcutReference(root) || Boolean(toolbar.querySelector(".tinkr-tool-menu[data-menu]:not(.tinkr-hide)"));
        if (handled) {
          closeMenus(instance);
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (instance.dialog || !palette?.classList.contains("tinkr-hide") || !shortcuts?.classList.contains("tinkr-hide")) return;
      if ((event.ctrlKey || event.metaKey) && event.key === "/") {
        event.preventDefault();
        event.stopImmediatePropagation();
        instance.requestCommandPalette();
        return;
      }
      if (!isTypingTarget(event.target) && event.key === "?") {
        event.preventDefault();
        event.stopImmediatePropagation();
        instance.requestShortcutReference();
      }
    };

    toolbar.querySelectorAll("[data-tool-trigger]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = toolbar.querySelector(`[data-menu="${button.dataset.toolTrigger}"]`);
      const open = menu?.classList.contains("tinkr-hide");
      closeMenus(instance);
      if (open && menu) {
        menu.classList.remove("tinkr-hide");
        button.setAttribute("aria-expanded", "true");
        menu.querySelector("button")?.focus({ preventScroll: true });
      }
    }));
    toolbar.querySelectorAll("[data-tool-group]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.setTool?.(button.dataset.toolGroup, button.dataset.toolVariant);
      closeMenus(instance);
    }));
    const action = (name, callback) => toolbar.querySelector(`[data-tool-action='${name}']`)?.addEventListener("click", callback);
    action("hand", () => handlers.setTool?.("move", "hand"));
    action("undo", () => handlers.undo?.());
    action("redo", () => handlers.redo?.());
    action("delete", () => handlers.deleteSelected?.());
    action("comment", () => handlers.setTool?.("comment", "pin"));
    action("devmode", () => handlers.toggleDevMode?.());
    action("timeline", () => { handlers.toggleTimeline?.(); closeMenus(instance); });
    action("present", () => handlers.enterPresent?.());
    action("resources", () => handlers.openResources?.());
    action("command", () => instance.requestCommandPalette());
    action("shortcuts", () => instance.requestShortcutReference());
    vectorBar?.querySelectorAll("[data-vector-edit]").forEach((button) => button.addEventListener("click", () => handlers.vectorEdit?.(button.dataset.vectorEdit)));
    root.querySelector("[data-shortcuts-close]")?.addEventListener("click", () => closeShortcutReference(root));

    const input = root.querySelector("#tinkr-command-search-input");
    input?.addEventListener("input", () => {
      instance.paletteIndex = 0;
      renderCommandPalette(instance, input.value);
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const count = instance.paletteEntries.length;
        if (count) {
          instance.paletteIndex = (instance.paletteIndex + delta + count) % count;
          renderCommandPalette(instance, input.value);
        }
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        runCommand(instance);
      }
    });

    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKeyDown, true);
    return {
      toolbar,
      closeMenus: () => closeMenus(instance),
      openCommandPalette: (options) => openCommandPalette(root, options),
      openShortcutReference: () => openShortcutReference(root),
      cleanup: () => {
        document.removeEventListener("pointerdown", onDocPointer, true);
        document.removeEventListener("keydown", onKeyDown, true);
        closeDialog(root, "cleanup", { silent: true });
        toolbarInstances.delete(root);
      }
    };
  }

  function syncToolbar(root, tool = {}) {
    const toolbar = root?.querySelector?.("#tinkr-toolbar");
    if (!toolbar) return;
    const groups = TC().TOOL_GROUPS || {};
    toolbar.querySelectorAll("[data-tool-trigger]").forEach((button) => {
      const group = button.dataset.toolTrigger;
      const active = tool.group === group && !tool.devMode && !tool.protoMode;
      button.classList.toggle("active", active);
      if (active) {
        const iconName = TC().variantIcon?.(group, tool.variant) || group;
        button.innerHTML = iconHtml(iconName);
        const activeLabel = groups[group]?.variants?.find((variant) => variant.id === tool.variant)?.label || groups[group]?.label || group;
        button.setAttribute("aria-label", `${groups[group]?.label || group} tools. Active: ${activeLabel}`);
        button.title = activeLabel;
      } else {
        button.innerHTML = groups[group]?.icon || "";
        button.setAttribute("aria-label", `${groups[group]?.label || group} tools`);
        button.title = `${groups[group]?.label || group} tools`;
      }
    });
    toolbar.querySelectorAll(".tinkr-tool-menu[data-menu]").forEach((menu) => {
      const group = menu.dataset.menu;
      menu.querySelectorAll("[data-tool-variant]").forEach((item) => {
        const active = tool.group === group && tool.variant === item.dataset.toolVariant && !tool.devMode && !tool.protoMode;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-checked", String(active));
      });
    });
    toolbar.querySelector(".tinkr-dev-toggle")?.classList.toggle("active", Boolean(tool.devMode));
    toolbar.querySelector("[data-tool-action='hand']")?.classList.toggle("active", tool.group === "move" && tool.variant === "hand");
    toolbar.querySelector("[data-tool-action='comment']")?.classList.toggle("active", tool.group === "comment");
    toolbar.querySelector("[data-tool-action='timeline']")?.classList.toggle("active", Boolean(tool.timelineOpen));
  }

  function syncVectorToolbar(root, selectedVectorId, editMode) {
    const bar = root?.querySelector?.("#tinkr-vector-toolbar");
    if (!bar) return;
    bar.classList.toggle("tinkr-hide", !selectedVectorId);
    bar.querySelectorAll("[data-vector-edit]").forEach((button) => {
      const active = button.dataset.vectorEdit === editMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  window.TinkrToolbar = {
    mountToolbar,
    syncToolbar,
    syncVectorToolbar,
    buildToolbarHtml,
    openCommandPalette,
    closeCommandPalette,
    openShortcutReference,
    closeShortcutReference,
    openDialog,
    closeDialog
  };
})();
