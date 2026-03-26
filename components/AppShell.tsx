"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileText, LayoutGrid, ListFilter, LogOut, Menu, Settings2, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function AppShell({ title, subtitle, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function onLogout() {
    setLogoutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      close();
      router.replace("/login");
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : "退出登录失败。");
    }
  }

  const workbenchActive = pathname === "/";
  const tasksActive = pathname.startsWith("/tasks");
  const reportsActive = pathname.startsWith("/reports");
  const settingsConfigActive = pathname.startsWith("/settings/configuration");
  const settingsGlobalActive = pathname.startsWith("/settings/global");
  const settingsAiActive = pathname.startsWith("/settings/ai");

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/70 via-zinc-50 to-zinc-100/70 text-foreground">
      {open ? (
        <button
          type="button"
          aria-label="关闭菜单"
          className="fixed inset-0 z-40 bg-zinc-950/45 backdrop-blur-[2px] transition-opacity"
          onClick={close}
        />
      ) : null}

      <aside
        className={[
          "fixed left-0 top-0 z-50 flex h-full w-[min(288px,88vw)] flex-col border-r border-zinc-200/90 bg-white shadow-2xl shadow-zinc-900/10 transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full pointer-events-none",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight text-zinc-900">WorkSprout</span>
          <button
            type="button"
            onClick={close}
            className="inline-flex size-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="关闭菜单"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <Link
            href="/"
            onClick={close}
            className={[
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              workbenchActive
                ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80"
                : "text-zinc-700 hover:bg-zinc-100",
            ].join(" ")}
          >
            <LayoutGrid className="size-[1.125rem] shrink-0 opacity-80" strokeWidth={2} />
            工作台
          </Link>
          <Link
            href="/tasks"
            onClick={close}
            className={[
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              tasksActive
                ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80"
                : "text-zinc-700 hover:bg-zinc-100",
            ].join(" ")}
          >
            <ListFilter className="size-[1.125rem] shrink-0 opacity-80" strokeWidth={2} />
            任务查询
          </Link>
          <Link
            href="/reports"
            onClick={close}
            className={[
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              reportsActive
                ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80"
                : "text-zinc-700 hover:bg-zinc-100",
            ].join(" ")}
          >
            <FileText className="size-[1.125rem] shrink-0 opacity-80" strokeWidth={2} />
            报告生成
          </Link>

          <div className="pt-2">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">设置</p>
            <Link
              href="/settings/configuration"
              onClick={close}
              className={[
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                settingsConfigActive
                  ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80"
                  : "text-zinc-700 hover:bg-zinc-100",
              ].join(" ")}
            >
              <Settings2 className="size-[1.125rem] shrink-0 opacity-80" strokeWidth={2} />
              分类与领域
            </Link>
            <Link
              href="/settings/ai"
              onClick={close}
              className={[
                "mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                settingsAiActive
                  ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80"
                  : "text-zinc-700 hover:bg-zinc-100",
              ].join(" ")}
            >
              <Sparkles className="size-[1.125rem] shrink-0 opacity-80" strokeWidth={2} />
              大模型 API
            </Link>
            <Link
              href="/settings/global"
              onClick={close}
              className={[
                "mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                settingsGlobalActive
                  ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80"
                  : "text-zinc-700 hover:bg-zinc-100",
              ].join(" ")}
            >
              <SlidersHorizontal className="size-[1.125rem] shrink-0 opacity-80" strokeWidth={2} />
              全局配置
            </Link>
          </div>
        </nav>

        <div className="border-t border-zinc-100 p-3">
          {logoutError ? (
            <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              {logoutError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void onLogout()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-rose-50 hover:text-rose-900"
          >
            <LogOut className="size-[1.125rem] shrink-0 opacity-80" strokeWidth={2} />
            退出登录
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-emerald-100/80 bg-white/80 shadow-sm shadow-emerald-900/5 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-start gap-3 px-4 py-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200/80 bg-white text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50 hover:text-emerald-900"
          aria-label="打开菜单"
        >
          <Menu className="size-5" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm leading-relaxed text-zinc-600">{subtitle}</p> : null}
        </div>
        <div className="hidden shrink-0 items-center self-center rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 sm:inline-flex">
          WorkSprout
        </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
