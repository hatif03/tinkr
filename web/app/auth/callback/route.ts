import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveExtensionPairing } from "@/lib/extension";

function extIdFromCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)tinkr_ext_id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const source = searchParams.get("source");
  const devPair = searchParams.get("dev_pair");
  const requestedExtId = searchParams.get("ext_id") || extIdFromCookie(request);
  const pairing = resolveExtensionPairing(requestedExtId, source, devPair, origin);
  const extId = pairing.kind === "none" ? null : pairing.extensionId;
  const isExtension = pairing.kind !== "none";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const login = new URL("/login", origin);
      login.searchParams.set("reason", "magic_link_invalid");
      if (isExtension && extId) {
        login.searchParams.set("source", "extension");
        login.searchParams.set("ext_id", extId);
        if (pairing.kind === "manual") login.searchParams.set("dev_pair", "1");
      }
      return NextResponse.redirect(login);
    }
  } else if (!isExtension || !extId) {
    return NextResponse.redirect(new URL("/login?reason=magic_link_invalid", origin));
  }

  const dest = isExtension && extId
    ? `/auth/extension-callback?ext_id=${encodeURIComponent(extId)}${pairing.kind === "manual" ? "&dev_pair=1" : ""}`
    : "/dashboard";
  const response = NextResponse.redirect(`${origin}${dest}`);
  if (isExtension && extId) {
    response.cookies.set("tinkr_ext_id", extId, { path: "/", maxAge: 3600, sameSite: "lax" });
  }
  return response;
}
