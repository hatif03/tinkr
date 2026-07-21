"use client";

import { FormEvent, useState } from "react";
import { apiFetch, getApiErrorMessage, isSessionError } from "@/lib/api";
import { buildTinkrLaunchUrl } from "@/lib/projects";
import { Icon } from "@/components/ui/Icon";

export function CreateMenu({ token }: { token: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createFromUrl() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const rawUrl = url.trim();
      const normalized = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
      if (normalized.protocol !== "http:" && normalized.protocol !== "https:") {
        throw new Error("Use a public http or https webpage URL.");
      }
      const sourceUrl = normalized.toString();
      const data = await apiFetch("/api/projects", token, {
        method: "POST",
        body: JSON.stringify({ name: normalized.hostname, sourceUrl, current_draft: { patches: [] } })
      });
      window.location.assign(buildTinkrLaunchUrl(sourceUrl, data.project.id));
    } catch (reason) {
      if (isSessionError(reason)) {
        window.location.assign("/login?reason=session-expired");
        return;
      }
      const message = reason instanceof Error && reason.name !== "ApiError"
        ? reason.message
        : getApiErrorMessage(reason, "Enter a valid webpage URL to start a remix.");
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createFromUrl();
  }

  return <form className="dashboard-create" onSubmit={submit}>
    <label className="dashboard-search" aria-label="Source page URL">
      <Icon name="external" />
      <input id="new-remix-url" className="tk-input" type="text" inputMode="url" autoComplete="url" spellCheck={false} placeholder="Paste a website URL to start a remix" value={url} onChange={event => setUrl(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "new-remix-error" : undefined} />
    </label>
    <button className="tk-button tk-button--primary" type="submit" disabled={busy}>{busy ? "Creating…" : <><Icon name="plus" /> New remix</>}</button>
    {error && <p id="new-remix-error" className="tk-status tk-status--warning dashboard-create__error" role="alert">{error}</p>}
  </form>;
}
