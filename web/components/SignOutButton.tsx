"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";

function clearExtensionHints() {
  try {
    sessionStorage.removeItem("tinkr_ext_id");
  } catch { /* ignore */ }
  document.cookie = "tinkr_ext_id=; path=/; max-age=0; SameSite=Lax";
}

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    clearExtensionHints();
    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      await supabase.auth.signOut({ scope: "local" });
    }
    window.location.assign("/login?reason=signed_out");
  }
  return <button
    className={`tk-button${compact ? " tk-button--icon" : ""}`}
    style={compact ? undefined : { width: "100%" }}
    onClick={signOut}
    disabled={busy}
    title="Sign out"
    aria-label="Sign out"
  >{compact ? <Icon name="logOut" size={16} /> : (busy ? "Signing out…" : "Sign out")}</button>;
}
