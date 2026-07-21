import Link from "next/link";

export default function ProjectNotFound() {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#101116", color: "#f7f7fa", padding: 24 }}>
    <section style={{ maxWidth: 420, textAlign: "center", padding: 28, borderRadius: 16, border: "1px solid #30313a", background: "#14151b" }}>
      <p style={{ color: "#9d9da7", margin: 0 }}>tinkr project</p>
      <h1>That project is unavailable</h1>
      <p style={{ color: "#bfc0c8" }}>It may have been deleted, moved, or shared without access.</p>
      <Link href="/dashboard" style={{ display: "inline-block", padding: "10px 14px", borderRadius: 9, background: "#d0ff5b", color: "#141510", fontWeight: 700 }}>Back to projects</Link>
    </section>
  </main>;
}
