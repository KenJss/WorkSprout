"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import type { Project, ProjectStatus } from "@/types";

const PROJECT_STATUSES: ProjectStatus[] = ["待开始", "进行中", "暂停", "已结束", "已取消"];

export type ProjectCategoryRow = { id: string; name: string; value: string };

type ProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** 编辑模式下为当前项目；创建模式为 null */
  editingProject: Project | null;
  projects: Project[];
  projectCategories: ProjectCategoryRow[];
  /** 保存成功后刷新列表；传入要保持选中的项目 id（新建 = 新项目 id） */
  onComplete: (opts?: { selectProjectId?: string }) => void | Promise<void>;
};

function formatSaveError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message: string }).message);
    const details = (err as { details?: string }).details;
    const hint = (err as { hint?: string }).hint;
    return [msg, details, hint].filter(Boolean).join(" — ");
  }
  if (err instanceof Error) return err.message;
  return "保存失败。";
}

function toInputDateValue(value: string | null) {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 直属及间接子项目 id（不含 root 自身） */
function collectDescendantIds(rootId: string, allProjects: Project[]): Set<string> {
  const byParent = new Map<string | null, Project[]>();
  for (const p of allProjects) {
    const k = p.parent_id;
    const arr = byParent.get(k) ?? [];
    arr.push(p);
    byParent.set(k, arr);
  }
  const out = new Set<string>();
  const walk = (id: string) => {
    const kids = byParent.get(id) ?? [];
    for (const c of kids) {
      out.add(c.id);
      walk(c.id);
    }
  };
  walk(rootId);
  return out;
}

export function ProjectDialog({
  open,
  onOpenChange,
  mode,
  editingProject,
  projects,
  projectCategories,
  onComplete,
}: ProjectDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("待开始");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const defaultCat = projectCategories[0]?.id ?? "";
    if (mode === "edit" && editingProject) {
      setName(editingProject.name);
      setParentId(editingProject.parent_id ?? "");
      setCategoryId(editingProject.category_id || defaultCat);
      setStartAt(toInputDateValue(editingProject.start_at));
      setEndAt(
        editingProject.status === "已结束"
          ? toInputDateValue(editingProject.end_at) || todayLocalISODate()
          : ""
      );
      setStatus(editingProject.status);
    } else {
      setName("");
      setParentId("");
      setCategoryId(defaultCat);
      setStartAt(todayLocalISODate());
      setEndAt("");
      setStatus("待开始");
    }
  }, [open, mode, editingProject, projectCategories]);

  const excludedParentIds = useMemo(() => {
    if (mode !== "edit" || !editingProject) return new Set<string>();
    const descendants = collectDescendantIds(editingProject.id, projects);
    descendants.add(editingProject.id);
    return descendants;
  }, [mode, editingProject, projects]);

  const parentOptions = [...projects]
    .filter((p) => !excludedParentIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError("请输入项目名称。");

    const resolvedCategoryId = categoryId || projectCategories[0]?.id;
    if (!resolvedCategoryId) {
      return setError("请先在「分类与领域」中配置项目分类。");
    }

    let endFinal: string | null = null;
    if (status === "已结束") {
      endFinal = endAt ? endAt : todayLocalISODate();
    }

    if (startAt && endFinal) {
      const s = new Date(startAt).getTime();
      const t = new Date(endFinal).getTime();
      if (!Number.isNaN(s) && !Number.isNaN(t) && s > t) {
        return setError("开始日期不能晚于结束日期。");
      }
    }

    setSubmitting(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      const row = {
        name: trimmed,
        parent_id: parentId ? parentId : null,
        category_id: resolvedCategoryId,
        start_at: startAt ? startAt : null,
        end_at: endFinal,
        status,
      };

      if (mode === "create") {
        const { data, error: insertErr } = await supabase.from("projects").insert(row).select("id").single();
        if (insertErr) throw insertErr;
        const insertedId = data?.id ? String(data.id) : null;
        if (!insertedId) throw new Error("创建成功但未返回项目 id。");
        await Promise.resolve(onComplete({ selectProjectId: insertedId }));
        onOpenChange(false);
      } else {
        if (!editingProject) throw new Error("未选择要编辑的项目。");
        const { error: upErr } = await supabase.from("projects").update(row).eq("id", editingProject.id);
        if (upErr) throw upErr;
        await Promise.resolve(onComplete({ selectProjectId: editingProject.id }));
        onOpenChange(false);
      }
    } catch (err) {
      setError(formatSaveError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "create" ? "新建项目" : "编辑项目";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-[3px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[95vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-2xl shadow-zinc-900/15 outline-none">
          <Dialog.Title className="border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-white px-6 py-4 text-lg font-semibold tracking-tight text-zinc-900">
            {title}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {mode === "create" ? "填写项目信息后点击保存创建项目。" : "修改项目信息后点击保存。"}
          </Dialog.Description>
          <p className="border-b border-zinc-100 px-6 py-3 text-sm leading-relaxed text-zinc-600">
            {mode === "create"
              ? "新建的项目在尚无子项目时为末级；选中后在顶部「新建任务」即可添加任务。"
              : "修改名称、层级、分类与时间；删除项目请在列表中使用「删除」。"}
          </p>

          <div className="max-h-[calc(90vh-11rem)] overflow-y-auto px-6 py-4">
            {error ? (
              <div className="mb-4 rounded-lg border border-red-200/80 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <form id="project-form-dialog" onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900" htmlFor="project-name">
                项目名称
              </label>
              <input
                id="project-name"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 text-sm outline-none transition-colors focus:border-emerald-400/60 focus:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/25"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：移动端迭代"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900" htmlFor="project-parent">
                上级项目（可选）
              </label>
              <select
                id="project-parent"
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">无（作为根项目）</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900" htmlFor="project-category">
                项目分类
              </label>
              {projectCategories.length === 0 ? (
                <p className="text-xs text-zinc-500">暂无分类，请先在「分类与领域」或 SQL 中配置全局项目分类。</p>
              ) : (
                <select
                  id="project-category"
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                  value={categoryId || projectCategories[0]?.id}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  {projectCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900" htmlFor="project-status">
                状态
              </label>
              <select
                id="project-status"
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                value={status}
                onChange={(e) => {
                  const v = e.target.value as ProjectStatus;
                  setStatus(v);
                  if (v === "已结束") {
                    setEndAt((prev) => prev || todayLocalISODate());
                  } else {
                    setEndAt("");
                  }
                }}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-900" htmlFor="project-start">
                  开始日期
                </label>
                <input
                  id="project-start"
                  type="date"
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-900" htmlFor="project-end">
                  结束日期
                </label>
                <input
                  id="project-end"
                  type="date"
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  disabled={status !== "已结束"}
                />
              </div>
            </div>

            </form>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-zinc-100 bg-zinc-50/50 px-6 py-4">
            <button
              type="button"
              className="h-10 rounded-lg border border-zinc-200 bg-white px-5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-50"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              form="project-form-dialog"
              disabled={submitting}
              className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "保存中..." : "保存"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
