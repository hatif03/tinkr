"use client";

type Revision = {
  id: string;
  name?: string;
  description?: string;
  patch_snapshot: unknown[];
  preview_path?: string;
  created_at: string;
  projects?: { name: string; source_url: string; preview_path?: string };
};

export function ReviewClient({ revision, token }: { revision: Revision; token: string }) {
  const project = revision.projects;
  const importUrl = project ? `${project.source_url}${project.source_url.includes("?") ? "&" : "?"}tinkr_import=${token}` : "";

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <h1>{project?.name || "Visual review"}</h1>
      <p style={{ color: "#9d9da7" }}>{revision.name || "Shared checkpoint"} · {new Date(revision.created_at).toLocaleString()}</p>
      {revision.preview_path || project?.preview_path ? (
        <img src={revision.preview_path || project?.preview_path} alt="Preview" style={{ width: "100%", borderRadius: 12, border: "1px solid #30313a" }} />
      ) : null}
      <section style={{ background: "#14151b", border: "1px solid #30313a", borderRadius: 14, padding: 20, marginTop: 20 }}>
        <h2>Patch summary</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#aeb0ba" }}>{JSON.stringify(revision.patch_snapshot, null, 2)}</pre>
      </section>
      {importUrl && (
        <p style={{ marginTop: 20 }}>
          <a href={importUrl} style={{ color: "#b8ff37", fontWeight: 700 }}>Open source page and import in Tinkr extension →</a>
        </p>
      )}
      <p style={{ color: "#9d9da7", fontSize: 13 }}>Visual review only — replaying edits happens in the extension on the original URL.</p>
    </main>
  );
}
