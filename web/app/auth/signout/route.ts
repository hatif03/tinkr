import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function signOutResponse(request: Request) {
  const { origin } = new URL(request.url);
  const response = NextResponse.redirect(`${origin}/login?reason=signed_out`);
  response.cookies.set("tinkr_ext_id", "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  return signOutResponse(request);
}

export async function POST() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  return NextResponse.json({ ok: !error }, { status: error ? 502 : 200 });
}
