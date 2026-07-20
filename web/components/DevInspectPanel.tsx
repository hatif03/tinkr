"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function DevInspectPanel({ projectId, token }: { projectId: string; token: string }) {
  const [selector, setSelector] = useState("");
  const [output, setOutput] = useState("Enter a selector from your remix patches.");

  async function inspect() {
    if (!selector.trim()) return;
    const data = await apiFetch(`/api/projects/${projectId}/dev-spec?selector=${encodeURIComponent(selector)}`, token);
    setOutput(JSON.stringify(data, null, 2));
  }

  return (
    <section style={panel}>
      <h2>Dev inspect</h2>
      <p style={hint}>Inspect saved patch metadata for a selector (full live inspect runs in the extension).</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={selector} onChange={e => setSelector(e.target.value)} placeholder="body > div:nth-of-type(1)" style={input} />
        <button onClick={inspect} style={btn}>Inspect</button>
      </div>
      <pre style={pre}>{output}</pre>
    </section>
  );
}

const panel: React.CSSProperties = { background: "#14151b", border: "1px solid #30313a", borderRadius: 14, padding: 20 };
const hint: React.CSSProperties = { color: "#9d9da7", fontSize: 12 };
const input: React.CSSProperties = { flex: 1, background: "#202129", border: "1px solid #383944", borderRadius: 8, color: "#fff", padding: "8px 10px", width: "100%" };
const btn: React.CSSProperties = { border: 0, background: "#c4a1ff", color: "#141510", borderRadius: 8, padding: "8px 12px", fontWeight: 700, marginTop: 8 };
const pre: React.CSSProperties = { background: "#1d1e25", padding: 12, borderRadius: 8, fontSize: 11, overflow: "auto", maxHeight: 240, marginTop: 12 };
