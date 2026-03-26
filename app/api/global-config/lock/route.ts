import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GLOBAL_CONFIG_UNLOCK_COOKIE } from "@/lib/global-config-auth";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";

export const dynamic = "force-dynamic";

export async function POST() {
  const { user } = await createSupabaseRouteClient();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(GLOBAL_CONFIG_UNLOCK_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ ok: true });
}
