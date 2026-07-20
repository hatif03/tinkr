"use client";

import { Icon, type IconName } from "@/components/ui/Icon";

const TOOLS: { id: string; label: string; icon: IconName; group: string; variant: string }[] = [
  { id: "select", label: "Select (V)", icon: "move", group: "move", variant: "select" },
  { id: "hand", label: "Hand (H)", icon: "hand", group: "move", variant: "hand" },
  { id: "frame", label: "Frame (F)", icon: "frame", group: "region", variant: "frame" },
  { id: "rect", label: "Rectangle (R)", icon: "square", group: "shape", variant: "rect" },
  { id: "pen", label: "Pen (P)", icon: "pen", group: "draw", variant: "pen" },
  { id: "text", label: "Text (T)", icon: "type", group: "text", variant: "text" }
];

export function FloatingToolbar({ active, devMode, onTool, onDevMode, onPresent }: { active: { group: string; variant: string }; devMode: boolean; onTool: (group: string, variant: string) => void; onDevMode: () => void; onPresent: () => void; }) {
  return <div className="editor-toolbar" role="toolbar" aria-label="Tinkr editor tools">
    {TOOLS.map(t => <button key={t.id} className={`editor-toolbar__button ${active.group === t.group && active.variant === t.variant && !devMode ? "is-active" : ""}`} onClick={() => onTool(t.group, t.variant)} title={t.label} aria-label={t.label}><Icon name={t.icon}/></button>)}
    <span className="editor-toolbar__sep"/>
    <button className={`editor-toolbar__button ${devMode ? "is-dev" : ""}`} onClick={onDevMode} title="Dev Mode" aria-label="Toggle Dev Mode"><Icon name="code"/></button>
    <button className="editor-toolbar__button" onClick={onPresent} title="Present prototype" aria-label="Present prototype"><Icon name="play"/></button>
  </div>;
}
