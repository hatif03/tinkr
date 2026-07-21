import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ApiError, apiFetch, isSessionError } from "@/lib/api";
import { CanvasEditor } from "@/components/editor/CanvasEditor";

export default async function ProjectEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  if (!user || !session) redirect("/login");
  let project: any;
  try { ({ project } = await apiFetch(`/api/projects/${id}`, session.access_token)); }
  catch (error) {
    if (isSessionError(error)) redirect("/login?reason=session-expired");
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) notFound();
    throw error;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#101116" }}>
      <header style={bar}>
        <Link href={`/projects/${id}`} style={{ color: "#9d9da7" }}>← {project.name}</Link>
        <strong>{project.name}</strong>
        <span style={{ color: "#9d9da7", fontSize: 12 }}>Editor</span>
      </header>
      <CanvasEditor project={project} token={session.access_token} />
    </div>
  );
}

const bar: React.CSSProperties = {
  height: 56, display: "flex", alignItems: "center", gap: 16, padding: "0 20px",
  borderBottom: "1px solid #30313a", background: "#14151b"
};
