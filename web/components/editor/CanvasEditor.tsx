"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { buildTinkrLaunchUrl } from "@/lib/projects";
import { FloatingToolbar } from "./FloatingToolbar";

type Project = {
  id: string;
  name: string;
  source_url: string;
  current_draft?: Record<string, unknown>;
  canvas_meta?: { viewportState?: { scale: number; x: number; y: number } };
};

export function CanvasEditor({ project, token }: { project: Project; token: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [devMode, setDevMode] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [tool, setTool] = useState({ group: "move", variant: "select" });
  const [blocked, setBlocked] = useState(false);
  const [status, setStatus] = useState("Loading canvas…");
  const [inspect, setInspect] = useState("Select an element in the iframe (extension recommended for full inspect).");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const draft = project.current_draft || { patches: [] };

  const postTool = useCallback((group: string, variant: string) => {
    setTool({ group, variant });
    iframeRef.current?.contentWindow?.postMessage({ type: "TINKR_SET_TOOL", group, variant }, "*");
  }, []);

  const save = useCallback(async (nextDraft: Record<string, unknown>) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await apiFetch(`/api/projects/${project.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({ current_draft: nextDraft, canvas_meta: project.canvas_meta })
        });
        setStatus("Saved");
      } catch {
        setStatus("Save failed");
      }
    }, 800);
  }, [project.id, project.canvas_meta, token]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      try {
        iframe.contentWindow?.postMessage({ type: "TINKR_APPLY_DRAFT", draft }, "*");
        setStatus("Canvas ready");
        setBlocked(false);
      } catch {
        setBlocked(true);
        setStatus("Iframe blocked — use extension for full fidelity");
      }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [draft, project.source_url]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "TINKR_IFRAME_SELECT") {
        setInspect(JSON.stringify(e.data.spec || e.data, null, 2));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div style={layout}>
      <aside style={leftRail}>
        <h3>Layers</h3>
        <ul style={list}>
          {((draft.vectorLayers as { id: string; type: string }[]) || []).map(v => (
            <li key={v.id}>{v.type}</li>
          )) || <li style={muted}>DOM + vectors</li>}
        </ul>
        <h3>Variables</h3>
        <pre style={pre}>{JSON.stringify(draft.tokens || {}, null, 2)}</pre>
      </aside>

      <div style={viewport}>
        {blocked && (
          <div style={fallback}>
            <p>This site blocks iframe embedding. Open it in the Chrome extension for full editing.</p>
            <a href={buildTinkrLaunchUrl(project.source_url, project.id)}>Open in tinkr</a>
          </div>
        )}
        <iframe ref={iframeRef} src={project.source_url} style={iframe} title="Canvas" sandbox="allow-scripts allow-same-origin allow-forms" />
        <FloatingToolbar
          active={tool}
          devMode={devMode}
          timelineOpen={timelineOpen}
          onTool={postTool}
          onDevMode={() => { setDevMode(d => !d); setStatus(devMode ? "Design" : "Dev Mode"); }}
          onTimeline={() => setTimelineOpen(o => !o)}
          onPresent={() => window.open(`/projects/${project.id}/present`, "_blank")}
          onResources={() => setStatus("Resources · use dashboard Assets panel")}
        />
        <div style={{ ...timeline, display: timelineOpen ? "flex" : "none" }}>
          <span>Motion timeline</span>
          <span style={muted}>{((draft.motion as unknown[]) || []).length} tracks · Present = preview · Motion = keyframes</span>
        </div>
        <div style={statusBar}>{status}</div>
      </div>

      <aside style={rightRail}>
        <h3>{devMode ? "Inspect" : "Design"}</h3>
        {devMode ? (
          <pre style={pre}>{inspect}</pre>
        ) : (
          <>
            <p style={muted}>Properties sync via cloud draft. Use extension for live DOM editing.</p>
            <button style={btn} onClick={() => save({ ...draft, updatedAt: new Date().toISOString() })}>Save now</button>
          </>
        )}
      </aside>
    </div>
  );
}

const layout: React.CSSProperties = { display: "grid", gridTemplateColumns: "200px 1fr 260px", height: "calc(100vh - 56px)" };
const leftRail: React.CSSProperties = { background: "#14151b", borderRight: "1px solid #30313a", padding: 16, overflow: "auto" };
const rightRail: React.CSSProperties = { background: "#14151b", borderLeft: "1px solid #30313a", padding: 16, overflow: "auto" };
const viewport: React.CSSProperties = { position: "relative", background: "#0a0a0d", overflow: "hidden" };
const iframe: React.CSSProperties = { width: "100%", height: "100%", border: 0, background: "#fff" };
const fallback: React.CSSProperties = { position: "absolute", inset: 0, display: "grid", placeContent: "center", background: "#14151b", zIndex: 5, textAlign: "center", padding: 24 };
const timeline: React.CSSProperties = { position: "absolute", left: 12, right: 12, bottom: 108, height: 48, background: "rgba(16,17,22,.94)", border: "1px solid #383944", borderRadius: 10, alignItems: "center", justifyContent: "space-between", padding: "0 12px", fontSize: 12, zIndex: 15 };
const statusBar: React.CSSProperties = { position: "absolute", top: 8, left: 8, background: "#14151bcc", padding: "4px 8px", borderRadius: 6, fontSize: 11, zIndex: 15 };
const list: React.CSSProperties = { paddingLeft: 16, fontSize: 12, color: "#cdd0da" };
const pre: React.CSSProperties = { background: "#1d1e25", padding: 8, borderRadius: 6, fontSize: 10, overflow: "auto", maxHeight: 300 };
const muted: React.CSSProperties = { color: "#9d9da7", fontSize: 12 };
const btn: React.CSSProperties = { border: 0, background: "#d0ff5b", color: "#141510", borderRadius: 8, padding: "8px 12px", fontWeight: 700, marginTop: 8 };
