import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ApiError, apiFetch } from "@/lib/api";
import { buildTinkrLaunchUrl, canLaunchInTinkr } from "@/lib/projects";
import { AppShell } from "@/components/AppShell";
import { SharePanel } from "@/components/SharePanel";
import { CommentsPanel } from "@/components/CommentsPanel";
import { LivePresence } from "@/components/LivePresence";
import { AssetsPanel } from "@/components/AssetsPanel";
import { StylesPanel } from "@/components/StylesPanel";
import { DevInspectPanel } from "@/components/DevInspectPanel";
import { InviteMember } from "@/components/InviteMember";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  if (!user || !session) redirect("/login");
  let project: any, revisions: any[], members: any[], comments: any[];
  try {
    ({ project, revisions, members, comments } = await apiFetch(`/api/projects/${id}`, session.access_token));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  let assets: unknown[] = [];
  try {
    const assetData = await apiFetch(`/api/projects/${id}/assets`, session.access_token);
    assets = assetData.assets || [];
  } catch {
    assets = [];
  }
  const launchable = canLaunchInTinkr(project.source_url);
  const openUrl = launchable ? buildTinkrLaunchUrl(project.source_url, project.id) : null;

  return (
    <AppShell email={session.user.email}>
      <main style={styles.page}>
        <Link href="/dashboard" style={styles.back}>← Library</Link>
        <header style={styles.header}>
          <div>
            <h1 style={{ margin: "8px 0" }}>{project.name}</h1>
            <a href={project.source_url} style={styles.muted}>{project.source_url}</a>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {openUrl ? <a href={openUrl} style={styles.primary}>Open in tinkr</a> : <Link href={`/projects/${id}/edit`} style={styles.primary}>Open webboard</Link>}
            <Link href={`/projects/${id}/edit`} style={styles.secondary}>Open webboard</Link>
            <Link href={`/projects/${id}/present`} style={styles.secondary}>Present</Link>
          </div>
        </header>
        <LivePresence projectId={id} />
        <div style={styles.grid}>
          <section style={styles.panel}>
            <h2>Revisions</h2>
            {(revisions || []).length === 0 ? <p style={styles.muted}>No checkpoints yet.</p> : (
              <ul style={styles.list}>{revisions.map((r: { id: string; name?: string; created_at: string }) => (
                <li key={r.id}>{r.name || "Checkpoint"} · {new Date(r.created_at).toLocaleString()}</li>
              ))}</ul>
            )}
          </section>
          <SharePanel projectId={id} token={session.access_token} revisions={revisions || []} />
          <section style={styles.panel}>
            <h2>Members</h2>
            <ul style={styles.list}>{(members || []).map((m: { user_id: string; role: string; email?: string }) => (
              <li key={m.user_id}>{m.email || m.user_id.slice(0, 8)} · {m.role}</li>
            ))}</ul>
            <InviteMember projectId={id} token={session.access_token} />
          </section>
          <CommentsPanel projectId={id} token={session.access_token} initialComments={comments || []} />
          <StylesPanel projectId={id} token={session.access_token} draft={project.current_draft || {}} />
          <AssetsPanel projectId={id} token={session.access_token} initial={assets as never[]} />
          <DevInspectPanel projectId={id} token={session.access_token} />
        </div>
      </main>
    </AppShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1200, margin: "0 auto", padding: "32px 24px" },
  back: { color: "#9d9da7" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" },
  primary: { background: "#d0ff5b", color: "#141510", padding: "10px 16px", borderRadius: 9, fontWeight: 700 },
  secondary: { background: "#292a32", color: "#f7f7fa", padding: "10px 16px", borderRadius: 9, fontWeight: 600 },
  muted: { color: "#9d9da7" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 },
  panel: { background: "#14151b", border: "1px solid #30313a", borderRadius: 14, padding: 20 },
  list: { paddingLeft: 18, color: "#d8d9df" }
};
