(() => {
  function createDefaultTool() {
    return { group: "move", variant: "select", devMode: false, protoMode: false };
  }

  function shouldSelectElements(tool) {
    return !tool.devMode && tool.group === "move" && tool.variant === "select";
  }

  function shouldPan(tool) {
    // Hand tool; Space-hold pan is handled via content.js spaceHand override.
    return tool.group === "move" && tool.variant === "hand";
  }

  function shouldScale(tool) {
    return tool.group === "move" && tool.variant === "scale";
  }

  function isCreationTool(tool) {
    return ["region", "shape", "draw", "text"].includes(tool.group);
  }

  function isCommentTool(tool) {
    return tool.group === "comment";
  }

  function setTool(tool, group, variant) {
    tool.group = group;
    tool.variant = variant;
    return tool;
  }

  function setDevMode(tool, on) {
    tool.devMode = Boolean(on);
    if (on) tool.protoMode = false;
    return tool;
  }

  function setProtoMode(tool, on) {
    tool.protoMode = Boolean(on);
    if (on) tool.devMode = false;
    return tool;
  }

  window.TinkrCanvas = window.TinkrCanvas || {};
  Object.assign(window.TinkrCanvas, {
    createDefaultTool, shouldSelectElements, shouldPan, shouldScale, isCreationTool, isCommentTool, setTool, setDevMode, setProtoMode
  });
})();
