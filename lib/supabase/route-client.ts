import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { parseAccessTokenFromAuthCookie } from "@/lib/supabase/auth-cookie";
import { SUPABASE_AUTH_COOKIE_KEY } from "@/lib/supabase/auth-cookie-key";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type RouteSupabaseResult =
  | { supabase: SupabaseClient; user: User }
  | { supabase: null; user: null };

/** 使用请求 Cookie 中的会话 JWT，创建带用户身份的 Supabase 客户端（用于 Route Handler + RLS） */
export async function createSupabaseRouteClient(): Promise<RouteSupabaseResult> {
  if (!url || !anonKey) {
    return { supabase: null, user: null };
  }

  const jar = await cookies();
  const raw = jar.get(SUPABASE_AUTH_COOKIE_KEY)?.value;
  const accessToken = parseAccessTokenFromAuthCookie(raw);
  if (!accessToken) {
    return { supabase: null, user: null };
  }

  const supabase = createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase: null, user: null };
  }

  return { supabase, user };
}
