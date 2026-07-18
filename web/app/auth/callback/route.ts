import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const source = searchParams.get("source");
  const extId = searchParams.get("ext_id");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const dest = source === "extension" && extId
    ? `/auth/extension-callback?ext_id=${encodeURIComponent(extId)}`
    : "/dashboard";
  return NextResponse.redirect(`${origin}${dest}`);
}
