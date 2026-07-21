"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveExtensionPairing, type ExtensionPairing } from "@/lib/extension";

type ChromeRuntime = {
  sendMessage: (id: string, msg: unknown, cb?: (r: unknown) => void) => void;
  lastError?: { message?: string };
};

type SessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string; name?: string };
};

function getChromeRuntime(): ChromeRuntime | undefined {
  return (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendAuthToExtension(extId: string, payload: unknown, chromeApi: ChromeRuntime) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(500 * attempt);
    const result = await new Promise<{ ok?: boolean; error?: string }>((resolve) => {
      chromeApi.sendMessage(extId, payload, (response) => {
        if (chromeApi.lastError) resolve({ error: chromeApi.lastError.message || "Extension unreachable" });
        else resolve((response as { ok?: boolean; error?: string }) || {});
      });
    });
    if (result.ok) return { ok: true as const };
    if (attempt === 2) return { ok: false as const, error: result.error || "Extension did not confirm sign-in" };
  }
  return { ok: false as const, error: "Extension did not confirm sign-in" };
}

function pairingLabel(pairing: ExtensionPairing) {
  if (pairing.kind === "none") return "";
  const id = pairing.extensionId;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export default function ExtensionCallbackPage() {
  const [status, setStatus] = useState("Preparing your tinkr extension connection…");
  const [manualPayload, setManualPayload] = useState<{ pairing: ExtensionPairing; payload: unknown } | null>(null);
  const deliveryStarted = useRef(false);

  const deliver = useCallback(async (pairing: ExtensionPairing, payload: unknown) => {
    if (pairing.kind === "none") return;
    setStatus("Connecting your tinkr extension…");
    const chromeApi = getChromeRuntime();
    if (!chromeApi?.sendMessage) {
      setStatus("Chrome could not reach the extension. Open the tinkr side panel and try again.");
      return;
    }
    const result = await sendAuthToExtension(pairing.extensionId, payload, chromeApi);
    if (result.ok) {
      sessionStorage.removeItem("tinkr_ext_id");
      setManualPayload(null);
      setStatus("You’re signed in. Open the tinkr side panel from the Chrome toolbar.");
    } else {
      setStatus(`Extension connection failed: ${result.error}. Keep this page open and try again.`);
    }
  }, []);

  useEffect(() => {
    if (deliveryStarted.current) return;
    deliveryStarted.current = true;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const extId = params.get("ext_id") || sessionStorage.getItem("tinkr_ext_id");
      const pairing = resolveExtensionPairing(extId, "extension", params.get("dev_pair"), window.location.origin);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (pairing.kind === "none") {
        setStatus("This callback is not paired with the configured tinkr extension. Open the side panel and try signing in again.");
        return;
      }
      if (!supabaseUrl || !anonKey) {
        setStatus("Server auth configuration is missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return;
      }

      const supabase = createClient();
      const { data: { session: existing } } = await supabase.auth.getSession();
      if (!existing) {
        setStatus("Session missing. Return to login and try again.");
        return;
      }
      const { data: refreshed } = await supabase.auth.refreshSession();
      const session = refreshed.session || (await supabase.auth.getSession()).data.session;
      if (!session) {
        setStatus("Session expired — return to login and sign in again.");
        return;
      }

      const payload = {
        type: "TINKR_AUTH",
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          user: { id: session.user.id, email: session.user.email, name: session.user.user_metadata?.full_name || session.user.email }
        } satisfies SessionPayload,
        supabaseUrl,
        anonKey
      };

      if (pairing.kind === "manual") {
        // Unpacked localhost extensions have no safely configured deployment
        // ID. Require this visible confirmation rather than automatically
        // exposing the browser session to an ID supplied in a URL.
        setManualPayload({ pairing, payload });
        setStatus(`Connect local extension ${pairingLabel(pairing)} to this signed-in tinkr session?`);
        return;
      }
      await deliver(pairing, payload);
    })();
  }, [deliver]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, background: "#14151b", border: "1px solid #30313a", borderRadius: 16, padding: 28 }}>
        <h1 style={{ marginTop: 0 }}>Connect tinkr extension</h1>
        <p style={{ color: "#9d9da7" }}>{status}</p>
        {manualPayload ? (
          <>
            <button
              type="button"
              onClick={() => void deliver(manualPayload.pairing, manualPayload.payload)}
              style={{ width: "100%", border: 0, borderRadius: 9, padding: 12, fontWeight: 700, background: "#d0ff5b", color: "#141510", cursor: "pointer" }}
            >
              Connect this local extension
            </button>
            <p style={{ color: "#9d9da7", fontSize: 12, marginTop: 14 }}>
              Local development extensions use an explicit confirmation so a browser session is never handed to an arbitrary extension automatically.
            </p>
          </>
        ) : null}
        <a href="/dashboard" style={{ display: "inline-block", marginTop: 18, color: "#b8ff37" }}>Go to dashboard →</a>
      </div>
    </main>
  );
}
