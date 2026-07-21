"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { apiFetch, getApiErrorMessage, isSessionError } from "@/lib/api";
import { CreateMenu } from "@/components/CreateMenu";
import { Icon } from "@/components/ui/Icon";
import { ProjectCard } from "@/components/ProjectCard";

type Project = { id: string; name: string; source_url: string; updated_at: string; preview_path?: string; starred?: boolean };
type SortOrder = "updated" | "name";

function countLabel(count: number) {
  return `${count} ${count === 1 ? "project" : "projects"}`;
}

export function DashboardClient({ token, projects, loadError }: { token: string; projects: Project[]; loadError?: string | null }) {
  const sp = useSearchParams();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filter = sp.get("filter") || "recents";
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("updated");
  const [items, setItems] = useState(projects);
  const [notice, setNotice] = useState("");
  const [retrying, startRetry] = useTransition();

  useEffect(() => setItems(projects), [projects]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const visible = useMemo(() => {
    let list = items;
    if (filter === "starred") list = list.filter(project => project.starred);
    if (query.trim()) {
      const normalizedQuery = query.trim().toLowerCase();
      list = list.filter(project => project.name.toLowerCase().includes(normalizedQuery) || project.source_url.toLowerCase().includes(normalizedQuery));
    }
    return [...list].sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name);
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }, [filter, items, query, sort]);

  const scope = filter === "starred" ? "Starred" : filter === "all" ? "All projects" : "Recents";
  const title = filter === "starred" ? "Starred projects" : filter === "all" ? "All projects" : "Your recent remixes";

  async function toggleStar(id: string, starred: boolean) {
    setNotice("");
    setItems(previous => previous.map(project => project.id === id ? { ...project, starred: !starred } : project));
    try {
      await apiFetch(`/api/projects/${id}/star`, token, { method: "PATCH", body: JSON.stringify({ starred: !starred }) });
      setNotice(starred ? "Removed from Starred." : "Added to Starred.");
    } catch (error) {
      setItems(previous => previous.map(project => project.id === id ? { ...project, starred } : project));
      if (isSessionError(error)) {
        window.location.assign("/login?reason=session-expired");
        return;
      }
      setNotice(getApiErrorMessage(error, "The project could not be updated. Please try again."));
    }
  }

  function retryLibrary() {
    startRetry(() => {
      setNotice("");
      router.refresh();
    });
  }

  function focusNewRemix() {
    document.getElementById("new-remix-url")?.focus();
  }

  const emptyTitle = query
    ? "No matching remixes"
    : filter === "starred"
      ? "No starred remixes yet"
      : "Your remix library is ready";
  const emptyCopy = query
    ? "Try a different project name or source domain."
    : filter === "starred"
      ? "Star the remixes you return to most often, and they will stay here."
      : "Paste a website URL above, then open it in Chrome to start your first remix.";

  return <div className="tk-page dashboard-page">
    <header className="dashboard-header">
      <div>
        <p className="tk-eyebrow">Personal workspace · {scope}</p>
        <h1 className="tk-title">{title}</h1>
        <p className="tk-muted dashboard-subtitle">Pick up where you left off, or start with a page that inspires you.</p>
      </div>
      <div className="dashboard-commandbar">
        <CreateMenu token={token} />
        <label className="dashboard-search" aria-label="Search projects">
          <Icon name="search" />
          <input ref={searchInputRef} className="tk-input" placeholder="Search projects" value={query} onChange={event => setQuery(event.target.value)} />
          <kbd className="dashboard-shortcut">Ctrl / ⌘ K</kbd>
        </label>
      </div>
    </header>

    <div className="dashboard-library-meta">
      <div className="dashboard-library-meta__left">
        <span className="tk-status tk-status--saved"><Icon name="cloud" size={13} /> tinkr cloud</span>
        <span className="dashboard-count">{countLabel(visible.length)} {query ? "matching" : "in this view"}</span>
      </div>
      <div className="dashboard-library-meta__right">
        <label className="tk-eyebrow" htmlFor="dashboard-sort">Sort</label>
        <select id="dashboard-sort" className="dashboard-sort" value={sort} onChange={event => setSort(event.target.value as SortOrder)}>
          <option value="updated">Last updated</option>
          <option value="name">Name</option>
        </select>
      </div>
    </div>

    {loadError ? <section className="tk-card tk-empty" role="alert">
      <Icon name="cloud" size={30} />
      <h2>Your project library could not load</h2>
      <p>{loadError}</p>
      <div className="tk-empty__actions">
        <button className="tk-button tk-button--primary" onClick={retryLibrary} disabled={retrying}>{retrying ? "Retrying…" : "Try again"}</button>
        <button className="tk-button" onClick={focusNewRemix}>Start a local remix</button>
      </div>
    </section> : visible.length === 0 ? <section className="tk-card tk-empty">
      <Icon name="layers" size={30} />
      <h2>{emptyTitle}</h2>
      <p>{emptyCopy}</p>
      {!query && filter !== "starred" && <div className="tk-empty__actions"><button className="tk-button tk-button--primary" onClick={focusNewRemix}><Icon name="plus" /> New remix</button></div>}
      {query && <div className="tk-empty__actions"><button className="tk-button" onClick={() => setQuery("")}>Clear search</button></div>}
    </section> : <div className="project-grid">
      {visible.map(project => <div className="project-wrap" key={project.id}>
        <button className={`project-star ${project.starred ? "is-starred" : ""}`} onClick={() => toggleStar(project.id, !!project.starred)} aria-label={project.starred ? "Remove from Starred" : "Add to Starred"} title={project.starred ? "Remove from Starred" : "Add to Starred"}><Icon name="star" size={15} /></button>
        <ProjectCard project={project} />
      </div>)}
    </div>}
    {notice && <div className="tk-toast-region" aria-live="polite"><p className="tk-toast">{notice}</p></div>}
  </div>;
}
