(() => {
  const TC = () => window.TinkrCanvas;

  function iconHtml(name) {
    return TC().ICONS[name] || TC().ICONS.shape || "";
  }

  function buildVectorToolbarHtml() {
    const I = TC().ICONS;
    const btn = (action, icon, label) =>
      `<button type="button" class="tinkr-vector-btn" data-vector-edit="${action}" title="${label}"><span class="tinkr-vector-btn-icon">${icon}</span><span class="tinkr-vector-btn-label">${label}</span></button>`;
    return `<div id="tinkr-vector-toolbar" class="tinkr-vector-toolbar tinkr-hide" role="toolbar" aria-label="Vector edit">
      ${btn("move", I.vectorMove, "Move")}${btn("bend", I.vectorBend, "Bend")}${btn("close", I.vectorClose, "Close")}${btn("delete", I.vectorDelete, "Delete")}
    </div>`;
  }

  function buildToolbarHtml() {
    const groups = TC().TOOL_GROUPS;
    const I = TC().ICONS;
    const menu = (group, items) => items.map(v => {
      const icon = iconHtml(v.icon || v.id);
      return `<button type="button" class="tinkr-tool-menu-item" data-tool-group="${group}" data-tool-variant="${v.id}">
        <span class="tinkr-tool-menu-leading"><span class="tinkr-tool-check" aria-hidden="true">✓</span><span class="tinkr-tool-menu-icon">${icon}</span><span class="tinkr-tool-menu-label">${v.label}</span></span>
        <kbd>${v.shortcut || ""}</kbd></button>`;
    }).join("");
    const tool = (group) => `<div class="tinkr-tool-group"><button type="button" class="tinkr-tool-btn ${group === "move" ? "active" : ""}" data-tool-trigger="${group}" aria-label="${groups[group].label} tools" title="${groups[group].label}">${groups[group].icon}</button><div class="tinkr-tool-menu tinkr-hide" data-menu="${group}">${menu(group, groups[group].variants)}</div></div>`;
    return `${buildVectorToolbarHtml()}<div id="tinkr-toolbar" class="tinkr-toolbar" role="toolbar" aria-label="Tinkr canvas tools">${tool("move")}${tool("region")}${tool("shape")}${tool("draw")}${tool("text")}<button type="button" class="tinkr-tool-btn" data-tool-action="resources" aria-label="Resources" title="Resources (Shift+I)">${I.resource}</button><span class="tinkr-tool-sep"></span><button type="button" class="tinkr-tool-btn" data-tool-action="undo" aria-label="Undo" title="Undo (Ctrl+Z)">${I.undo}</button><button type="button" class="tinkr-tool-btn" data-tool-action="redo" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">${I.redo}</button><button type="button" class="tinkr-tool-btn" data-tool-action="delete" aria-label="Delete selection" title="Delete (Del)">${I.trash}</button><span class="tinkr-tool-sep"></span><button type="button" class="tinkr-tool-btn" data-tool-action="hand" aria-label="Hand tool" title="Hand (H)">${I.hand}</button><button type="button" class="tinkr-tool-btn" data-tool-action="comment" aria-label="Add comment" title="Comment (C)">${I.comment}</button><span class="tinkr-tool-sep"></span><button type="button" class="tinkr-tool-btn" data-tool-action="present" aria-label="Present prototype" title="Present · preview in browser">${I.present}</button><button type="button" class="tinkr-tool-btn" data-tool-action="timeline" aria-label="Motion timeline" title="Motion · keyframe timeline">${I.motion}</button><button type="button" class="tinkr-tool-btn tinkr-dev-toggle" data-tool-action="devmode" aria-label="Dev Mode" title="Dev Mode (Shift+D)">${I.devMode}</button></div><div id="tinkr-timeline" class="tinkr-timeline tinkr-hide"><div class="tinkr-timeline-bar"><button type="button" data-timeline="play">${I.play}</button><button type="button" data-timeline="keyframe">◆</button><span class="tinkr-timeline-time">0 ms</span><div class="tinkr-timeline-ruler"></div></div><div id="tinkr-timeline-tracks" class="tinkr-timeline-tracks"></div></div><svg id="tinkr-vector-layer" class="tinkr-vector-layer"></svg><div id="tinkr-dev-overlay" class="tinkr-dev-overlay tinkr-hide"></div><div id="tinkr-scale-handles" class="tinkr-scale-handles tinkr-hide"></div>`;
  }

  function mountToolbar(root, handlers) {
    root.insertAdjacentHTML("beforeend", buildToolbarHtml());
    const toolbar = root.querySelector("#tinkr-toolbar");
    const vectorBar = root.querySelector("#tinkr-vector-toolbar");
    const closeMenus = () => toolbar.querySelectorAll(".tinkr-tool-menu").forEach(m => m.classList.add("tinkr-hide"));
    const onDocClick = () => closeMenus();
    toolbar.querySelectorAll("[data-tool-trigger]").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation();
      const menu = toolbar.querySelector(`[data-menu="${btn.dataset.toolTrigger}"]`);
      const open = menu.classList.contains("tinkr-hide");
      closeMenus();
      if (open) menu.classList.remove("tinkr-hide");
    }));
    toolbar.querySelectorAll("[data-tool-group]").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation();
      handlers.setTool(btn.dataset.toolGroup, btn.dataset.toolVariant);
      closeMenus();
    }));
    toolbar.querySelector("[data-tool-action='hand']")?.addEventListener("click", () => handlers.setTool("move", "hand"));
    toolbar.querySelector("[data-tool-action='undo']")?.addEventListener("click", () => handlers.undo?.());
    toolbar.querySelector("[data-tool-action='redo']")?.addEventListener("click", () => handlers.redo?.());
    toolbar.querySelector("[data-tool-action='delete']")?.addEventListener("click", () => handlers.deleteSelected?.());
    toolbar.querySelector("[data-tool-action='comment']")?.addEventListener("click", () => handlers.setTool("comment", "pin"));
    toolbar.querySelector("[data-tool-action='devmode']")?.addEventListener("click", () => handlers.toggleDevMode());
    toolbar.querySelector("[data-tool-action='timeline']")?.addEventListener("click", () => handlers.toggleTimeline());
    toolbar.querySelector("[data-tool-action='present']")?.addEventListener("click", () => handlers.enterPresent());
    toolbar.querySelector("[data-tool-action='resources']")?.addEventListener("click", () => handlers.openResources());
    vectorBar?.querySelectorAll("[data-vector-edit]").forEach(btn => btn.addEventListener("click", () => handlers.vectorEdit?.(btn.dataset.vectorEdit)));
    document.addEventListener("click", onDocClick);
    return { toolbar, cleanup: () => document.removeEventListener("click", onDocClick) };
  }

  function syncToolbar(root, tool) {
    const toolbar = root?.querySelector("#tinkr-toolbar");
    if (!toolbar) return;
    const groups = TC().TOOL_GROUPS;
    toolbar.querySelectorAll("[data-tool-trigger]").forEach(btn => {
      const group = btn.dataset.toolTrigger;
      const isActiveGroup = tool.group === group && !tool.devMode;
      btn.classList.toggle("active", isActiveGroup);
      if (isActiveGroup) {
        const iconName = TC().variantIcon?.(group, tool.variant) || group;
        btn.innerHTML = iconHtml(iconName);
      } else {
        btn.innerHTML = groups[group]?.icon || "";
      }
    });
    toolbar.querySelectorAll(".tinkr-tool-menu").forEach(menu => {
      const group = menu.dataset.menu;
      menu.querySelectorAll("[data-tool-variant]").forEach(item => {
        item.classList.toggle("is-active", tool.group === group && tool.variant === item.dataset.toolVariant && !tool.devMode);
      });
    });
    toolbar.querySelector(".tinkr-dev-toggle")?.classList.toggle("active", tool.devMode);
    toolbar.querySelector("[data-tool-action='hand']")?.classList.toggle("active", tool.group === "move" && tool.variant === "hand");
    toolbar.querySelector("[data-tool-action='comment']")?.classList.toggle("active", tool.group === "comment");
    toolbar.querySelector("[data-tool-action='timeline']")?.classList.toggle("active", tool.timelineOpen);
  }

  function syncVectorToolbar(root, selectedVectorId, editMode) {
    const bar = root?.querySelector("#tinkr-vector-toolbar");
    if (!bar) return;
    bar.classList.toggle("tinkr-hide", !selectedVectorId);
    bar.querySelectorAll("[data-vector-edit]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.vectorEdit === editMode);
    });
  }

  window.TinkrToolbar = { mountToolbar, syncToolbar, syncVectorToolbar, buildToolbarHtml };
})();
