"use client";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }
  return <button style={{ border: 0, borderRadius: 8, padding: "8px 12px", background: "#292a32", color: "#f7f7fa" }} onClick={signOut}>Sign out</button>;
}
