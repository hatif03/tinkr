"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type Asset = { id: string; storage_path: string; mime_type: string; byte_size: number; created_at: string };

export function AssetsPanel({ projectId, token, initial }: { projectId: string; token: string; initial: Asset[] }) {
  const [assets, setAssets] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await apiFetch(`/api/projects/${projectId}/assets`, token);
    setAssets(data.assets || []);
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file to add it to this tinkr project.");
      if (file.size > 8 * 1024 * 1024) throw new Error("Image assets must be 8 MB or smaller.");
      const assetId = crypto.randomUUID();
      const { uploadUrl, path } = await apiFetch(`/api/projects/${projectId}/assets/upload-url`, token, {
        method: "POST",
        body: JSON.stringify({ assetId, mimeType: file.type, byteSize: file.size })
      });
      const uploaded = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type, "x-upsert": "true" } });
      if (!uploaded.ok) throw new Error("Storage rejected this image. Please try again.");
      await apiFetch(`/api/projects/${projectId}/assets/complete`, token, {
        method: "POST",
        body: JSON.stringify({ assetId, path, mimeType: file.type, byteSize: file.size })
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload this asset.");
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
        <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {error && <p role="status" style={styles.error}>{error}</p>}
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
  error: { color: "#ffbd63", fontSize: 13, margin: "0 0 12px" },
  danger: { border: 0, background: "transparent", color: "#ff9da2", fontSize: 12 }
};
