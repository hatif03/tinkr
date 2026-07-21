export default function ProjectLoading() {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#101116", color: "#f7f7fa", padding: 24 }} aria-busy="true" aria-live="polite">
    <section style={{ textAlign: "center" }}>
      <p style={{ color: "#9d9da7", margin: 0 }}>tinkr project</p>
      <h1>Loading project…</h1>
      <p style={{ color: "#bfc0c8" }}>Restoring your saved remix.</p>
    </section>
  </main>;
}
