const CHROME_EXTENSION_ID = /^[a-p]{32}$/;

export type ExtensionPairing =
  | { kind: "trusted"; extensionId: string }
  | { kind: "manual"; extensionId: string }
  | { kind: "none" };

/**
 * The dashboard may only hand a browser session to the one tinkr extension
 * that the operator configured for this deployment. An extension ID is public
 * (it is not a credential), but accepting an arbitrary ID here would let a
 * malicious extension receive a user's Supabase session during magic-link
 * sign-in.
 */
export function configuredTinkrExtensionId() {
  const extensionId = process.env.NEXT_PUBLIC_TINKR_EXTENSION_ID?.trim() || "";
  return CHROME_EXTENSION_ID.test(extensionId) ? extensionId : null;
}

export function isConfiguredTinkrExtensionId(extensionId: string | null | undefined): extensionId is string {
  const configured = configuredTinkrExtensionId();
  return Boolean(configured && extensionId && extensionId === configured);
}

function isLocalDevelopmentOrigin(origin: string | null | undefined) {
  try {
    const url = new URL(origin || "");
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Decide whether a login request may target an extension.
 *
 * Releases only accept the exact extension ID configured for the deployment.
 * An unpacked extension does not have a deploy-time ID, so localhost supports a
 * deliberately manual pairing path. The callback page requires a visible user
 * confirmation before it sends a session in that case; this function must
 * never turn that local path into an automatic hand-off.
 */
export function resolveExtensionPairing(
  extensionId: string | null | undefined,
  source: string | null | undefined,
  devPair: string | null | undefined,
  origin: string | null | undefined
): ExtensionPairing {
  if (source !== "extension" || !extensionId || !CHROME_EXTENSION_ID.test(extensionId)) {
    return { kind: "none" };
  }
  if (isConfiguredTinkrExtensionId(extensionId)) {
    return { kind: "trusted", extensionId };
  }
  if (devPair === "1" && isLocalDevelopmentOrigin(origin)) {
    return { kind: "manual", extensionId };
  }
  return { kind: "none" };
}
