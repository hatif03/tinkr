"use client";

import Link from "next/link";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <main className="tk-page">
    <section className="tk-card tk-empty" role="alert">
      <p className="tk-eyebrow">tinkr cloud</p>
      <h1>We could not open your project library</h1>
      <p>Check your connection, then try again. Your local remix drafts remain in the extension.</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
        <button className="tk-button tk-button--primary" onClick={reset}>Try again</button>
        <Link className="tk-button" href="/login">Sign in again</Link>
      </div>
    </section>
  </main>;
}
