"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveExtensionPairing } from "@/lib/extension";

const REASON_MESSAGES: Record<string, string> = {
  signed_out: "You were signed out. Sign in to continue.",
  "session-expired": "Your session expired. Sign in to continue.",
  magic_link_invalid: "That email link is invalid or expired. Try signing in again."
};

const SKIP_AUTO_REDIRECT = new Set(["signed_out"]);
const MAGIC_LINK_COOLDOWN_MS = 60_000;
const MAGIC_LINK_STORAGE_KEY = "tinkr_magic_link_sent_at";

type AuthMode = "password" | "signup" | "magic";
type StatusTone = "neutral" | "success" | "error";

function formatRateLimitMessage(message: string) {
  return /rate limit|too many requests|email.*limit/i.test(message)
    ? "Too many sign-in emails were sent. Please wait about an hour before trying again."
    : message;
}

type LoginFormProps = {
  source?: string;
  extId?: string;
  devPair?: string;
  reason?: string;
};

export function LoginForm({ source, extId, devPair, reason }: LoginFormProps) {
  const [mode, setMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("Sign in to save projects and collaborate.");
  const [statusTone, setStatusTone] = useState<StatusTone>("neutral");
  const [busyAction, setBusyAction] = useState<AuthMode | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [browserOrigin, setBrowserOrigin] = useState<string | null>(null);

  const pairing = resolveExtensionPairing(extId, source, devPair, browserOrigin);
  const pairingReady = browserOrigin !== null;
  const extensionCallback = pairing.kind === "none"
    ? null
    : `/auth/extension-callback?ext_id=${encodeURIComponent(pairing.extensionId)}${pairing.kind === "manual" ? "&dev_pair=1" : ""}`;
  const busy = busyAction !== null;

  const setMessage = (message: string, tone: StatusTone = "neutral") => {
    setStatus(message);
    setStatusTone(tone);
  };

  const rememberExtensionIntent = () => {
    if (pairing.kind === "none") return;
    sessionStorage.setItem("tinkr_ext_id", pairing.extensionId);
    if (pairing.kind === "manual") sessionStorage.setItem("tinkr_dev_pair", "1");
    else sessionStorage.removeItem("tinkr_dev_pair");
    document.cookie = `tinkr_ext_id=${encodeURIComponent(pairing.extensionId)}; path=/; max-age=3600; SameSite=Lax`;
  };

  const callbackUrl = () => {
    const url = new URL("/auth/callback", window.location.origin);
    if (pairing.kind !== "none") {
      url.searchParams.set("source", "extension");
      url.searchParams.set("ext_id", pairing.extensionId);
      if (pairing.kind === "manual") url.searchParams.set("dev_pair", "1");
    }
    return url.toString();
  };

  const finishAuthenticated = () => {
    window.location.assign(extensionCallback || "/dashboard");
  };

  useEffect(() => {
    setBrowserOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (reason === "signed_out") {
      const supabase = createClient();
      void supabase.auth.signOut({ scope: "local" });
    }
    if (reason) setMessage(REASON_MESSAGES[reason] || "Sign in to continue.", "neutral");
  // The request reason is stable for the lifetime of this page visit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  useEffect(() => {
    rememberExtensionIntent();
  // Pairing is resolved on the client so manual localhost pairing is never
  // accepted during server rendering.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairing.kind, pairing.kind === "none" ? "" : pairing.extensionId]);

  useEffect(() => {
    if (!pairingReady || extensionCallback || reason === "signed_out") return;
    let active = true;
    void (async () => {
      const { data: { session } } = await createClient().auth.getSession();
      if (active && session) window.location.assign("/dashboard");
    })();
    return () => { active = false; };
  }, [extensionCallback, pairingReady, reason]);

  useEffect(() => {
    if (!pairingReady || !extensionCallback || (reason && SKIP_AUTO_REDIRECT.has(reason))) return;
    let active = true;
    void (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session) return;
      const { error } = await supabase.auth.refreshSession();
      if (error || !active) return;
      finishAuthenticated();
    })();
    return () => { active = false; };
  // `finishAuthenticated` only closes over the memoized callback route.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extensionCallback, pairingReady, reason]);

  useEffect(() => {
    if (extensionCallback && !reason) {
      setMessage("Sign in to connect tinkr to this extension.");
    }
  }, [extensionCallback, reason]);

  useEffect(() => {
    const updateCooldown = () => {
      const sentAt = Number(sessionStorage.getItem(MAGIC_LINK_STORAGE_KEY) || 0);
      const remaining = Math.ceil((sentAt + MAGIC_LINK_COOLDOWN_MS - Date.now()) / 1000);
      setCooldownSec(Math.max(0, remaining));
    };
    updateCooldown();
    const timer = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(timer);
  }, []);

  function switchMode(nextMode: AuthMode) {
    if (busy) return;
    setMode(nextMode);
    setStatusTone("neutral");
    if (nextMode === "signup") setStatus("Create an account to save remixes and collaborate.");
    else if (nextMode === "magic") setStatus("Use a one-time link instead of a password.");
    else setStatus("Sign in to save projects and collaborate.");
  }

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setBusyAction("password");
    setMessage("Signing you in...");
    rememberExtensionIntent();

    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      setMessage(error.message, "error");
      setBusyAction(null);
      return;
    }

    setMessage("Signed in. Opening your workspace...", "success");
    finishAuthenticated();
  }

  async function signUpWithPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setBusyAction("signup");
    setMessage("Creating your account...");
    rememberExtensionIntent();

    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: callbackUrl() }
    });

    if (error) {
      setMessage(formatRateLimitMessage(error.message), "error");
      setBusyAction(null);
      return;
    }

    if (data.session) {
      setMessage("Your account is ready. Opening your workspace...", "success");
      finishAuthenticated();
      return;
    }

    // With email confirmation enabled Supabase deliberately does not reveal
    // whether an existing address has an account. Keep the response useful
    // without turning this form into an account-enumeration endpoint.
    const existingAccount = data.user?.identities?.length === 0;
    setMessage(
      existingAccount
        ? "If this address can create an account, check your inbox to confirm it. Otherwise, sign in instead."
        : "Check your inbox to confirm your email, then return here to continue.",
      "success"
    );
    setBusyAction(null);
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || cooldownSec > 0) return;
    setBusyAction("magic");
    setMessage("Sending your sign-in link...");
    rememberExtensionIntent();

    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() }
    });

    if (error) {
      setMessage(formatRateLimitMessage(error.message), "error");
    } else {
      sessionStorage.setItem(MAGIC_LINK_STORAGE_KEY, String(Date.now()));
      setCooldownSec(Math.ceil(MAGIC_LINK_COOLDOWN_MS / 1000));
      setMessage("Check your email for a sign-in link. It expires after a short time.", "success");
    }
    setBusyAction(null);
  }

  const passwordMode = mode === "password";
  const submitLabel = mode === "magic"
    ? cooldownSec > 0 ? `Wait ${cooldownSec}s before resending` : busy ? "Sending..." : "Send magic link"
    : busy ? passwordMode ? "Signing in..." : "Creating account..."
      : passwordMode ? "Sign in" : "Create account";

  const submit = mode === "password"
    ? signInWithPassword
    : mode === "signup"
      ? signUpWithPassword
      : sendMagicLink;

  return (
    <main style={styles.page}>
      <section style={styles.card} aria-labelledby="login-title">
        <div style={styles.brand}>
          <img src="/brand/tinkr-128.png" alt="tinkr" style={styles.logo} />
          <div>
            <strong id="login-title" style={{ fontSize: 22 }}>tinkr</strong>
            <div style={styles.muted}>Save remixes, share reviews, collaborate live</div>
          </div>
        </div>

        <div style={styles.modeTabs} role="tablist" aria-label="Authentication method">
          <button type="button" role="tab" aria-selected={mode === "password"} style={tabStyle(mode === "password")} onClick={() => switchMode("password")}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === "signup"} style={tabStyle(mode === "signup")} onClick={() => switchMode("signup")}>Create account</button>
          <button type="button" role="tab" aria-selected={mode === "magic"} style={tabStyle(mode === "magic")} onClick={() => switchMode("magic")}>Magic link</button>
        </div>

        <p style={{ ...styles.status, ...(statusTone === "error" ? styles.statusError : statusTone === "success" ? styles.statusSuccess : {}) }} role="status" aria-live="polite">{status}</p>

        <form onSubmit={submit}>
          <label style={styles.label} htmlFor="tinkr-auth-email">
            Email address
            <input
              id="tinkr-auth-email"
              className="tinkr-auth-input"
              style={styles.input}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@company.com"
              disabled={busy}
              required
            />
          </label>

          {mode !== "magic" ? (
            <label style={styles.label} htmlFor="tinkr-auth-password">
              Password
              <span style={styles.passwordWrap}>
                <input
                  id="tinkr-auth-password"
                  className="tinkr-auth-input"
                  style={{ ...styles.input, paddingRight: 74, marginTop: 0 }}
                  type={showPassword ? "text" : "password"}
                  autoComplete={passwordMode ? "current-password" : "new-password"}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder={passwordMode ? "Enter your password" : "Choose a password"}
                  disabled={busy}
                  required
                />
                <button
                  type="button"
                  style={styles.passwordToggle}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  disabled={busy}
                  onClick={() => setShowPassword(visible => !visible)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
          ) : null}

          <button style={styles.primary} disabled={busy || (mode === "magic" && cooldownSec > 0)} type="submit">{submitLabel}</button>
        </form>

        {mode === "password" ? (
          <button type="button" style={styles.textButton} onClick={() => switchMode("magic")}>Use a magic link instead</button>
        ) : null}
        {mode === "signup" ? <p style={styles.helpText}>We'll ask you to confirm your email before you can sign in.</p> : null}
        {pairing.kind === "trusted" ? <p style={styles.helpText}>This sign-in will connect the tinkr extension in this browser.</p> : null}
        {pairing.kind === "manual" ? <p style={styles.helpText}>After sign-in, you'll confirm this local extension connection once.</p> : null}
        <p style={styles.footerNote}>Sign in to select, remix, and save layers. Your account also unlocks sharing and collaboration.</p>
      </section>
    </main>
  );
}

function tabStyle(selected: boolean): React.CSSProperties {
  return {
    ...styles.tab,
    ...(selected ? styles.tabActive : {})
  };
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 450, background: "#14151b", border: "1px solid #30313a", borderRadius: 16, padding: 28, boxShadow: "0 18px 50px rgb(0 0 0 / .22)" },
  brand: { display: "flex", gap: 12, alignItems: "center", marginBottom: 20 },
  logo: { display: "block", width: 40, height: 40, objectFit: "contain", borderRadius: 12 },
  muted: { color: "#9d9da7" },
  modeTabs: { display: "grid", gridTemplateColumns: "1fr 1.35fr 1fr", gap: 4, marginBottom: 14, padding: 4, borderRadius: 10, background: "#1b1c23", border: "1px solid #30313a" },
  tab: { minHeight: 34, border: 0, borderRadius: 7, padding: "6px 8px", color: "#9d9da7", background: "transparent", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  tabActive: { color: "#f7f7fa", background: "#2b2d37", boxShadow: "0 1px 0 rgb(255 255 255 / .06) inset" },
  status: { minHeight: 42, margin: "0 0 14px", color: "#bfc0c8", fontSize: 13, lineHeight: 1.5 },
  statusError: { color: "#ffadb5" },
  statusSuccess: { color: "#c9ff46" },
  label: { display: "block", color: "#bfc0c8", fontSize: 12, fontWeight: 650, marginBottom: 12 },
  input: { width: "100%", marginTop: 6, padding: 10, borderRadius: 8, border: "1px solid #3b3c46", background: "#191a20", color: "#fff", boxSizing: "border-box" },
  passwordWrap: { position: "relative", display: "block", marginTop: 6 },
  passwordToggle: { position: "absolute", top: "50%", right: 7, transform: "translateY(-50%)", border: 0, borderRadius: 5, padding: "4px 7px", color: "#cfd1d9", background: "#2c2e38", fontSize: 11, fontWeight: 700 },
  primary: { width: "100%", border: 0, borderRadius: 9, padding: 12, fontWeight: 750, background: "#d0ff5b", color: "#141510", cursor: "pointer" },
  textButton: { display: "block", margin: "13px auto 0", border: 0, padding: 4, color: "#c9ff46", background: "transparent", fontSize: 12, fontWeight: 650 },
  helpText: { margin: "14px 0 0", color: "#9d9da7", fontSize: 12, lineHeight: 1.5 },
  footerNote: { margin: "20px 0 0", color: "#9d9da7", fontSize: 12, lineHeight: 1.55 }
};
