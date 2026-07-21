(() => {
  const { ICONS = {} } = window.TinkrCanvas || {};
  const variant = (id, label, shortcut, icon) => ({ id, label, shortcut, icon });

  const TOOL_GROUPS = {
    move: {
      label: "Move",
      icon: ICONS.move,
      variants: [
        variant("select", "Select", "V", "move"),
        variant("hand", "Hand", "H", "hand"),
        variant("scale", "Scale", "K", "scale")
      ]
    },
    region: {
      label: "Region",
      icon: ICONS.frame,
      variants: [
        variant("frame", "Frame", "F", "frame"),
        variant("section", "Section", "Shift+S", "section"),
        variant("slice", "Slice", "S", "slice")
      ]
    },
    shape: {
      label: "Shape",
      icon: ICONS.shape,
      variants: [
        variant("rect", "Rectangle", "R", "shape"),
        variant("line", "Line", "L", "line"),
        variant("arrow", "Arrow", "Shift+L", "arrow"),
        variant("ellipse", "Ellipse", "O", "ellipse"),
        variant("polygon", "Polygon", "", "polygon"),
        variant("star", "Star", "", "star"),
        variant("image", "Image or video", "Ctrl+Shift+K", "image")
      ]
    },
    draw: {
      label: "Draw",
      icon: ICONS.pen,
      variants: [
        variant("pen", "Pen", "P", "pen"),
        variant("pencil", "Pencil", "Shift+P", "pencil"),
        variant("eyedropper", "Eyedropper", "I", "eyedropper")
      ]
    },
    text: {
      label: "Text",
      icon: ICONS.text,
      variants: [
        variant("text", "Text", "T", "text"),
        variant("textPath", "Text on path", "", "textPath")
      ]
    }
  };

  const TOOL_LABELS = {
    "move:select": "Select \u00b7 choose and move layers",
    "move:hand": "Hand \u00b7 pan the webpage",
    "move:scale": "Scale \u00b7 resize the selected layer",
    "region:frame": "Frame \u00b7 insert a tinkr frame",
    "region:section": "Section \u00b7 label a region",
    "region:slice": "Slice \u00b7 capture an export region",
    "shape:rect": "Rectangle \u00b7 draw a shape",
    "shape:line": "Line \u00b7 draw a line",
    "shape:arrow": "Arrow \u00b7 draw an arrow",
    "shape:ellipse": "Ellipse \u00b7 draw a shape",
    "shape:polygon": "Polygon \u00b7 draw a shape",
    "shape:star": "Star \u00b7 draw a shape",
    "shape:image": "Image \u00b7 insert media",
    "draw:pen": "Pen \u00b7 place vector anchors",
    "draw:pencil": "Pencil \u00b7 draw a freehand path",
    "draw:eyedropper": "Eyedropper \u00b7 sample a screen color",
    "text:text": "Text \u00b7 add a text layer",
    "text:textPath": "Text on path \u00b7 attach to a vector",
    "comment:pin": "Comment \u00b7 pin feedback"
  };

  const CURSOR_BY_TOOL = {
    "move:select": "move",
    "move:hand": "hand",
    "move:scale": "scale",
    "draw:pen": "pen",
    "draw:pencil": "pencil",
    "draw:eyedropper": "eyedropper",
    "text:text": "text",
    "text:textPath": "text",
    "comment:pin": "comment",
    "shape:rect": "crosshair",
    "shape:line": "crosshair",
    "shape:arrow": "crosshair",
    "shape:ellipse": "crosshair",
    "shape:polygon": "crosshair",
    "shape:star": "crosshair",
    "shape:image": "image",
    "region:frame": "crosshair",
    "region:section": "crosshair",
    "region:slice": "crosshair"
  };

  const SHORTCUTS = {
    c: { group: "comment", variant: "pin" },
    i: { group: "draw", variant: "eyedropper" }
  };
  // Shift modifiers are resolved by the content interaction layer.
  Object.entries(TOOL_GROUPS).forEach(([group, definition]) => {
    definition.variants.forEach((item) => {
      if (item.shortcut) SHORTCUTS[item.shortcut.toLowerCase()] = { group, variant: item.id };
    });
  });

  function variantIcon(group, variantId) {
    return TOOL_GROUPS[group]?.variants.find((item) => item.id === variantId)?.icon || group;
  }

  window.TinkrCanvas = window.TinkrCanvas || {};
  Object.assign(window.TinkrCanvas, { TOOL_GROUPS, SHORTCUTS, TOOL_LABELS, CURSOR_BY_TOOL, variantIcon });
})();
