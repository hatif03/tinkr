"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/** Reconciles a dashboard tab after an extension/device performs global sign-out. */
export function AuthSessionGuard() {
  const checking = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const goToLogin = () => {
      if (!active || window.location.pathname.startsWith("/login")) return;
      window.location.assign("/login");
    };
    const reconcile = async () => {
      if (checking.current || document.visibilityState !== "visible") return;
      if (window.location.pathname.startsWith("/login")) return;
      checking.current = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { goToLogin(); return; }
        await supabase.auth.refreshSession();
      } finally {
        checking.current = false;
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") goToLogin();
    });

    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    void reconcile();
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, []);

  return null;
}
