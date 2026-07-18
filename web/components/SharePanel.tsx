"use client";

import { useState } from "react";
import { TINKR_API_URL } from "@/lib/api";

export function SharePanel({ projectId, token, revisions }: { projectId: string; token: string; revisions: Array<{ id: string; name?: string }> }) {
  const [revisionId, setRevisionId] = useState(revisions[0]?.id || "");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function createShare() {
    if (!revisionId) return;
    setBusy(true);
    const response = await fetch(`${TINKR_API_URL}/api/projects/${projectId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ revisionId })
    });
    const data = await response.json();
    setUrl(response.ok ? data.url : data.error || "Failed");
    setBusy(false);
  }

  return (
    <section style={panel}>
      <h2>Share review link</h2>
      {revisions.length === 0 ? <p style={muted}>Save a checkpoint in the extension first.</p> : (
        <>
          <select value={revisionId} onChange={e => setRevisionId(e.target.value)} style={input}>
            {revisions.map(r => <option key={r.id} value={r.id}>{r.name || "Checkpoint"}</option>)}
          </select>
          <button style={btn} disabled={busy} onClick={createShare}>Create link</button>
          {url && <p style={{ wordBreak: "break-all" }}><a href={url.startsWith("http") ? url : undefined}>{url}</a></p>}
        </>
      )}
    </section>
  );
}

const panel: React.CSSProperties = { background: "#14151b", border: "1px solid #30313a", borderRadius: 14, padding: 20 };
const muted: React.CSSProperties = { color: "#9d9da7" };
const input: React.CSSProperties = { width: "100%", margin: "8px 0", padding: 8, borderRadius: 8, border: "1px solid #3b3c46", background: "#191a20", color: "#fff" };
const btn: React.CSSProperties = { border: 0, borderRadius: 8, padding: "8px 12px", background: "#292a32", color: "#f7f7fa", fontWeight: 700 };
