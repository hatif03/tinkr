"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("Sign in to save projects and collaborate.");
  const [busy, setBusy] = useState(false);
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const source = params?.get("source");
  const extId = params?.get("ext_id");

  async function signInGoogle() {
    setBusy(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback${source === "extension" && extId ? `?source=extension&ext_id=${encodeURIComponent(extId)}` : ""}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });
    if (error) { setStatus(error.message); setBusy(false); }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback${source === "extension" && extId ? `?source=extension&ext_id=${encodeURIComponent(extId)}` : ""}`;
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
    setStatus(error ? error.message : "Check your email for a magic link.");
    setBusy(false);
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brand}><span style={styles.logo}>✦</span><div><strong style={{ fontSize: 22 }}>Tinkr Cloud</strong><div style={styles.muted}>Save remixes, share reviews, collaborate live</div></div></div>
        <p style={styles.muted}>{status}</p>
        <button style={styles.primary} disabled={busy} onClick={signInGoogle}>Continue with Google</button>
        <form onSubmit={sendMagicLink} style={{ marginTop: 16 }}>
          <label style={styles.label}>Or use email magic link<input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></label>
          <button style={styles.secondary} disabled={busy} type="submit">Send magic link</button>
        </form>
        <p style={{ ...styles.muted, fontSize: 12, marginTop: 20 }}>Design Mode works without an account. Sign in only when you want cloud save and collaboration.</p>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420, background: "#14151b", border: "1px solid #30313a", borderRadius: 16, padding: 28 },
  brand: { display: "flex", gap: 12, alignItems: "center", marginBottom: 20 },
  logo: { width: 40, height: 40, display: "grid", placeItems: "center", borderRadius: 12, background: "linear-gradient(135deg,#d0ff5b,#74e7ff)", color: "#101116", fontSize: 22 },
  muted: { color: "#9d9da7" },
  label: { display: "block", color: "#bfc0c8", fontSize: 12, marginBottom: 12 },
  input: { width: "100%", marginTop: 6, padding: 10, borderRadius: 8, border: "1px solid #3b3c46", background: "#191a20", color: "#fff" },
  primary: { width: "100%", border: 0, borderRadius: 9, padding: 12, fontWeight: 700, background: "#d0ff5b", color: "#141510" },
  secondary: { width: "100%", marginTop: 8, border: 0, borderRadius: 9, padding: 10, fontWeight: 700, background: "#292a32", color: "#f7f7fa" }
};
