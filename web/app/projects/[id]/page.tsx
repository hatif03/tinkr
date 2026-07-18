import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { apiFetch } from "@/lib/api";
import { SharePanel } from "@/components/SharePanel";
import { CommentsPanel } from "@/components/CommentsPanel";
import { LivePresence } from "@/components/LivePresence";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const { project, revisions, members, comments } = await apiFetch(`/api/projects/${id}`, session.access_token);
  const openUrl = `${project.source_url}${project.source_url.includes("?") ? "&" : "?"}tinkr_project=${project.id}`;

  return (
    <main style={styles.page}>
      <Link href="/dashboard" style={styles.back}>← Library</Link>
      <header style={styles.header}>
        <div>
          <h1 style={{ margin: "8px 0" }}>{project.name}</h1>
          <a href={project.source_url} style={styles.muted}>{project.source_url}</a>
        </div>
        <a href={openUrl} style={styles.primary}>Open in Tinkr</a>
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
        </section>
        <CommentsPanel projectId={id} token={session.access_token} initialComments={comments || []} />
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "32px 24px" },
  back: { color: "#9d9da7" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" },
  primary: { background: "#d0ff5b", color: "#141510", padding: "10px 16px", borderRadius: 9, fontWeight: 700 },
  muted: { color: "#9d9da7" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 },
  panel: { background: "#14151b", border: "1px solid #30313a", borderRadius: 14, padding: 20 },
  list: { paddingLeft: 18, color: "#d8d9df" }
};
