(() => {
  const { ICONS } = window.TinkrCanvas;
  const v = (id, label, shortcut, icon) => ({ id, label, shortcut, icon });
  const TOOL_GROUPS = {
    move: { label: "Move", icon: ICONS.move, variants: [v("select", "Move", "V", "move"), v("hand", "Hand tool", "H", "hand"), v("scale", "Scale", "K", "scale")] },
    region: { label: "Region", icon: ICONS.frame, variants: [v("frame", "Frame", "F", "frame"), v("section", "Section", "Shift+S", "section"), v("slice", "Slice", "S", "slice")] },
    shape: { label: "Shape", icon: ICONS.shape, variants: [v("rect", "Rectangle", "R", "shape"), v("line", "Line", "L", "line"), v("arrow", "Arrow", "Shift+L", "arrow"), v("ellipse", "Ellipse", "O", "ellipse"), v("polygon", "Polygon", "", "polygon"), v("star", "Star", "", "star"), v("image", "Image / video", "Ctrl+Shift+K", "image")] },
    draw: { label: "Draw", icon: ICONS.pen, variants: [v("pen", "Pen", "P", "pen"), v("pencil", "Pencil", "Shift+P", "pencil"), v("eyedropper", "Eyedropper", "I", "eyedropper")] },
    text: { label: "Text", icon: ICONS.text, variants: [v("text", "Text", "T", "text"), v("textPath", "Text on path", "", "textPath")] }
  };
  const TOOL_LABELS = {
    "move:select": "Move · select and drag layers", "move:hand": "Hand · pan the canvas", "move:scale": "Scale · resize selected layer",
    "region:frame": "Frame · insert wireframe", "region:section": "Section · label a region", "region:slice": "Slice · export region",
    "shape:rect": "Rectangle · draw shape", "shape:line": "Line · draw line", "shape:arrow": "Arrow · draw arrow",
    "shape:ellipse": "Ellipse · draw ellipse", "shape:polygon": "Polygon · draw polygon", "shape:star": "Star · draw star", "shape:image": "Image · insert media",
    "draw:pen": "Pen · place vector anchors", "draw:pencil": "Pencil · draw freehand path", "draw:eyedropper": "Eyedropper · sample any screen color",
    "text:text": "Text · add text box", "text:textPath": "Text on path · attach to vector", "comment:pin": "Comment · pin feedback"
  };
  const CURSOR_BY_TOOL = {
    "move:select": "move", "move:hand": "hand", "move:scale": "scale",
    "draw:pen": "pen", "draw:pencil": "pencil", "draw:eyedropper": "eyedropper",
    "text:text": "text", "text:textPath": "text", "comment:pin": "comment",
    "shape:rect": "crosshair", "shape:line": "crosshair", "shape:arrow": "crosshair",
    "shape:ellipse": "crosshair", "shape:polygon": "crosshair", "shape:star": "crosshair", "shape:image": "crosshair",
    "region:frame": "crosshair", "region:section": "crosshair", "region:slice": "crosshair"
  };
  const SHORTCUTS = { c: { group: "comment", variant: "pin" }, i: { group: "draw", variant: "eyedropper" } };
  // Shift modifiers handled in content.js: D dev, I resources, P pencil, S section, L arrow
  Object.entries(TOOL_GROUPS).forEach(([group, g]) => g.variants.forEach(item => { if (item.shortcut) SHORTCUTS[item.shortcut.toLowerCase()] = { group, variant: item.id }; }));
  function variantIcon(group, variant) {
    const item = TOOL_GROUPS[group]?.variants.find(x => x.id === variant);
    return item?.icon || group;
  }
  window.TinkrCanvas = window.TinkrCanvas || {};
  Object.assign(window.TinkrCanvas, { TOOL_GROUPS, SHORTCUTS, TOOL_LABELS, CURSOR_BY_TOOL, variantIcon });
})();
