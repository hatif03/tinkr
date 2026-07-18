"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ExtensionCallbackPage() {
  const [status, setStatus] = useState("Connecting your extension…");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const extId = params.get("ext_id");
      const supabase = createClient();
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        setStatus("Session missing. Return to login and try again.");
        return;
      }
      const payload = {
        type: "TINKR_AUTH",
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          user: { id: session.user.id, email: session.user.email, name: session.user.user_metadata?.full_name || session.user.email }
        }
      };
      const chromeApi = (window as unknown as { chrome?: { runtime?: { sendMessage: (id: string, msg: unknown, cb?: (r: unknown) => void) => void; lastError?: { message?: string } } } }).chrome;
      if (extId && chromeApi?.runtime?.sendMessage) {
        chromeApi.runtime.sendMessage(extId, payload, (response) => {
          if (chromeApi.runtime?.lastError) setStatus(`Extension handshake failed: ${chromeApi.runtime.lastError.message}. Open the Tinkr side panel and try again.`);
          else if ((response as { ok?: boolean })?.ok) setStatus("You're signed in. Open the Tinkr side panel from the Chrome toolbar.");
          else setStatus("Extension did not confirm sign-in. Reload the extension and try again.");
        });
      } else {
        setStatus("Signed in to Tinkr Cloud. Click the Tinkr icon to open the side panel.");
      }
    })();
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, background: "#14151b", border: "1px solid #30313a", borderRadius: 16, padding: 28 }}>
        <h1 style={{ marginTop: 0 }}>Extension connected</h1>
        <p style={{ color: "#9d9da7" }}>{status}</p>
        <a href="/dashboard" style={{ color: "#b8ff37" }}>Go to dashboard →</a>
      </div>
    </main>
  );
}
