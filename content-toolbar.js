(() => {
  const TC = () => window.TinkrCanvas;

  function buildVectorToolbarHtml() {
    const I = TC().ICONS;
    return `<div id="tinkr-vector-toolbar" class="tinkr-vector-toolbar tinkr-hide" role="toolbar" aria-label="Vector edit">
      <button type="button" class="tinkr-tool-btn" data-vector-edit="move" title="Move point">${I.vectorMove}</button>
      <button type="button" class="tinkr-tool-btn" data-vector-edit="bend" title="Bend handle">${I.vectorBend}</button>
      <button type="button" class="tinkr-tool-btn" data-vector-edit="close" title="Close path">${I.vectorClose}</button>
      <button type="button" class="tinkr-tool-btn" data-vector-edit="delete" title="Delete point">${I.vectorDelete}</button>
    </div>`;
  }

  function buildToolbarHtml() {
    const groups = TC().TOOL_GROUPS, { move, region, shape, draw, text } = groups;
    const I = TC().ICONS;
    const menu = (group, items) => items.map(v => `<button type="button" class="tinkr-tool-menu-item" data-tool-group="${group}" data-tool-variant="${v.id}"><span>${v.label}</span><kbd>${v.shortcut || ""}</kbd></button>`).join("");
    const tool = (group) => `<div class="tinkr-tool-group"><button type="button" class="tinkr-tool-btn ${group === "move" ? "active" : ""}" data-tool-trigger="${group}" aria-label="${groups[group].label} tools" title="${groups[group].label}">${groups[group].icon}</button><div class="tinkr-tool-menu tinkr-hide" data-menu="${group}">${menu(group, groups[group].variants)}</div></div>`;
    return `${buildVectorToolbarHtml()}<div id="tinkr-toolbar" class="tinkr-toolbar" role="toolbar" aria-label="Tinkr canvas tools">${tool("move")}${tool("region")}${tool("shape")}${tool("draw")}${tool("text")}<button type="button" class="tinkr-tool-btn" data-tool-action="resources" aria-label="Resources" title="Resources (◆)">${I.resource}</button><span class="tinkr-tool-sep"></span><button type="button" class="tinkr-tool-btn" data-tool-action="hand" aria-label="Hand tool" title="Hand (H)">${I.hand}</button><button type="button" class="tinkr-tool-btn" data-tool-action="comment" aria-label="Add comment" title="Comment (C)">${I.comment}</button><span class="tinkr-tool-sep"></span><button type="button" class="tinkr-tool-btn" data-tool-action="present" aria-label="Present prototype" title="Present · preview in browser">${I.present}</button><button type="button" class="tinkr-tool-btn" data-tool-action="timeline" aria-label="Motion timeline" title="Motion · keyframe timeline">${I.motion}</button><button type="button" class="tinkr-tool-btn tinkr-dev-toggle" data-tool-action="devmode" aria-label="Dev Mode" title="Dev Mode · inspect values">${I.devMode}</button></div><div id="tinkr-timeline" class="tinkr-timeline tinkr-hide"><div class="tinkr-timeline-bar"><button type="button" data-timeline="play">${I.play}</button><button type="button" data-timeline="keyframe">◆</button><span class="tinkr-timeline-time">0 ms</span><div class="tinkr-timeline-ruler"></div></div><div id="tinkr-timeline-tracks" class="tinkr-timeline-tracks"></div></div><svg id="tinkr-vector-layer" class="tinkr-vector-layer"></svg><div id="tinkr-dev-overlay" class="tinkr-dev-overlay tinkr-hide"></div><div id="tinkr-scale-handles" class="tinkr-scale-handles tinkr-hide"></div>`;
  }

  function mountToolbar(root, handlers) {
    root.insertAdjacentHTML("beforeend", buildToolbarHtml());
    const toolbar = root.querySelector("#tinkr-toolbar");
    const vectorBar = root.querySelector("#tinkr-vector-toolbar");
    const closeMenus = () => toolbar.querySelectorAll(".tinkr-tool-menu").forEach(m => m.classList.add("tinkr-hide"));
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
    toolbar.querySelector("[data-tool-action='comment']")?.addEventListener("click", () => handlers.setTool("comment", "pin"));
    toolbar.querySelector("[data-tool-action='devmode']")?.addEventListener("click", () => handlers.toggleDevMode());
    toolbar.querySelector("[data-tool-action='timeline']")?.addEventListener("click", () => handlers.toggleTimeline());
    toolbar.querySelector("[data-tool-action='present']")?.addEventListener("click", () => handlers.enterPresent());
    toolbar.querySelector("[data-tool-action='resources']")?.addEventListener("click", () => handlers.openResources());
    vectorBar?.querySelectorAll("[data-vector-edit]").forEach(btn => btn.addEventListener("click", () => handlers.vectorEdit?.(btn.dataset.vectorEdit)));
    document.addEventListener("click", closeMenus);
    return toolbar;
  }

  function syncToolbar(root, tool) {
    const toolbar = root?.querySelector("#tinkr-toolbar");
    if (!toolbar) return;
    toolbar.querySelectorAll("[data-tool-trigger]").forEach(btn => btn.classList.toggle("active", btn.dataset.toolTrigger === tool.group && !tool.devMode));
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
