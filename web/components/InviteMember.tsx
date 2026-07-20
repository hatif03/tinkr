"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function InviteMember({ projectId, token }: { projectId: string; token: string }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  async function invite() {
    try {
      await apiFetch(`/api/projects/${projectId}/members`, token, {
        method: "POST",
        body: JSON.stringify({ email, role: "editor" })
      });
      setMsg("Invite sent.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invite failed");
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" style={input} />
      <button onClick={invite} style={btn}>Invite</button>
      {msg && <span style={{ color: "#9d9da7", fontSize: 12 }}>{msg}</span>}
    </div>
  );
}

const input: React.CSSProperties = { flex: 1, background: "#202129", border: "1px solid #383944", borderRadius: 8, color: "#fff", padding: "8px 10px" };
const btn: React.CSSProperties = { border: 0, background: "#292a32", color: "#f7f7fa", borderRadius: 8, padding: "8px 12px" };
