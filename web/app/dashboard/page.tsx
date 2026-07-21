import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { apiFetch, getApiErrorMessage, isSessionError } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  let projects: Array<{ id: string; name: string; source_url: string; updated_at: string; preview_path?: string; starred?: boolean }> = [];
  let loadError: string | null = null;
  try {
    const data = await apiFetch("/api/projects", session.access_token);
    projects = data.projects || [];
  } catch (error) {
    if (isSessionError(error)) redirect("/login?reason=session-expired");
    loadError = getApiErrorMessage(error, "Your project library could not load. Please try again.");
  }

  return (
    <AppShell email={session.user.email}>
      <Suspense fallback={<div className="tk-page" aria-busy="true" aria-live="polite"><section className="tk-card tk-empty"><p className="tk-eyebrow">tinkr cloud</p><h1>Loading your projects…</h1><p>Fetching the latest version of your remix library.</p></section></div>}>
        <DashboardClient token={session.access_token} projects={projects} loadError={loadError} />
      </Suspense>
    </AppShell>
  );
}
