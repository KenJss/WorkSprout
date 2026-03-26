"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import type { ConfigTableName } from "@/lib/supabase/merged-config";

type Row = { id: string; name: string; value: string };

function ConfigBlock({
  table,
  label,
  description,
}: {
  table: ConfigTableName;
  label: string;
  description: string;
}) {
  const router = useRouter();
  const [globalRows, setGlobalRows] = useState<Row[]>([]);
  const [userRows, setUserRows] = useState<Row[]>([]);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; value: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      router.replace("/login");
      return;
    }
    const uid = userData.user.id;
    const ord = { ascending: true } as const;
    const [g, u] = await Promise.all([
      supabase.from(table).select("id,name,value").eq("scope", "global").order("value", ord).order("name", ord),
      supabase
        .from(table)
        .select("id,name,value")
        .eq("scope", "user")
        .eq("user_id", uid)
        .order("value", ord)
        .order("name", ord),
    ]);
    if (g.error) {
      setError(g.error.message);
      setLoading(false);
      return;
    }
    if (u.error) {
      setError(u.error.message);
      setLoading(false);
      return;
    }
    setGlobalRows((g.data ?? []) as Row[]);
    setUserRows((u.data ?? []) as Row[]);
    setLoading(false);
  }, [router, table]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }
      const value = newValue.trim() || name;
      const { error: insErr } = await supabase.from(table).insert({
        scope: "user",
        user_id: userData.user.id,
        name,
        value,
      });
      if (insErr) throw insErr;
      setNewName("");
      setNewValue("");
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("确定删除此项？若已被任务/项目引用，可能需先解除引用。")) return;
    setBusy(true);
    setError(null);
    try {
      const { error: delErr } = await supabase.from(table).delete().eq("id", id);
      if (delErr) throw delErr;
      setEditing((e) => (e?.id === id ? null : e));
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    const value = editing.value.trim() || name;
    setBusy(true);
    setError(null);
    try {
      const { error: upErr } = await supabase.from(table).update({ name, value }).eq("id", editing.id);
      if (upErr) throw upErr;
      setEditing(null);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">{label}</h2>
      <p className="mt-1 text-xs text-zinc-600">{description}</p>

      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">加载中...</p>
      ) : (
        <>
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-zinc-500">全局</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              由管理员在 Supabase SQL 中维护；应用内不可改删。
            </p>
            {globalRows.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-400">暂无全局项</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-100">
                {globalRows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-zinc-800">{r.name}</span>
                      <span className="ml-2 font-mono text-[11px] text-zinc-400" title="排序值">
                        {r.value}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-zinc-400">只读</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-xs font-semibold text-zinc-500">我的配置</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">仅自己可见、可增删改。</p>

            <form onSubmit={onAdd} className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] flex-1">
                <label className="mb-0.5 block text-[11px] text-zinc-500" htmlFor={`add-name-${table}`}>
                  名称
                </label>
                <input
                  id={`add-name-${table}`}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="显示名称"
                  className="h-9 w-full rounded-md border border-zinc-200 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/15"
                  disabled={busy}
                />
              </div>
              <div className="min-w-[8rem] flex-1">
                <label className="mb-0.5 block text-[11px] text-zinc-500" htmlFor={`add-value-${table}`}>
                  排序值（可选）
                </label>
                <input
                  id={`add-value-${table}`}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="默认同名称"
                  className="h-9 w-full rounded-md border border-zinc-200 px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/15"
                  disabled={busy}
                />
              </div>
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="h-9 shrink-0 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
              >
                添加
              </button>
            </form>

            {userRows.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-400">暂无个人项</p>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-100">
                {userRows.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    {editing?.id === r.id ? (
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          placeholder="名称"
                          className="h-8 min-w-0 flex-1 rounded-md border border-zinc-200 px-2 text-sm"
                          disabled={busy}
                        />
                        <input
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          placeholder="排序值"
                          className="h-8 min-w-[6rem] flex-1 rounded-md border border-zinc-200 px-2 font-mono text-sm sm:max-w-[10rem]"
                          disabled={busy}
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => void onSaveEdit()}
                            disabled={busy}
                            className="h-8 rounded-md bg-zinc-900 px-2 text-xs font-medium text-white"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            disabled={busy}
                            className="h-8 rounded-md border border-zinc-200 px-2 text-xs"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm text-zinc-800">{r.name}</span>
                          <span className="ml-2 font-mono text-[11px] text-zinc-400">{r.value}</span>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing({ id: r.id, name: r.name, value: r.value })}
                            disabled={busy}
                            className="h-8 rounded-md border border-zinc-200 px-2 text-xs text-zinc-700 hover:bg-zinc-50"
                          >
                            重命名
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDelete(r.id)}
                            disabled={busy}
                            className="h-8 rounded-md border border-rose-200 bg-rose-50 px-2 text-xs text-rose-800 hover:bg-rose-100"
                          >
                            删除
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function ConfigurationClient() {
  const [tab, setTab] = useState<ConfigTableName>("project_categories");

  const tabs: { id: ConfigTableName; label: string }[] = [
    { id: "project_categories", label: "项目分类" },
    { id: "task_categories", label: "任务分类" },
    { id: "task_domains", label: "领域" },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "project_categories" ? (
        <ConfigBlock
          table="project_categories"
          label="项目分类"
          description="用于新建/编辑项目时的分类下拉框。列表按「排序值」再按名称排列；可用 01、02 等控制顺序。"
        />
      ) : null}
      {tab === "task_categories" ? (
        <ConfigBlock
          table="task_categories"
          label="任务分类"
          description="用于任务表单中的任务分类。列表按「排序值」再按名称排列。"
        />
      ) : null}
      {tab === "task_domains" ? (
        <ConfigBlock
          table="task_domains"
          label="领域"
          description="用于任务表单中的领域选择。列表按「排序值」再按名称排列。"
        />
      ) : null}
    </div>
  );
}
