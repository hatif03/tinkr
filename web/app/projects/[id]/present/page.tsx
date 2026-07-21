import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ApiError, apiFetch, isSessionError } from "@/lib/api";

export default async function PresentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  let project: any;
  try {
    ({ project } = await apiFetch(`/api/projects/${id}`, session.access_token));
  } catch (error) {
    if (isSessionError(error)) redirect("/login?reason=session-expired");
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) notFound();
    throw error;
  }
  const links = project.current_draft?.prototypeLinks || [];

  return (
    <div style={{ minHeight: "100vh", background: "#000", position: "relative" }}>
      <iframe src={project.source_url} style={{ width: "100%", height: "100vh", border: 0 }} title="Prototype" />
      <div style={{ position: "fixed", bottom: 16, left: 16, background: "#14151be6", padding: "10px 14px", borderRadius: 10, fontSize: 12 }}>
        <strong>Present mode</strong>
        <div style={{ color: "#9d9da7", marginTop: 4 }}>{links.length} prototype hotspot(s)</div>
      </div>
    </div>
  );
}
