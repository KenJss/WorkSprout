"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import type { Task, TaskCategory, TaskDomain, TaskFieldDefinition, TaskFieldInputType, TaskStatus } from "@/types";

type TaskFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialTask: Task | null;
  projectId: string | null;
  taskCategories: TaskCategory[];
  taskDomains: TaskDomain[];
  fieldDefinitions: TaskFieldDefinition[];
  /** 已在设置中配置并启用大模型且保存了 API Key */
  aiParseAvailable?: boolean;
  onSaved: () => void;
};

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: "待办", label: "待办" },
  { value: "进行中", label: "进行中" },
  { value: "已完成", label: "已完成" },
];

function toInputDateValue(value: string | null) {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function formatSaveError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message: string }).message);
    const details = (err as { details?: string }).details;
    const hint = (err as { hint?: string }).hint;
    return [msg, details, hint].filter(Boolean).join(" — ");
  }
  if (err instanceof Error) return err.message;
  return "保存任务失败。";
}

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TaskForm({
  open,
  onOpenChange,
  mode,
  initialTask,
  projectId,
  taskCategories,
  taskDomains,
  fieldDefinitions,
  aiParseAvailable = false,
  onSaved,
}: TaskFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [handlingNotes, setHandlingNotes] = useState("");
  const [submitter, setSubmitter] = useState("");
  const [remark, setRemark] = useState("");
  const [domainId, setDomainId] = useState("");
  const [status, setStatus] = useState<TaskStatus>("待办");
  const [categoryId, setCategoryId] = useState("");
  const [startAt, setStartAt] = useState<string>("");
  const [endAt, setEndAt] = useState<string>("");

  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiProblemDraft, setAiProblemDraft] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const dialogTitle = useMemo(() => {
    return mode === "create" ? "创建任务" : "编辑任务";
  }, [mode]);

  const resolvedDefaultCategoryId = useMemo(() => {
    if (mode === "edit" && initialTask?.category_id) return initialTask.category_id;
    return taskCategories[0]?.id ?? "";
  }, [mode, initialTask, taskCategories]);

  const resolvedDefaultDomainId = useMemo(() => {
    if (mode === "edit" && initialTask?.domain_id) return initialTask.domain_id;
    return taskDomains[0]?.id ?? "";
  }, [mode, initialTask, taskDomains]);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setAiError(null);
    setAiProblemDraft("");

    if (mode === "edit" && initialTask) {
      setTitle(initialTask.title ?? "");
      setDescription(initialTask.description ?? "");
      setHandlingNotes(initialTask.handling_notes ?? "");
      setSubmitter(initialTask.submitter ?? "");
      setRemark(initialTask.remark ?? "");
      setDomainId(initialTask.domain_id || resolvedDefaultDomainId);
      setStatus(initialTask.status);
      setCategoryId(initialTask.category_id || resolvedDefaultCategoryId);
      setStartAt(toInputDateValue(initialTask.start_at) || todayLocalISODate());
      setEndAt(
        initialTask.status === "已完成" ? toInputDateValue(initialTask.end_at) || todayLocalISODate() : ""
      );
      setCustomValues(initialTask.custom_attributes ?? {});
    } else {
      setTitle("");
      setDescription("");
      setHandlingNotes("");
      setSubmitter("");
      setRemark("");
      setDomainId(resolvedDefaultDomainId);
      setStatus("待办");
      setCategoryId(resolvedDefaultCategoryId);
      setStartAt(todayLocalISODate());
      setEndAt("");
      const next: Record<string, string> = {};
      for (const def of fieldDefinitions) next[def.key] = "";
      setCustomValues(next);
    }
  }, [mode, initialTask, open, resolvedDefaultCategoryId, resolvedDefaultDomainId, fieldDefinitions]);

  async function runAiParse() {
    setAiError(null);
    const text = aiProblemDraft.trim();
    if (!text) {
      setAiError("请先输入要识别的原始问题描述。");
      return;
    }
    setAiParsing(true);
    try {
      const res = await fetch("/api/ai/parse-task", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemText: text }),
      });
      const data = (await res.json()) as {
        error?: string;
        title?: string;
        description?: string;
        handling_notes?: string;
        submitter?: string;
        category_id?: string;
        domain_id?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "识别失败");
      if (typeof data.title === "string") setTitle(data.title);
      if (typeof data.description === "string") setDescription(data.description);
      if (typeof data.handling_notes === "string") setHandlingNotes(data.handling_notes);
      if (typeof data.submitter === "string") setSubmitter(data.submitter);
      if (typeof data.category_id === "string" && taskCategories.some((c) => c.id === data.category_id)) {
        setCategoryId(data.category_id);
      }
      if (typeof data.domain_id === "string" && taskDomains.some((d) => d.id === data.domain_id)) {
        setDomainId(data.domain_id);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "识别失败");
    } finally {
      setAiParsing(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const titleTrimmed = title.trim();
    const descTrimmed = description.trim();
    if (!titleTrimmed) return setError("请填写标题。");
    if (!descTrimmed) return setError("请填写问题描述。");
    if (!taskCategories.length || !taskDomains.length) {
      return setError("请先在「分类与领域」中配置任务类型与领域。");
    }
    const cat = categoryId || taskCategories[0]!.id;
    const dom = domainId || taskDomains[0]!.id;
    if (!cat || !dom) return setError("请选择任务类型与领域。");
    if (mode === "create" && !projectId) return setError("未选择项目。");

    const startFinal = startAt || todayLocalISODate();
    let endFinal: string | null = null;
    if (status === "已完成") {
      endFinal = endAt || todayLocalISODate();
    }

    if (startFinal && endFinal) {
      const start = new Date(startFinal).getTime();
      const end = new Date(endFinal).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && start > end) {
        return setError("开始时间不能晚于结束时间。");
      }
    }

    for (const def of fieldDefinitions) {
      const raw = customValues[def.key] ?? "";
      if (!raw) continue;

      if (def.pattern) {
        try {
          const re = new RegExp(def.pattern);
          if (!re.test(raw)) return setError(`${def.label} 格式不正确。`);
        } catch {
          // ignore invalid pattern
        }
      }

      const inputType = (def.input_type ?? "text") as TaskFieldInputType;
      if (inputType === "number") {
        if (Number.isNaN(Number(raw))) return setError(`${def.label} 请输入有效数字。`);
      }

      if (inputType === "date") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return setError(`${def.label} 日期格式应为 YYYY-MM-DD。`);
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        title: titleTrimmed,
        description: descTrimmed,
        handling_notes: handlingNotes.trim() ? handlingNotes.trim() : null,
        submitter: submitter.trim() ? submitter.trim() : null,
        remark: remark.trim() ? remark.trim() : null,
        domain_id: dom,
        category_id: cat,
        status,
        start_at: startFinal,
        end_at: endFinal,
        custom_attributes: Object.fromEntries(
          Object.entries(customValues).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
        ),
      };

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      if (mode === "create") {
        const payloadWithProject = { ...payload, project_id: projectId };
        const { error } = await supabase.from("tasks").insert(payloadWithProject);
        if (error) throw error;
      } else {
        if (!initialTask) throw new Error("Missing task to edit.");

        const { error } = await supabase.from("tasks").update(payload).eq("id", initialTask.id);
        if (error) throw error;
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(formatSaveError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function renderCustomFieldInput(def: TaskFieldDefinition) {
    const value = customValues[def.key] ?? "";
    const inputType = (def.input_type ?? "text") as TaskFieldInputType;

    const commonClass =
      "h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10";

    if (inputType === "textarea") {
      return (
        <textarea
          value={value}
          onChange={(e) => setCustomValues((prev) => ({ ...prev, [def.key]: e.target.value }))}
          placeholder={def.placeholder ?? ""}
          className="min-h-[90px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
        />
      );
    }

    return (
      <input
        type={
          inputType === "datetime-local"
            ? "datetime-local"
            : inputType === "date"
              ? "date"
              : inputType === "number"
                ? "number"
                : inputType
        }
        value={value}
        onChange={(e) => setCustomValues((prev) => ({ ...prev, [def.key]: e.target.value }))}
        placeholder={def.placeholder ?? ""}
        min={def.min ?? undefined}
        max={def.max ?? undefined}
        step={def.step ?? undefined}
        className={commonClass}
      />
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-[3px]" />
        <Dialog.Content
          className={[
            "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[95vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-2xl shadow-zinc-900/15 outline-none",
            aiParseAvailable ? "max-w-xl" : "max-w-lg",
          ].join(" ")}
        >
          <Dialog.Title className="border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-white px-6 py-4 text-lg font-semibold tracking-tight text-zinc-900">
            {dialogTitle}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {mode === "create" ? "填写任务信息后保存以创建任务。" : "修改任务信息后保存。"}
          </Dialog.Description>

          <div className="max-h-[calc(90vh-8.5rem)] overflow-y-auto px-6 py-4">
            {error ? (
              <div className="mb-4 rounded-lg border border-red-200/80 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <form id="task-form-dialog" onSubmit={onSubmit} className="space-y-4">
            {aiParseAvailable ? (
              <div className="rounded-xl border border-violet-200/90 bg-gradient-to-br from-violet-50/90 to-white p-4 ring-1 ring-violet-100">
                <div className="text-sm font-semibold text-violet-950">AI 识别</div>
                <p className="mt-1 text-xs leading-relaxed text-violet-900/80">
                  粘贴口头/邮件里的原始问题，自动拆分到标题、问题描述、处理说明、提交人、任务类型与领域。也可到{" "}
                  <Link href="/settings/ai" className="font-medium underline">
                    大模型 API
                  </Link>{" "}
                  调整模型与提示词。
                </p>
                {aiError ? (
                  <div className="mt-2 rounded-md border border-red-200/80 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                    {aiError}
                  </div>
                ) : null}
                <textarea
                  value={aiProblemDraft}
                  onChange={(e) => setAiProblemDraft(e.target.value)}
                  placeholder="例如：用户反馈 App 在 iOS 18 上启动白屏，需要排查是否与最新 WebView 有关……"
                  rows={4}
                  disabled={aiParsing}
                  className="mt-2 w-full rounded-lg border border-violet-200/80 bg-white/90 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void runAiParse()}
                  disabled={aiParsing}
                  className="mt-2 h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                >
                  {aiParsing ? "识别中…" : "识别并填入下方字段"}
                </button>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900" htmlFor="task-title">
                标题
              </label>
              <input
                id="task-title"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 text-sm outline-none transition-colors focus:border-emerald-400/60 focus:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/25"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="简短标题，显示在看板卡片上"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900" htmlFor="task-description">
                问题描述
              </label>
              <textarea
                id="task-description"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述问题或需求"
                rows={3}
                className="min-h-[5rem] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900" htmlFor="task-handling-notes">
                处理说明
              </label>
              <textarea
                id="task-handling-notes"
                value={handlingNotes}
                onChange={(e) => setHandlingNotes(e.target.value)}
                placeholder="处理过程、结论等（可选）"
                rows={3}
                className="min-h-[4rem] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-900" htmlFor="task-submitter">
                  提交人（可选）
                </label>
                <input
                  id="task-submitter"
                  value={submitter}
                  onChange={(e) => setSubmitter(e.target.value)}
                  placeholder="例如：张三 / 客服小王"
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-900" htmlFor="task-remark">
                  备注（可选）
                </label>
                <input
                  id="task-remark"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="补充说明、来源、优先级等"
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900" htmlFor="task-category">
                任务类型
              </label>
              {taskCategories.length === 0 ? (
                <p className="text-xs leading-relaxed text-zinc-500">
                  暂无任务类型。请到{" "}
                  <Link href="/settings/configuration" className="font-medium text-zinc-800 underline">
                    分类与领域
                  </Link>{" "}
                  的「任务分类」中配置。
                </p>
              ) : (
                <select
                  id="task-category"
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                  value={categoryId || taskCategories[0]!.id}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  {taskCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900" htmlFor="task-domain">
                领域
              </label>
              {taskDomains.length === 0 ? (
                <p className="text-xs leading-relaxed text-zinc-500">
                  暂无领域可选。请到{" "}
                  <Link href="/settings/configuration" className="font-medium text-zinc-800 underline">
                    分类与领域
                  </Link>{" "}
                  添加全局（SQL）或个人领域。
                </p>
              ) : (
                <select
                  id="task-domain"
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                  value={domainId || taskDomains[0]!.id}
                  onChange={(e) => setDomainId(e.target.value)}
                  required
                >
                  {taskDomains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900" htmlFor="task-status">
                状态
              </label>
              <select
                id="task-status"
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                value={status}
                onChange={(e) => {
                  const v = e.target.value as TaskStatus;
                  setStatus(v);
                  if (v === "已完成") {
                    setEndAt((prev) => prev || todayLocalISODate());
                  } else {
                    setEndAt("");
                  }
                }}
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-900" htmlFor="task-start-at">
                  起始时间
                </label>
                <input
                  id="task-start-at"
                  type="date"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-900" htmlFor="task-end-at">
                  结束时间
                </label>
                <input
                  id="task-end-at"
                  type="date"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  disabled={status !== "已完成"}
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                />
              </div>
            </div>

            {fieldDefinitions.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-zinc-900">自定义字段</div>
                <div className="grid grid-cols-1 gap-3">
                  {fieldDefinitions
                    .slice()
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .map((def) => (
                      <div key={def.key} className="space-y-2">
                        <label className="text-sm font-medium text-zinc-900" htmlFor={`custom-${def.key}`}>
                          {def.label}
                        </label>
                        <div>{renderCustomFieldInput(def)}</div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
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
              form="task-form-dialog"
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
