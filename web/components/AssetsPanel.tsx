"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type Asset = { id: string; storage_path: string; mime_type: string; byte_size: number; created_at: string };

export function AssetsPanel({ projectId, token, initial }: { projectId: string; token: string; initial: Asset[] }) {
  const [assets, setAssets] = useState(initial);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    const data = await apiFetch(`/api/projects/${projectId}/assets`, token);
    setAssets(data.assets || []);
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const { uploadUrl, path } = await apiFetch(`/api/projects/${projectId}/assets/upload-url`, token, {
        method: "POST",
        body: JSON.stringify({ mimeType: file.type, byteSize: file.size })
      });
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      await refresh();
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/api/projects/${projectId}/assets/${id}`, token, { method: "DELETE" });
    setAssets(a => a.filter(x => x.id !== id));
  }

  return (
    <section style={styles.panel}>
      <h2>Assets</h2>
      <label style={styles.upload}>
        {uploading ? "Uploading…" : "Upload asset"}
        <input type="file" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      <ul style={styles.list}>
        {assets.length === 0 ? <li style={styles.muted}>No assets yet</li> : assets.map(a => (
          <li key={a.id} style={styles.item}>
            <span>{a.mime_type} · {(a.byte_size / 1024).toFixed(1)} KB</span>
            <button onClick={() => remove(a.id)} style={styles.danger}>Delete</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { background: "#14151b", border: "1px solid #30313a", borderRadius: 14, padding: 20 },
  upload: { display: "inline-block", background: "#292a32", padding: "8px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 12, fontSize: 13 },
  list: { listStyle: "none", padding: 0, margin: 0 },
  item: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #292a32", fontSize: 13 },
  muted: { color: "#9d9da7" },
  danger: { border: 0, background: "transparent", color: "#ff9da2", fontSize: 12 }
};
