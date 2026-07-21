"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TOOL_GROUPS, toolLabel, variantIcon } from "@/lib/tools";

type Props = {
  active: { group: string; variant: string };
  devMode: boolean;
  timelineOpen: boolean;
  onTool: (group: string, variant: string) => void;
  onDevMode: () => void;
  onTimeline: () => void;
  onPresent: () => void;
  onResources: () => void;
};

function ToolDropdown({ groupKey, active, devMode, onTool }: { groupKey: string; active: Props["active"]; devMode: boolean; onTool: Props["onTool"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const group = TOOL_GROUPS[groupKey];
  const isActive = active.group === groupKey && !devMode;
  const triggerIcon = (isActive ? variantIcon(groupKey, active.variant) : group.icon) as IconName;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="editor-toolbar__group" ref={ref}>
      <button
        className={`editor-toolbar__button ${isActive ? "is-active" : ""}`}
        onClick={() => setOpen(o => !o)}
        title={group.label}
        aria-label={`${group.label} tools`}
        aria-expanded={open}
      >
        <Icon name={triggerIcon} />
      </button>
      {open && (
        <div className="editor-toolbar__menu" role="menu">
          {group.variants.map(v => {
            const selected = active.group === groupKey && active.variant === v.id && !devMode;
            return (
              <button
                key={v.id}
                role="menuitem"
                className={`editor-toolbar__menu-item ${selected ? "is-active" : ""}`}
                onClick={() => { onTool(groupKey, v.id); setOpen(false); }}
              >
                <span className="editor-toolbar__menu-leading">
                  <span className="editor-toolbar__menu-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                  <span className="editor-toolbar__menu-icon"><Icon name={v.icon as IconName} size={16} /></span>
                  <span>{v.label}</span>
                </span>
                {v.shortcut && <kbd>{v.shortcut}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FloatingToolbar({ active, devMode, timelineOpen, onTool, onDevMode, onTimeline, onPresent, onResources }: Props) {
  const status = toolLabel(active.group, active.variant);

  return (
    <>
      <div className="editor-toolbar" role="toolbar" aria-label="tinkr editor tools">
        {Object.keys(TOOL_GROUPS).map(g => (
          <ToolDropdown key={g} groupKey={g} active={active} devMode={devMode} onTool={onTool} />
        ))}
        <button className="editor-toolbar__button" onClick={onResources} title="Resources (Shift+I)" aria-label="Resources">
          <Icon name="resource" />
        </button>
        <span className="editor-toolbar__sep" />
        <button
          className={`editor-toolbar__button ${active.group === "move" && active.variant === "hand" && !devMode ? "is-active" : ""}`}
          onClick={() => onTool("move", "hand")}
          title="Hand (H)"
          aria-label="Hand tool"
        >
          <Icon name="hand" />
        </button>
        <button className="editor-toolbar__button" onClick={() => onTool("comment", "pin")} title="Comment (C)" aria-label="Comment">
          <Icon name="comment" />
        </button>
        <span className="editor-toolbar__sep" />
        <button className="editor-toolbar__button" onClick={onPresent} title="Present · preview in browser" aria-label="Present prototype">
          <Icon name="present" />
        </button>
        <button className={`editor-toolbar__button ${timelineOpen ? "is-active" : ""}`} onClick={onTimeline} title="Motion · keyframe timeline" aria-label="Motion timeline">
          <Icon name="motion" />
        </button>
        <button className={`editor-toolbar__button ${devMode ? "is-dev" : ""}`} onClick={onDevMode} title="Dev Mode (Shift+D)" aria-label="Toggle Dev Mode">
          <Icon name="devMode" />
        </button>
      </div>
      <div className="editor-toolbar__hint" aria-live="polite">{status}</div>
    </>
  );
}
