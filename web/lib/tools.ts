// Tool metadata synced with packages/canvas/tool-definitions.js + icons.js

export type ToolVariant = { id: string; label: string; shortcut?: string; icon: string };

export type ToolGroup = { label: string; icon: string; variants: ToolVariant[] };

export const TOOL_GROUPS: Record<string, ToolGroup> = {
  move: { label: "Move", icon: "move", variants: [{ id: "select", label: "Move", shortcut: "V", icon: "move" }, { id: "hand", label: "Hand tool", shortcut: "H", icon: "hand" }, { id: "scale", label: "Scale", shortcut: "K", icon: "scale" }] },
  region: { label: "Region", icon: "frame", variants: [{ id: "frame", label: "Frame", shortcut: "F", icon: "frame" }, { id: "section", label: "Section", shortcut: "Shift+S", icon: "section" }, { id: "slice", label: "Slice", shortcut: "S", icon: "slice" }] },
  shape: { label: "Shape", icon: "shape", variants: [{ id: "rect", label: "Rectangle", shortcut: "R", icon: "shape" }, { id: "line", label: "Line", shortcut: "L", icon: "line" }, { id: "arrow", label: "Arrow", shortcut: "Shift+L", icon: "arrow" }, { id: "ellipse", label: "Ellipse", shortcut: "O", icon: "ellipse" }, { id: "polygon", label: "Polygon", icon: "polygon" }, { id: "star", label: "Star", icon: "star" }, { id: "image", label: "Image / video", shortcut: "Ctrl+Shift+K", icon: "image" }] },
  draw: { label: "Draw", icon: "pen", variants: [{ id: "pen", label: "Pen", shortcut: "P", icon: "pen" }, { id: "pencil", label: "Pencil", shortcut: "Shift+P", icon: "pencil" }, { id: "eyedropper", label: "Eyedropper", shortcut: "I", icon: "eyedropper" }] },
  text: { label: "Text", icon: "type", variants: [{ id: "text", label: "Text", shortcut: "T", icon: "type" }, { id: "textPath", label: "Text on path", icon: "textPath" }] }
};

export const TOOL_LABELS: Record<string, string> = {
  "move:select": "Move · select and drag layers",
  "move:hand": "Hand · pan the canvas",
  "move:scale": "Scale · resize selected layer",
  "draw:pen": "Pen · place vector anchors",
  "draw:pencil": "Pencil · draw freehand path",
  "draw:eyedropper": "Eyedropper · sample color",
  "text:text": "Text · add text box",
  "text:textPath": "Text on path · attach to vector"
};

export function variantIcon(group: string, variant: string) {
  return TOOL_GROUPS[group]?.variants.find(v => v.id === variant)?.icon || group;
}

export function toolLabel(group: string, variant: string) {
  return TOOL_LABELS[`${group}:${variant}`] || `${group} · ${variant}`;
}
