import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GLOBAL_CONFIG_UNLOCK_COOKIE, isValidGlobalConfigPassword } from "@/lib/global-config-auth";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";

export const dynamic = "force-dynamic";

type Body = { password?: string };

export async function POST(request: Request) {
  const { user } = await createSupabaseRouteClient();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidGlobalConfigPassword(password)) {
    return NextResponse.json({ error: "管理员密码错误" }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(GLOBAL_CONFIG_UNLOCK_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return NextResponse.json({ ok: true });
}
