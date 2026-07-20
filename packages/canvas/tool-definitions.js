(() => {
  const { ICONS } = window.TinkrCanvas;
  const TOOL_GROUPS = {
    move: { label: "Move", icon: ICONS.move, variants: [{ id: "select", label: "Move", shortcut: "V" }, { id: "hand", label: "Hand tool", shortcut: "H" }, { id: "scale", label: "Scale", shortcut: "K" }] },
    region: { label: "Region", icon: ICONS.frame, variants: [{ id: "frame", label: "Frame", shortcut: "F" }, { id: "section", label: "Section", shortcut: "Shift+S" }, { id: "slice", label: "Slice", shortcut: "S" }] },
    shape: { label: "Shape", icon: ICONS.shape, variants: [{ id: "rect", label: "Rectangle", shortcut: "R" }, { id: "line", label: "Line", shortcut: "L" }, { id: "arrow", label: "Arrow", shortcut: "Shift+L" }, { id: "ellipse", label: "Ellipse", shortcut: "O" }, { id: "polygon", label: "Polygon", shortcut: "" }, { id: "star", label: "Star", shortcut: "" }, { id: "image", label: "Image / video", shortcut: "Ctrl+Shift+K" }] },
    draw: { label: "Draw", icon: ICONS.pen, variants: [{ id: "pen", label: "Pen", shortcut: "P" }, { id: "pencil", label: "Pencil", shortcut: "Shift+P" }, { id: "eyedropper", label: "Eyedropper", shortcut: "I" }] },
    text: { label: "Text", icon: ICONS.text, variants: [{ id: "text", label: "Text", shortcut: "T" }, { id: "textPath", label: "Text on path", shortcut: "" }] }
  };
  const TOOL_LABELS = {
    "move:select": "Move · select and drag layers",
    "move:hand": "Hand · pan the canvas",
    "move:scale": "Scale · resize selected layer",
    "region:frame": "Frame · insert wireframe",
    "region:section": "Section · label a region",
    "region:slice": "Slice · export region",
    "shape:rect": "Rectangle · draw shape",
    "shape:line": "Line · draw line",
    "shape:arrow": "Arrow · draw arrow",
    "shape:ellipse": "Ellipse · draw ellipse",
    "shape:polygon": "Polygon · draw polygon",
    "shape:star": "Star · draw star",
    "shape:image": "Image · insert media",
    "draw:pen": "Pen · place vector anchors",
    "draw:pencil": "Pencil · draw freehand path",
    "draw:eyedropper": "Eyedropper · sample color",
    "text:text": "Text · add text box",
    "text:textPath": "Text on path · attach to vector",
    "comment:pin": "Comment · pin feedback"
  };
  const SHORTCUTS = { c: { group: "comment", variant: "pin" }, i: { group: "draw", variant: "eyedropper" } };
  Object.entries(TOOL_GROUPS).forEach(([group, g]) => g.variants.forEach(v => { if (v.shortcut) SHORTCUTS[v.shortcut.toLowerCase()] = { group, variant: v.id }; }));
  window.TinkrCanvas = window.TinkrCanvas || {};
  Object.assign(window.TinkrCanvas, { TOOL_GROUPS, SHORTCUTS, TOOL_LABELS });
})();
