"use client";

import Link from "next/link";

export default function ProjectError({ reset }: { error: Error; reset: () => void }) {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#101116", color: "#f7f7fa", padding: 24 }}>
    <section style={{ maxWidth: 420, textAlign: "center", padding: 28, borderRadius: 16, border: "1px solid #30313a", background: "#14151b" }}>
      <p style={{ color: "#ffbd63", margin: 0 }}>Could not open this tinkr project</p>
      <h1>Try again</h1>
      <p style={{ color: "#bfc0c8" }}>Check your connection or return to your project library.</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}><button onClick={reset}>Retry</button><Link href="/dashboard">Back to projects</Link></div>
    </section>
  </main>;
}
