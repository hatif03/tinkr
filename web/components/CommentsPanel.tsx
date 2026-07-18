"use client";

import { useState } from "react";
import { TINKR_API_URL } from "@/lib/api";

type Comment = { id: string; body: string; created_at: string; target_anchor?: { x?: number; y?: number; label?: string }; author?: { email?: string } };

export function CommentsPanel({ projectId, token, initialComments }: { projectId: string; token: string; initialComments: Comment[] }) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const response = await fetch(`${TINKR_API_URL}/api/projects/${projectId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: body.trim() })
    });
    const data = await response.json();
    if (response.ok) { setComments(c => [data.comment, ...c]); setBody(""); }
  }

  return (
    <section style={panel}>
      <h2>Comments</h2>
      <form onSubmit={submit}>
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Leave feedback…" style={{ ...input, minHeight: 72, width: "100%" }} />
        <button style={btn} type="submit">Post</button>
      </form>
      <ul style={{ paddingLeft: 18 }}>
        {comments.map(c => (
          <li key={c.id} style={{ marginBottom: 10 }}>
            <strong>{c.author?.email || "Collaborator"}</strong>
            <div style={muted}>{new Date(c.created_at).toLocaleString()}</div>
            <p>{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const panel: React.CSSProperties = { background: "#14151b", border: "1px solid #30313a", borderRadius: 14, padding: 20, gridColumn: "1 / -1" };
const muted: React.CSSProperties = { color: "#9d9da7", fontSize: 12 };
const input: React.CSSProperties = { padding: 8, borderRadius: 8, border: "1px solid #3b3c46", background: "#191a20", color: "#fff" };
const btn: React.CSSProperties = { marginTop: 8, border: 0, borderRadius: 8, padding: "8px 12px", background: "#292a32", color: "#f7f7fa", fontWeight: 700 };
