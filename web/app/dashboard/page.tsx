import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { CreateMenu } from "@/components/CreateMenu";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  let projects: Array<{ id: string; name: string; source_url: string; updated_at: string; preview_path?: string; starred?: boolean }> = [];
  try {
    const data = await apiFetch("/api/projects", session.access_token);
    projects = data.projects || [];
  } catch {
    projects = [];
  }

  return (
    <AppShell email={session.user.email}>
      <CreateMenu token={session.access_token} />
      <Suspense fallback={<div className="tk-page">Loading projects…</div>}>
        <DashboardClient token={session.access_token} email={session.user.email || ""} projects={projects} />
      </Suspense>
    </AppShell>
  );
}
