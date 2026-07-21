export default function DashboardLoading() {
  return <main className="tk-page" aria-busy="true" aria-live="polite">
    <section className="tk-card tk-empty">
      <p className="tk-eyebrow">tinkr cloud</p>
      <h1>Loading your projects…</h1>
      <p>Fetching the latest version of your remix library.</p>
    </section>
  </main>;
}
