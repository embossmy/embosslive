import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 12,
};

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_PASSWORD not configured on server." },
      { status: 500 }
    );
  }
  if (!password) {
    return NextResponse.json({ ok: false, error: "Password required" }, { status: 400 });
  }

  // 1. Admin?
  if (password === adminPw) {
    const res = NextResponse.json({ ok: true, role: "admin" });
    res.cookies.set("emboss_role", "admin", COOKIE_OPTS);
    res.cookies.set("emboss_event_id", "", { path: "/", maxAge: 0 });
    res.cookies.set("emboss_admin", "", { path: "/", maxAge: 0 });
    return res;
  }

  // 2. Crew? Look up an event with matching crew_password.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured." },
      { status: 500 }
    );
  }
  const sb = createClient(url, anon);
  const { data, error } = await sb
    .from("events")
    .select("id, event_name, crew_password")
    .eq("crew_password", password)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({
    ok: true,
    role: "crew",
    eventId: data.id,
    eventName: data.event_name,
  });
  res.cookies.set("emboss_role", "crew", COOKIE_OPTS);
  res.cookies.set("emboss_event_id", data.id, COOKIE_OPTS);
  res.cookies.set("emboss_admin", "", { path: "/", maxAge: 0 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("emboss_role", "", { path: "/", maxAge: 0 });
  res.cookies.set("emboss_event_id", "", { path: "/", maxAge: 0 });
  res.cookies.set("emboss_admin", "", { path: "/", maxAge: 0 });
  return res;
}
