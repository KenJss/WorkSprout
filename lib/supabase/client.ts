import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LockFunc, SupportedStorage } from "@supabase/auth-js";

import { SUPABASE_AUTH_COOKIE_KEY } from "@/lib/supabase/auth-cookie-key";

/**
 * 单标签页内串行执行需要访问 auth storage 的操作。
 * 默认的 `navigator.locks` 在大量并发 getSession/getUser（如 React Strict Mode、多组件同时校验）
 * 时容易出现 “lock was released because another request stole it” 的提示与锁争抢。
 */
function createSingleTabAuthLock(): LockFunc {
  let tail: Promise<unknown> = Promise.resolve();
  return async (_name, _acquireTimeout, fn) => {
    const result = tail.then(() => fn());
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// We persist the Supabase auth session into cookies so Edge middleware
// can detect login state without needing @supabase/ssr.
export { SUPABASE_AUTH_COOKIE_KEY };

const cookieStorage: SupportedStorage = {
  isServer: false,
  getItem: async (key: string) => {
    if (typeof document === "undefined") return null;
    const escapedKey = key.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1");
    const match = document.cookie.match(new RegExp(`(?:^|; )${escapedKey}=([^;]*)`));
    return match ? decodeURIComponent(match[1] ?? "") : null;
  },
  setItem: async (key: string, value: string) => {
    if (typeof document === "undefined") return;
    const encoded = encodeURIComponent(value);
    const maxAgeSeconds = 60 * 60 * 24 * 30; // 30 days
    const secure = typeof window !== "undefined" && window.location.protocol === "https:";
    const securePart = secure ? "; Secure" : "";
    document.cookie = `${key}=${encoded}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${securePart}`;
  },
  removeItem: async (key: string) => {
    if (typeof document === "undefined") return;
    document.cookie = `${key}=; Max-Age=0; Path=/; SameSite=Lax`;
  },
};

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}
if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

function createBrowserSupabaseClient() {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: SUPABASE_AUTH_COOKIE_KEY,
      storage: cookieStorage,
      lock: createSingleTabAuthLock(),
    },
  });
}

declare global {
  var __worksprout_supabase_client__: SupabaseClient | undefined;
}

export const supabase: SupabaseClient =
  globalThis.__worksprout_supabase_client__ ?? createBrowserSupabaseClient();

if (!globalThis.__worksprout_supabase_client__) {
  globalThis.__worksprout_supabase_client__ = supabase;
}

