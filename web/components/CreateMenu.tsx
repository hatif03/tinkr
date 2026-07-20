"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";

export function CreateMenu({ token }: { token: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function createFromUrl() {
    if (!url.trim()) return;
    setBusy(true); setError("");
    try {
      const normalized = new URL(url.trim()).toString();
      const data = await apiFetch("/api/projects", token, { method: "POST", body: JSON.stringify({ name: new URL(normalized).hostname, sourceUrl: normalized, current_draft: { patches: [] } }) });
      router.push(`/projects/${data.project.id}/edit`);
    } catch (e) { setError(e instanceof Error ? e.message : "Enter a valid webpage URL to start a remix."); }
    finally { setBusy(false); }
  }
  return <div className="create-menu">
    <div className="create-menu__input">
      <label className="dashboard-search" aria-label="Source page URL"><Icon name="external"/><input className="tk-input" placeholder="Paste a website URL to start a remix" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && createFromUrl()}/></label>
      <button className="tk-button tk-button--primary" onClick={createFromUrl} disabled={busy}>{busy ? "Creating…" : <><Icon name="plus"/>New remix</>}</button>
    </div>
    {error && <span className="tk-status tk-status--warning" role="status">{error}</span>}
  </div>;
}
