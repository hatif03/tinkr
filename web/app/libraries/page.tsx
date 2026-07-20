import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LibrariesPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  return (
    <AppShell email={session.user.email}>
      <main style={{ padding: 32, maxWidth: 900 }}>
        <h1>Libraries &amp; Resources</h1>
        <p style={{ color: "#9d9da7" }}>Community component kits and shared assets will appear here. Use the extension Resources (◆) tool and dashboard Assets panel for project-level libraries.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16, marginTop: 24 }}>
          {["Marketing blocks", "UI primitives", "Icon set"].map(name => (
            <article key={name} style={{ background: "#14151b", border: "1px solid #30313a", borderRadius: 14, padding: 20 }}>
              <strong>{name}</strong>
              <p style={{ color: "#9d9da7", fontSize: 13 }}>Coming soon</p>
            </article>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
