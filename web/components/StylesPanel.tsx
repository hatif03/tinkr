"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type StyleLib = { text?: { id: string; name: string }[]; colors?: { id: string; name: string; value: string }[]; effects?: { id: string; name: string }[] };

export function StylesPanel({ projectId, token, draft }: { projectId: string; token: string; draft: Record<string, unknown> }) {
  const initial = (draft.styles as StyleLib) || { text: [], colors: [], effects: [] };
  const [styles, setStyles] = useState<StyleLib>(initial);

  async function save(next: StyleLib) {
    setStyles(next);
    await apiFetch(`/api/projects/${projectId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ current_draft: { ...draft, styles: next } })
    });
  }

  return (
    <section style={panel}>
      <h2>Styles</h2>
      <h3>Text styles</h3>
      <ul>{(styles.text || []).map(t => <li key={t.id}>{t.name}</li>)}</ul>
      <h3>Color styles</h3>
      <div style={swatches}>
        {(styles.colors || []).map(c => (
          <button key={c.id} style={{ ...chip, background: c.value }} title={c.name} onClick={() => navigator.clipboard.writeText(c.value)} />
        ))}
      </div>
      <button style={btn} onClick={() => save({
        ...styles,
        colors: [...(styles.colors || []), { id: crypto.randomUUID(), name: "New", value: "#b8ff37" }]
      })}>+ Color style</button>
    </section>
  );
}

const panel: React.CSSProperties = { background: "#14151b", border: "1px solid #30313a", borderRadius: 14, padding: 20 };
const swatches: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" };
const chip: React.CSSProperties = { width: 32, height: 32, borderRadius: "50%", border: "2px solid #555", cursor: "pointer" };
const btn: React.CSSProperties = { border: 0, background: "#292a32", color: "#f7f7fa", borderRadius: 8, padding: "8px 12px", marginTop: 8 };
