"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { ProjectCard } from "@/components/ProjectCard";

type Project = { id: string; name: string; source_url: string; updated_at: string; preview_path?: string; starred?: boolean };

export function DashboardClient({ token, email, projects }: { token: string; email: string; projects: Project[] }) {
  const sp = useSearchParams();
  const filter = sp.get("filter") || "recents";
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(projects);
  const router = useRouter();
  const filtered = useMemo(() => {
    let list = items;
    if (filter === "starred") list = list.filter(p => p.starred);
    if (query) list = list.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.source_url.toLowerCase().includes(query.toLowerCase()));
    return list;
  }, [items, filter, query]);

  async function toggleStar(id: string, starred: boolean) {
    setItems(prev => prev.map(p => p.id === id ? { ...p, starred: !starred } : p));
    try { await apiFetch(`/api/projects/${id}/star`, token, { method: "PATCH", body: JSON.stringify({ starred: !starred }) }); }
    catch { setItems(prev => prev.map(p => p.id === id ? { ...p, starred } : p)); }
  }
  const title = filter === "starred" ? "Starred projects" : filter === "all" ? "All projects" : "Your recent remixes";
  return <div className="tk-page">
    <header className="tk-page-header dashboard-header">
      <div><p className="tk-eyebrow">Personal workspace</p><h1 className="tk-title">{title}</h1><p className="tk-muted dashboard-subtitle">Pick up where you left off, or start with a page that inspires you.</p></div>
      <label className="dashboard-search"><Icon name="search"/><input className="tk-input" placeholder="Search projects" value={query} onChange={e => setQuery(e.target.value)} /><span className="dashboard-shortcut">⌘ K</span></label>
    </header>
    <div className="dashboard-toolbar">
      <div className="dashboard-filters" role="tablist" aria-label="Project filter">
        {["recents", "starred", "all"].map(f => <button key={f} role="tab" aria-selected={filter === f} className={`tk-chip ${filter === f ? "tk-chip--active" : ""}`} onClick={() => router.push(f === "recents" ? "/dashboard" : `/dashboard?filter=${f}`)}>{f === "recents" ? "Recent" : f[0].toUpperCase() + f.slice(1)}</button>)}
      </div>
      <span className="tk-status tk-status--saved"><Icon name="cloud" size={13}/> Cloud library</span>
    </div>
    {filtered.length === 0 ? <section className="tk-card tk-empty"><Icon name="layers" size={30}/><h2>{query ? "No matching remixes" : "Your remix library is ready"}</h2><p>{query ? "Try a different project name or source domain." : "Open any landing page in Chrome and enter Design Mode to create your first project."}</p></section> : <div className="project-grid">{filtered.map(p => <div className="project-wrap" key={p.id}><button className={`project-star ${p.starred ? "is-starred" : ""}`} onClick={() => toggleStar(p.id, !!p.starred)} aria-label={p.starred ? "Remove from starred" : "Add to starred"}><Icon name="star" size={15}/></button><ProjectCard project={p}/></div>)}</div>}
  </div>;
}
