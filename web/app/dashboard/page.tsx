import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { apiFetch } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";
import { SignOutButton } from "@/components/SignOutButton";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  let projects: Array<{ id: string; name: string; source_url: string; updated_at: string; preview_path?: string }> = [];
  try {
    const data = await apiFetch("/api/projects", session.access_token);
    projects = data.projects || [];
  } catch {
    projects = [];
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div><strong style={{ fontSize: 22 }}>My Library</strong><div style={styles.muted}>Remix projects saved from the extension</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={styles.muted}>{session.user.email}</span>
          <SignOutButton />
        </div>
      </header>
      {projects.length === 0 ? (
        <div style={styles.empty}>
          <p>No projects yet. Install the Tinkr extension, enter Design Mode on any page, and sign in to sync.</p>
          <p style={styles.muted}>Local edits work without an account. Cloud save requires sign-in.</p>
        </div>
      ) : (
        <div style={styles.grid}>{projects.map(p => <ProjectCard key={p.id} project={p} />)}</div>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "32px 24px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, gap: 16, flexWrap: "wrap" },
  muted: { color: "#9d9da7", fontSize: 13 },
  secondary: { border: 0, borderRadius: 8, padding: "8px 12px", background: "#292a32", color: "#f7f7fa" },
  empty: { background: "#14151b", border: "1px solid #30313a", borderRadius: 16, padding: 32 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }
};
