"use client";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/login");
  }
  return <button className="tk-button" style={{ width: "100%" }} onClick={signOut}>Sign out</button>;
}
