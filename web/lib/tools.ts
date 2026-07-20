// Tool metadata synced with packages/canvas/tool-definitions.js + icons.js

export type ToolVariant = { id: string; label: string; shortcut?: string };

export type ToolGroup = { label: string; icon: string; variants: ToolVariant[] };

export const TOOL_GROUPS: Record<string, ToolGroup> = {
  move: { label: "Move", icon: "move", variants: [{ id: "select", label: "Move", shortcut: "V" }, { id: "hand", label: "Hand tool", shortcut: "H" }, { id: "scale", label: "Scale", shortcut: "K" }] },
  region: { label: "Region", icon: "frame", variants: [{ id: "frame", label: "Frame", shortcut: "F" }, { id: "section", label: "Section", shortcut: "Shift+S" }, { id: "slice", label: "Slice", shortcut: "S" }] },
  shape: { label: "Shape", icon: "shape", variants: [{ id: "rect", label: "Rectangle", shortcut: "R" }, { id: "line", label: "Line", shortcut: "L" }, { id: "arrow", label: "Arrow", shortcut: "Shift+L" }, { id: "ellipse", label: "Ellipse", shortcut: "O" }, { id: "polygon", label: "Polygon" }, { id: "star", label: "Star" }, { id: "image", label: "Image / video", shortcut: "Ctrl+Shift+K" }] },
  draw: { label: "Draw", icon: "pen", variants: [{ id: "pen", label: "Pen", shortcut: "P" }, { id: "pencil", label: "Pencil", shortcut: "Shift+P" }, { id: "eyedropper", label: "Eyedropper", shortcut: "I" }] },
  text: { label: "Text", icon: "type", variants: [{ id: "text", label: "Text", shortcut: "T" }, { id: "textPath", label: "Text on path" }] }
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

export function toolLabel(group: string, variant: string) {
  return TOOL_LABELS[`${group}:${variant}`] || `${group} · ${variant}`;
}
