import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GLOBAL_CONFIG_UNLOCK_COOKIE } from "@/lib/global-config-auth";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await createSupabaseRouteClient();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const jar = await cookies();
  const unlocked = jar.get(GLOBAL_CONFIG_UNLOCK_COOKIE)?.value === "1";
  return NextResponse.json({ unlocked });
}
