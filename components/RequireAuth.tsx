"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data.session?.user) {
          router.replace("/login");
          return;
        }
        setAllowed(true);
      } catch {
        if (!cancelled) router.replace("/login");
      } finally {
        if (!cancelled) setCheckingAuth(false);
      }
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-background text-foreground">
        加载中...
      </div>
    );
  }

  if (!allowed) return null;
  return <>{children}</>;
}
