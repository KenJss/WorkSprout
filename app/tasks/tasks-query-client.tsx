"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

import { supabase } from "@/lib/supabase/client";
import { fetchMergedConfigRows } from "@/lib/supabase/merged-config";
import type { Project, Task, TaskCategory, TaskDomain, TaskStatus } from "@/types";

const TASK_STATUSES: TaskStatus[] = ["待办", "进行中", "已完成"];
type ColumnKey =
  | "title"
  | "project"
  | "status"
  | "category"
  | "domain"
  | "start_at"
  | "end_at"
  | "submitter"
  | "remark"
  | "description"
  | "handling_notes";

function fmt(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function toTime(value: string | null | undefined) {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isNaN(n) ? 0 : n;
}

function projectPathMap(projects: Project[]) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const memo = new Map<string, string>();
  const getPath = (id: string): string => {
    if (memo.has(id)) return memo.get(id)!;
    const cur = byId.get(id);
    if (!cur) return "—";
    if (!cur.parent_id) {
      memo.set(id, cur.name);
      return cur.name;
    }
    const path = `${getPath(cur.parent_id)} / ${cur.name}`;
    memo.set(id, path);
    return path;
  };
  for (const p of projects) getPath(p.id);
  return memo;
}

export function TasksQueryClient() {
  const sp = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  const [taskDomains, setTaskDomains] = useState<TaskDomain[]>([]);

  const [kw, setKw] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [domainId, setDomainId] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [startTo, setStartTo] = useState("");
  const [sortKey, setSortKey] = useState<
    "title" | "project" | "status" | "category" | "domain" | "start_at" | "end_at" | "description" | "handling_notes"
  >("start_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [resizingCol, setResizingCol] = useState<ColumnKey | null>(null);
  const dragRef = useRef<{ key: ColumnKey; startX: number; startWidth: number } | null>(null);
  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>({
    title: 260,
    project: 260,
    status: 100,
    category: 120,
    domain: 120,
    start_at: 120,
    end_at: 120,
    submitter: 120,
    remark: 180,
    description: 320,
    handling_notes: 320,
  });

  useEffect(() => {
    setProjectId(sp.get("project_id") ?? "");
    setStatus(sp.get("status") ?? "");
  }, [sp]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error("请先登录");

        const userId = userData.user.id;
        const [projRes, taskRes, cats, domains] = await Promise.all([
          supabase.from("projects").select("id,parent_id,name,category_id,start_at,end_at,status"),
          supabase
            .from("tasks")
            .select("id,project_id,title,description,handling_notes,submitter,remark,domain_id,category_id,status,start_at,end_at,custom_attributes,created_at"),
          fetchMergedConfigRows<TaskCategory>(supabase, "task_categories", userId),
          fetchMergedConfigRows<TaskDomain>(supabase, "task_domains", userId),
        ]);

        if (projRes.error) throw projRes.error;
        if (taskRes.error) throw taskRes.error;
        if (cancelled) return;

        setProjects((projRes.data ?? []) as Project[]);
        setTasks((taskRes.data ?? []) as Task[]);
        setTaskCategories(cats);
        setTaskDomains(domains);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const projectNameMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const projectPathById = useMemo(() => projectPathMap(projects), [projects]);
  const categoryNameMap = useMemo(() => new Map(taskCategories.map((c) => [c.id, c.name])), [taskCategories]);
  const domainNameMap = useMemo(() => new Map(taskDomains.map((d) => [d.id, d.name])), [taskDomains]);

  const filteredProjectOptions = useMemo(() => {
    const k = projectSearch.trim().toLowerCase();
    if (!k) return projects;
    return projects.filter((p) => (projectPathById.get(p.id) ?? p.name).toLowerCase().includes(k));
  }, [projects, projectPathById, projectSearch]);

  function onSort(
    key: "title" | "project" | "status" | "category" | "domain" | "start_at" | "end_at" | "description" | "handling_notes"
  ) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "start_at" || key === "end_at" ? "desc" : "asc");
  }

  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return tasks
      .filter((t) => (projectId ? t.project_id === projectId : true))
      .filter((t) => (status ? t.status === status : true))
      .filter((t) => (categoryId ? t.category_id === categoryId : true))
      .filter((t) => (domainId ? t.domain_id === domainId : true))
      .filter((t) => {
        if (!startFrom && !startTo) return true;
        const n = toTime(t.start_at);
        if (!n) return false;
        if (startFrom && n < toTime(startFrom)) return false;
        if (startTo && n > toTime(`${startTo}T23:59:59`)) return false;
        return true;
      })
      .filter((t) => {
        if (!k) return true;
        return [t.title, t.description, t.handling_notes ?? "", projectPathById.get(t.project_id) ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(k);
      })
      .sort((a, b) => {
        const projA = projectPathById.get(a.project_id) ?? "";
        const projB = projectPathById.get(b.project_id) ?? "";
        const catA = categoryNameMap.get(a.category_id) ?? "";
        const catB = categoryNameMap.get(b.category_id) ?? "";
        const domA = domainNameMap.get(a.domain_id) ?? "";
        const domB = domainNameMap.get(b.domain_id) ?? "";

        const dir = sortDir === "asc" ? 1 : -1;
        let cmp = 0;
        if (sortKey === "start_at") cmp = toTime(a.start_at) - toTime(b.start_at);
        else if (sortKey === "end_at") cmp = toTime(a.end_at) - toTime(b.end_at);
        else if (sortKey === "title") cmp = (a.title ?? "").localeCompare(b.title ?? "");
        else if (sortKey === "project") cmp = projA.localeCompare(projB);
        else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
        else if (sortKey === "category") cmp = catA.localeCompare(catB);
        else if (sortKey === "domain") cmp = domA.localeCompare(domB);
        else if (sortKey === "description") cmp = (a.description ?? "").localeCompare(b.description ?? "");
        else if (sortKey === "handling_notes") cmp = (a.handling_notes ?? "").localeCompare(b.handling_notes ?? "");
        if (cmp !== 0) return cmp * dir;
        return (toTime(a.start_at) - toTime(b.start_at)) * -1;
      });
  }, [
    tasks,
    projectId,
    status,
    categoryId,
    domainId,
    startFrom,
    startTo,
    kw,
    projectPathById,
    categoryNameMap,
    domainNameMap,
    sortDir,
    sortKey,
  ]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length, pageSize]);
  const pagedRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [kw, projectId, projectSearch, status, categoryId, domainId, startFrom, startTo, pageSize, sortDir, sortKey]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    if (!resizingCol) return;
    const onMove = (e: MouseEvent) => {
      const meta = dragRef.current;
      if (!meta) return;
      const next = Math.max(80, meta.startWidth + (e.clientX - meta.startX));
      setColWidths((prev) => ({ ...prev, [meta.key]: next }));
    };
    const onUp = () => {
      dragRef.current = null;
      setResizingCol(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizingCol]);

  function startResize(key: ColumnKey, event: React.MouseEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { key, startX: event.clientX, startWidth: colWidths[key] };
    setResizingCol(key);
  }

  const tableMinWidth = useMemo(
    () => Object.values(colWidths).reduce((sum, w) => sum + w, 0),
    [colWidths]
  );

  function exportExcel() {
    const rows = filtered.map((t) => ({
      标题: t.title || "未命名任务",
      项目路径: projectPathById.get(t.project_id) ?? projectNameMap.get(t.project_id) ?? "—",
      状态: t.status,
      任务类型: categoryNameMap.get(t.category_id) ?? "—",
      领域: domainNameMap.get(t.domain_id) ?? "—",
      开始时间: fmt(t.start_at),
      结束时间: fmt(t.end_at),
      提交人: t.submitter || "",
      备注: t.remark || "",
      问题描述: t.description || "",
      处理说明: t.handling_notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "任务查询");
    XLSX.writeFile(wb, `任务查询_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (loading) return <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-zinc-600">加载中...</div>;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 bg-white/80 p-3 md:grid-cols-2 lg:grid-cols-4">
        <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="关键词（标题/描述/说明）" className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm" />
        <input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="搜索项目路径（父 / 子 / 末级）" className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm" />
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm">
          <option value="">全部项目</option>
          {filteredProjectOptions.map((p) => (
            <option key={p.id} value={p.id}>{projectPathById.get(p.id) ?? p.name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm">
          <option value="">全部状态</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm">
          <option value="">全部任务类型</option>
          {taskCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm">
          <option value="">全部领域</option>
          {taskDomains.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <input type="date" value={startFrom} onChange={(e) => setStartFrom(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm" />
        <input type="date" value={startTo} onChange={(e) => setStartTo(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm" />
        <button type="button" onClick={() => { setKw(""); setProjectId(""); setProjectSearch(""); setStatus(""); setCategoryId(""); setDomainId(""); setStartFrom(""); setStartTo(""); }} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">重置筛选</button>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-zinc-600">
          共 {filtered.length} 条任务，当前第 {page}/{pageCount} 页
        </div>
        <div className="flex items-center gap-2">
          <select
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs"
          >
            <option value="10">10 / 页</option>
            <option value="20">20 / 页</option>
            <option value="50">50 / 页</option>
            <option value="100">100 / 页</option>
          </select>
          <button
            type="button"
            onClick={exportExcel}
            className="h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          >
            导出 Excel
          </button>
        </div>
      </div>
      <div className="max-h-[68vh] overflow-auto rounded-xl border border-zinc-200 bg-white/90">
        {filtered.length === 0 ? (
          <div className="p-4 text-sm text-zinc-600">无匹配任务</div>
        ) : (
          <table className="w-full border-collapse text-xs" style={{ minWidth: tableMinWidth }}>
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.title }}>
                  <button type="button" onClick={() => onSort("title")} className="hover:text-zinc-900">标题</button>
                  <span onMouseDown={(e) => startResize("title", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" />
                </th>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.project }}><button type="button" onClick={() => onSort("project")} className="hover:text-zinc-900">项目路径</button><span onMouseDown={(e) => startResize("project", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" /></th>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.status }}><button type="button" onClick={() => onSort("status")} className="hover:text-zinc-900">状态</button><span onMouseDown={(e) => startResize("status", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" /></th>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.category }}><button type="button" onClick={() => onSort("category")} className="hover:text-zinc-900">任务类型</button><span onMouseDown={(e) => startResize("category", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" /></th>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.domain }}><button type="button" onClick={() => onSort("domain")} className="hover:text-zinc-900">领域</button><span onMouseDown={(e) => startResize("domain", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" /></th>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.start_at }}><button type="button" onClick={() => onSort("start_at")} className="hover:text-zinc-900">开始时间</button><span onMouseDown={(e) => startResize("start_at", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" /></th>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.end_at }}><button type="button" onClick={() => onSort("end_at")} className="hover:text-zinc-900">结束时间</button><span onMouseDown={(e) => startResize("end_at", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" /></th>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.submitter }}>提交人<span onMouseDown={(e) => startResize("submitter", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" /></th>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.remark }}>备注<span onMouseDown={(e) => startResize("remark", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" /></th>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.description }}><button type="button" onClick={() => onSort("description")} className="hover:text-zinc-900">问题描述</button><span onMouseDown={(e) => startResize("description", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" /></th>
                <th className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-semibold relative" style={{ width: colWidths.handling_notes }}><button type="button" onClick={() => onSort("handling_notes")} className="hover:text-zinc-900">处理说明</button><span onMouseDown={(e) => startResize("handling_notes", e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" /></th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer align-top odd:bg-white even:bg-zinc-50/50 hover:bg-emerald-50/40"
                  onClick={() => setDetailTask(t)}
                >
                  <td className="border-b border-zinc-100 px-2 py-2 text-sm font-semibold text-zinc-900" title={t.title || "未命名任务"} style={{ width: colWidths.title, maxWidth: colWidths.title }}>
                    <div
                      className="whitespace-nowrap text-ellipsis overflow-hidden"
                    >
                      {t.title || "未命名任务"}
                    </div>
                  </td>
                  <td className="border-b border-zinc-100 px-2 py-2 text-zinc-700 whitespace-nowrap text-ellipsis overflow-hidden" style={{ width: colWidths.project, maxWidth: colWidths.project }}>
                    {projectPathById.get(t.project_id) ?? projectNameMap.get(t.project_id) ?? "—"}
                  </td>
                  <td className="border-b border-zinc-100 px-2 py-2 text-zinc-700 whitespace-nowrap" style={{ width: colWidths.status, maxWidth: colWidths.status }}>{t.status}</td>
                  <td className="border-b border-zinc-100 px-2 py-2 text-zinc-700 whitespace-nowrap" style={{ width: colWidths.category, maxWidth: colWidths.category }}>{categoryNameMap.get(t.category_id) ?? "—"}</td>
                  <td className="border-b border-zinc-100 px-2 py-2 text-zinc-700 whitespace-nowrap" style={{ width: colWidths.domain, maxWidth: colWidths.domain }}>{domainNameMap.get(t.domain_id) ?? "—"}</td>
                  <td className="border-b border-zinc-100 px-2 py-2 text-zinc-700 whitespace-nowrap" style={{ width: colWidths.start_at, maxWidth: colWidths.start_at }}>{fmt(t.start_at)}</td>
                  <td className="border-b border-zinc-100 px-2 py-2 text-zinc-700 whitespace-nowrap" style={{ width: colWidths.end_at, maxWidth: colWidths.end_at }}>{fmt(t.end_at)}</td>
                  <td className="border-b border-zinc-100 px-2 py-2 text-zinc-700 whitespace-nowrap text-ellipsis overflow-hidden" style={{ width: colWidths.submitter, maxWidth: colWidths.submitter }}>{t.submitter || "—"}</td>
                  <td className="border-b border-zinc-100 px-2 py-2 text-zinc-700 whitespace-nowrap text-ellipsis overflow-hidden" style={{ width: colWidths.remark, maxWidth: colWidths.remark }}>{t.remark || "—"}</td>
                  <td className="border-b border-zinc-100 px-2 py-2 text-zinc-700" style={{ width: colWidths.description, maxWidth: colWidths.description }}>
                    <div
                      className="whitespace-nowrap text-ellipsis overflow-hidden"
                      title={t.description || ""}
                    >
                      {t.description || "—"}
                    </div>
                  </td>
                  <td className="border-b border-zinc-100 px-2 py-2 text-zinc-700" style={{ width: colWidths.handling_notes, maxWidth: colWidths.handling_notes }}>
                    <div
                      className="whitespace-nowrap text-ellipsis overflow-hidden"
                      title={t.handling_notes || ""}
                    >
                      {t.handling_notes || "—"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPage(1)}
            disabled={page <= 1}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs disabled:opacity-40"
          >
            首页
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs disabled:opacity-40"
          >
            上一页
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs disabled:opacity-40"
          >
            下一页
          </button>
          <button
            type="button"
            onClick={() => setPage(pageCount)}
            disabled={page >= pageCount}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs disabled:opacity-40"
          >
            末页
          </button>
        </div>
      ) : null}

      {detailTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/35 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-zinc-900">{detailTask.title || "未命名任务"}</h3>
              <button
                type="button"
                onClick={() => setDetailTask(null)}
                className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                关闭
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm text-zinc-700 md:grid-cols-2">
              <div>项目路径：{projectPathById.get(detailTask.project_id) ?? "—"}</div>
              <div>状态：{detailTask.status}</div>
              <div>任务类型：{categoryNameMap.get(detailTask.category_id) ?? "—"}</div>
              <div>领域：{domainNameMap.get(detailTask.domain_id) ?? "—"}</div>
              <div>开始时间：{fmt(detailTask.start_at)}</div>
              <div>结束时间：{fmt(detailTask.end_at)}</div>
              <div>提交人：{detailTask.submitter || "—"}</div>
              <div>备注：{detailTask.remark || "—"}</div>
            </div>
            <div className="mt-3 rounded-lg border border-zinc-200 p-3">
              <div className="mb-1 text-xs font-semibold text-zinc-500">问题描述</div>
              <div className="whitespace-pre-wrap text-sm text-zinc-800">{detailTask.description || "—"}</div>
            </div>
            <div className="mt-3 rounded-lg border border-zinc-200 p-3">
              <div className="mb-1 text-xs font-semibold text-zinc-500">处理说明</div>
              <div className="whitespace-pre-wrap text-sm text-zinc-800">{detailTask.handling_notes || "—"}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <Link href="/" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">返回工作台</Link>
      </div>
    </div>
  );
}
