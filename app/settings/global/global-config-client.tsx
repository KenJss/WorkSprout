"use client";

import { useEffect, useState } from "react";

import type { ReportTemplate } from "@/types";

type ConfigRow = { id: string; name: string; value: string };
type Payload = {
  project_categories: ConfigRow[];
  task_categories: ConfigRow[];
  task_domains: ConfigRow[];
  global_prompt: string;
  report_templates: ReportTemplate[];
};

function emptyRow(): ConfigRow {
  return { id: `row_${Date.now()}_${Math.random().toString(16).slice(2)}`, name: "", value: "" };
}

export function GlobalConfigClient() {
  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [data, setData] = useState<Payload>({
    project_categories: [],
    task_categories: [],
    task_domains: [],
    global_prompt: "",
    report_templates: [],
  });

  async function checkStatus() {
    setChecking(true);
    try {
      const res = await fetch("/api/global-config/status", { credentials: "include" });
      if (!res.ok) throw new Error("无法校验状态");
      const j = (await res.json()) as { unlocked?: boolean };
      setUnlocked(!!j.unlocked);
    } catch {
      setUnlocked(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void checkStatus();
  }, []);

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlockError(null);
    setUnlocking(true);
    try {
      const res = await fetch("/api/global-config/unlock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "验证失败");
      setUnlocked(true);
      setPassword("");
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "验证失败");
    } finally {
      setUnlocking(false);
    }
  }

  async function loadData() {
    setError(null);
    setOk(null);
    setLoading(true);
    try {
      const res = await fetch("/api/global-config", { credentials: "include" });
      const j = (await res.json()) as Partial<Payload> & { error?: string; code?: string };
      if (res.status === 403 && j.code === "UNLOCK_REQUIRED") {
        setUnlocked(false);
        throw new Error("会话已失效，请重新验证密码。");
      }
      if (!res.ok) throw new Error(j.error ?? "加载失败");
      setData({
        project_categories: Array.isArray(j.project_categories) ? j.project_categories : [],
        task_categories: Array.isArray(j.task_categories) ? j.task_categories : [],
        task_domains: Array.isArray(j.task_domains) ? j.task_domains : [],
        global_prompt: typeof j.global_prompt === "string" ? j.global_prompt : "",
        report_templates: Array.isArray(j.report_templates) ? j.report_templates : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!unlocked) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  async function onSave() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/global-config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "保存失败");
      setOk("保存成功");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onLock() {
    await fetch("/api/global-config/lock", { method: "POST", credentials: "include" });
    setUnlocked(false);
    setData({
      project_categories: [],
      task_categories: [],
      task_domains: [],
      global_prompt: "",
      report_templates: [],
    });
  }

  if (checking) {
    return <div className="px-4 py-10 text-sm text-zinc-600">校验中...</div>;
  }

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white/90 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">全局配置</h2>
          <p className="mt-1 text-sm text-zinc-600">
            请输入管理员密码以继续（默认密码为 <code className="rounded bg-zinc-100 px-1 text-xs">admin</code>
            ，可通过环境变量 <code className="rounded bg-zinc-100 px-1 text-xs">GLOBAL_CONFIG_PASSWORD</code>{" "}
            修改）。
          </p>
          {unlockError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {unlockError}
            </div>
          ) : null}
          <form onSubmit={onUnlock} className="mt-4 space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="管理员密码"
              className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm"
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={unlocking}
              className="h-10 w-full rounded-lg bg-zinc-900 text-sm font-medium text-white disabled:opacity-50"
            >
              {unlocking ? "验证中..." : "进入全局配置"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="px-4 py-10 text-sm text-zinc-600">加载配置中...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600">
          维护全局分类、领域、默认提示词与报告模板。保存需要{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">SUPABASE_SERVICE_ROLE_KEY</code>。
        </p>
        <button
          type="button"
          onClick={() => void onLock()}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          锁定并退出
        </button>
      </div>
      {error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {ok ? <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div> : null}

      <section className="mb-4 rounded-lg border border-zinc-200 bg-white/80 p-3">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">全局项目分类</h2>
        {data.project_categories.map((row, i) => (
          <div key={row.id} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_72px]">
            <input
              value={row.name}
              onChange={(e) =>
                setData((p) => ({
                  ...p,
                  project_categories: p.project_categories.map((x, idx) =>
                    idx === i ? { ...x, name: e.target.value } : x
                  ),
                }))
              }
              placeholder="名称"
              className="h-9 rounded-md border border-zinc-200 px-2 text-sm"
            />
            <input
              value={row.value}
              onChange={(e) =>
                setData((p) => ({
                  ...p,
                  project_categories: p.project_categories.map((x, idx) =>
                    idx === i ? { ...x, value: e.target.value } : x
                  ),
                }))
              }
              placeholder="排序 value"
              className="h-9 rounded-md border border-zinc-200 px-2 text-sm"
            />
            <button
              type="button"
              onClick={() =>
                setData((p) => ({
                  ...p,
                  project_categories: p.project_categories.filter((_, idx) => idx !== i),
                }))
              }
              className="h-9 rounded-md border border-rose-200 text-xs text-rose-700"
            >
              删除
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setData((p) => ({ ...p, project_categories: [...p.project_categories, emptyRow()] }))}
          className="h-8 rounded-md border border-zinc-200 px-2 text-xs"
        >
          新增
        </button>
      </section>

      <section className="mb-4 rounded-lg border border-zinc-200 bg-white/80 p-3">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">全局任务分类</h2>
        {data.task_categories.map((row, i) => (
          <div key={row.id} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_72px]">
            <input
              value={row.name}
              onChange={(e) =>
                setData((p) => ({
                  ...p,
                  task_categories: p.task_categories.map((x, idx) =>
                    idx === i ? { ...x, name: e.target.value } : x
                  ),
                }))
              }
              placeholder="名称"
              className="h-9 rounded-md border border-zinc-200 px-2 text-sm"
            />
            <input
              value={row.value}
              onChange={(e) =>
                setData((p) => ({
                  ...p,
                  task_categories: p.task_categories.map((x, idx) =>
                    idx === i ? { ...x, value: e.target.value } : x
                  ),
                }))
              }
              placeholder="排序 value"
              className="h-9 rounded-md border border-zinc-200 px-2 text-sm"
            />
            <button
              type="button"
              onClick={() =>
                setData((p) => ({
                  ...p,
                  task_categories: p.task_categories.filter((_, idx) => idx !== i),
                }))
              }
              className="h-9 rounded-md border border-rose-200 text-xs text-rose-700"
            >
              删除
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setData((p) => ({ ...p, task_categories: [...p.task_categories, emptyRow()] }))}
          className="h-8 rounded-md border border-zinc-200 px-2 text-xs"
        >
          新增
        </button>
      </section>

      <section className="mb-4 rounded-lg border border-zinc-200 bg-white/80 p-3">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">全局任务领域</h2>
        {data.task_domains.map((row, i) => (
          <div key={row.id} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_72px]">
            <input
              value={row.name}
              onChange={(e) =>
                setData((p) => ({
                  ...p,
                  task_domains: p.task_domains.map((x, idx) =>
                    idx === i ? { ...x, name: e.target.value } : x
                  ),
                }))
              }
              placeholder="名称"
              className="h-9 rounded-md border border-zinc-200 px-2 text-sm"
            />
            <input
              value={row.value}
              onChange={(e) =>
                setData((p) => ({
                  ...p,
                  task_domains: p.task_domains.map((x, idx) =>
                    idx === i ? { ...x, value: e.target.value } : x
                  ),
                }))
              }
              placeholder="排序 value"
              className="h-9 rounded-md border border-zinc-200 px-2 text-sm"
            />
            <button
              type="button"
              onClick={() =>
                setData((p) => ({
                  ...p,
                  task_domains: p.task_domains.filter((_, idx) => idx !== i),
                }))
              }
              className="h-9 rounded-md border border-rose-200 text-xs text-rose-700"
            >
              删除
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setData((p) => ({ ...p, task_domains: [...p.task_domains, emptyRow()] }))}
          className="h-8 rounded-md border border-zinc-200 px-2 text-xs"
        >
          新增
        </button>
      </section>

      <section className="mb-4 rounded-lg border border-zinc-200 bg-white/80 p-3">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">默认全局提示词（ai_prompt_defaults）</h2>
        <textarea
          value={data.global_prompt}
          onChange={(e) => setData((p) => ({ ...p, global_prompt: e.target.value }))}
          rows={10}
          className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
        />
      </section>

      <section className="mb-4 rounded-lg border border-zinc-200 bg-white/80 p-3">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">默认报告模板</h2>
        {data.report_templates.map((tpl, i) => (
          <div key={tpl.id} className="mb-3 rounded-md border border-zinc-200 p-2">
            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_72px]">
              <input
                value={tpl.name}
                onChange={(e) =>
                  setData((p) => ({
                    ...p,
                    report_templates: p.report_templates.map((x, idx) =>
                      idx === i ? { ...x, name: e.target.value } : x
                    ),
                  }))
                }
                placeholder="模板名称"
                className="h-9 rounded-md border border-zinc-200 px-2 text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  setData((p) => ({
                    ...p,
                    report_templates: p.report_templates.filter((_, idx) => idx !== i),
                  }))
                }
                className="h-9 rounded-md border border-rose-200 text-xs text-rose-700"
              >
                删除
              </button>
            </div>
            <textarea
              value={tpl.prompt}
              onChange={(e) =>
                setData((p) => ({
                  ...p,
                  report_templates: p.report_templates.map((x, idx) =>
                    idx === i ? { ...x, prompt: e.target.value } : x
                  ),
                }))
              }
              rows={4}
              className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setData((p) => ({
              ...p,
              report_templates: [...p.report_templates, { id: `tpl_${Date.now()}`, name: "新模板", prompt: "" }],
            }))
          }
          className="h-8 rounded-md border border-zinc-200 px-2 text-xs"
        >
          新增报告模板
        </button>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存全局配置"}
        </button>
        <button
          type="button"
          onClick={() => void loadData()}
          className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm"
        >
          重新加载
        </button>
      </div>
    </div>
  );
}
