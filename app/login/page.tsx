"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type AuthMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [redirectTo, setRedirectTo] = useState("/");

  useEffect(() => {
    // Avoid useSearchParams() which requires Suspense in Next.js.
    const params = new URLSearchParams(window.location.search);
    setRedirectTo(params.get("redirect") ?? "/");
  }, []);

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const emailTrimmed = email.trim();
    if (!emailTrimmed) return setError("请输入邮箱。");
    if (!password) return setError("请输入密码。");

    setSubmitting(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });
        if (error) throw error;

        // Usually session exists immediately unless email confirmation is required.
        if (data.session) {
          router.replace(redirectTo);
        } else {
          // Fallback: allow navigating back even if session is null.
          router.replace(redirectTo);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
          options: {
            // Keeps it simple: redirect back to the app root after confirmation.
            // If your Supabase project requires email confirmation, session may be null.
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;

        if (data.session) {
          router.replace(redirectTo);
        } else {
          setInfo(
            "注册成功。如果启用了邮箱验证，请先确认邮箱后再登录。"
          );
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "身份验证失败。";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10 bg-background text-foreground">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white/70 p-6 shadow-sm backdrop-blur dark:bg-black/40">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">
            {mode === "login" ? "登录" : "注册"}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            使用邮箱和密码继续。
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
            {info}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              邮箱
            </label>
            <input
              id="email"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 dark:border-zinc-800 dark:bg-black"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              密码
            </label>
            <input
              id="password"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 dark:border-zinc-800 dark:bg-black"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting
              ? mode === "login"
                ? "登录中..."
                : "注册中..."
              : mode === "login"
                ? "登录"
                : "创建账号"}
          </button>
        </form>

        <div className="mt-5 text-center text-sm">
          {mode === "login" ? (
            <>
              还没有账号？{" "}
              <button
                type="button"
                className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50"
                onClick={() => {
                  setMode("register");
                  setError(null);
                  setInfo(null);
                }}
              >
                注册
              </button>
            </>
          ) : (
            <>
              已有账号？{" "}
              <button
                type="button"
                className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setInfo(null);
                }}
              >
                登录
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

