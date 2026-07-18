import Link from "next/link";

type Project = { id: string; name: string; source_url: string; updated_at: string; preview_path?: string };

export function ProjectCard({ project }: { project: Project }) {
  const openUrl = `${project.source_url}${project.source_url.includes("?") ? "&" : "?"}tinkr_project=${project.id}`;
  return (
    <article style={styles.card}>
      <div style={styles.thumb}>{project.preview_path ? <img src={project.preview_path} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "✦"}</div>
      <div style={{ padding: 16 }}>
        <strong>{project.name}</strong>
        <div style={styles.muted}>{new URL(project.source_url).hostname}</div>
        <div style={styles.muted}>Updated {new Date(project.updated_at).toLocaleString()}</div>
        <div style={styles.actions}>
          <Link href={`/projects/${project.id}`} style={styles.link}>Manage</Link>
          <a href={openUrl} style={styles.link}>Open in extension</a>
        </div>
      </div>
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: "#14151b", border: "1px solid #30313a", borderRadius: 14, overflow: "hidden" },
  thumb: { height: 120, display: "grid", placeItems: "center", background: "#1d1e25", color: "#6b6d78", fontSize: 32 },
  muted: { color: "#9d9da7", fontSize: 12, marginTop: 4 },
  actions: { display: "flex", gap: 12, marginTop: 12 },
  link: { color: "#b8ff37", fontSize: 13, fontWeight: 600 }
};
