"use client";

import { useMemo, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import type { Project, ReportTemplate } from "@/types";

type QuickRangeKey =
  | "this_year"
  | "last_year"
  | "this_quarter"
  | "last_quarter"
  | "this_month"
  | "last_month"
  | "this_week"
  | "last_week";

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function quickRange(key: QuickRangeKey) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "this_year") return { start: `${y}-01-01`, end: `${y}-12-31` };
  if (key === "last_year") return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
  if (key === "this_month") {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return { start: toYmd(start), end: toYmd(end) };
  }
  if (key === "last_month") {
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { start: toYmd(start), end: toYmd(end) };
  }
  if (key === "this_quarter") {
    const qStart = Math.floor(m / 3) * 3;
    const start = new Date(y, qStart, 1);
    const end = new Date(y, qStart + 3, 0);
    return { start: toYmd(start), end: toYmd(end) };
  }
  if (key === "last_quarter") {
    const qStart = Math.floor(m / 3) * 3 - 3;
    const start = new Date(y, qStart, 1);
    const end = new Date(y, qStart + 3, 0);
    return { start: toYmd(start), end: toYmd(end) };
  }
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  if (key === "this_week") {
    const end = new Date(monday);
    end.setDate(monday.getDate() + 6);
    return { start: toYmd(monday), end: toYmd(end) };
  }
  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  return { start: toYmd(lastMonday), end: toYmd(lastSunday) };
}

function buildProjectPathMap(items: Project[]) {
  const byId = new Map(items.map((p) => [p.id, p]));
  const memo = new Map<string, string>();
  const getPath = (id: string): string => {
    if (memo.has(id)) return memo.get(id)!;
    const p = byId.get(id);
    if (!p) return "—";
    if (!p.parent_id) {
      memo.set(id, p.name);
      return p.name;
    }
    const path = `${getPath(p.parent_id)} / ${p.name}`;
    memo.set(id, path);
    return path;
  };
  for (const p of items) getPath(p.id);
  return memo;
}

export function ReportsClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [inited, setInited] = useState(false);
  const [canUseAi, setCanUseAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [hasTestedModel, setHasTestedModel] = useState(false);

  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(quickRange("this_week").start);
  const [endDate, setEndDate] = useState(quickRange("this_week").end);
  const [templateId, setTemplateId] = useState("");
  const [templatePrompt, setTemplatePrompt] = useState("");
  const [reportTemplates, setReportTemplates] = useState<ReportTemplate[]>([]);
  const [defaultReportTemplates, setDefaultReportTemplates] = useState<ReportTemplate[]>([]);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);

  const projectPathById = useMemo(() => buildProjectPathMap(projects), [projects]);
  const leafProjects = useMemo(() => {
    const parentSet = new Set<string>();
    for (const p of projects) {
      if (p.parent_id) parentSet.add(p.parent_id);
    }
    return projects.filter((p) => !parentSet.has(p.id));
  }, [projects]);

  if (!inited) {
    void (async () => {
      try {
        const [{ data: pData, error: pErr }, aiRes] = await Promise.all([
          supabase.from("projects").select("id,parent_id,name,category_id,start_at,end_at,status").order("name"),
          fetch("/api/ai/settings", { credentials: "include" }),
        ]);
        if (pErr) throw pErr;
        const aiData = (await aiRes.json()) as {
          can_use_ai?: boolean;
          can_generate_report?: boolean;
          settings?: {
            api_base_url?: string;
            model?: string;
            global_prompt?: string;
            report_templates?: ReportTemplate[];
          } | null;
          defaults?: { report_templates?: ReportTemplate[] };
        };
        const all = (pData ?? []) as Project[];
        const parentSet = new Set<string>();
        for (const p of all) {
          if (p.parent_id) parentSet.add(p.parent_id);
        }
        const leaves = all.filter((p) => !parentSet.has(p.id));
        setProjects(all);
        setSelectedProjectIds(leaves.map((p) => p.id));
        setCanUseAi(!!aiData.can_use_ai);
        setHasTestedModel(!!aiData.can_generate_report);
        const templates =
          Array.isArray(aiData.settings?.report_templates) ? aiData.settings.report_templates : [];
        const defaultTemplates = Array.isArray(aiData.defaults?.report_templates)
          ? aiData.defaults.report_templates
          : [];
        setReportTemplates(templates);
        setDefaultReportTemplates(defaultTemplates);
        setTemplateId(templates[0]?.id ?? "");
        setTemplatePrompt(templates[0]?.prompt ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "初始化失败");
      } finally {
        setInited(true);
      }
    })();
  }

  const selectedCount = useMemo(() => selectedProjectIds.length, [selectedProjectIds]);
  const currentTemplateSavedPrompt = useMemo(() => {
    return reportTemplates.find((t) => t.id === templateId)?.prompt ?? "";
  }, [reportTemplates, templateId]);
  const hasUnsavedTemplateChanges = templatePrompt !== currentTemplateSavedPrompt;

  function resetCurrentTemplateToDefault() {
    if (!templateId) {
      setError("请先选择一个模板。");
      return;
    }
    const hit = defaultReportTemplates.find((t) => t.id === templateId);
    if (!hit) {
      setError("系统默认模板中未找到当前模板，无法重置。");
      return;
    }
    setTemplatePrompt(hit.prompt ?? "");
    setError(null);
  }

  async function persistTemplates(nextTemplates: ReportTemplate[]) {
    const saveRes = await fetch("/api/ai/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_templates: nextTemplates }),
    });
    const saveData = (await saveRes.json()) as { error?: string };
    if (!saveRes.ok) throw new Error(saveData.error ?? "保存报告模板失败");
  }

  async function saveCurrentTemplateAndSwitch(nextId: string) {
    setError(null);
    const currentTemplateId = templateId || "custom_active";
    const currentTemplateName =
      reportTemplates.find((t) => t.id === currentTemplateId)?.name ?? "当前模板";
    const nextTemplates = (() => {
      const idx = reportTemplates.findIndex((t) => t.id === currentTemplateId);
      if (idx >= 0) {
        return reportTemplates.map((t, i) =>
          i === idx ? { ...t, prompt: templatePrompt } : t
        );
      }
      return [
        ...reportTemplates,
        { id: currentTemplateId, name: currentTemplateName, prompt: templatePrompt },
      ];
    })();

    try {
      await persistTemplates(nextTemplates);
      setReportTemplates(nextTemplates);
      setTemplateId(nextId);
      const hit = nextTemplates.find((t) => t.id === nextId);
      setTemplatePrompt(hit?.prompt ?? "");
      setPendingTemplateId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存并切换失败");
    }
  }

  async function onGenerate() {
    setError(null);
    setResult("");
    if (!canUseAi) return setError("当前未启用 AI 或未配置 API Key，请先到设置中完成配置。");
    if (!hasTestedModel) {
      return setError("当前模型尚未测试通过，请先到「AI 设置」点击“测试连接”并通过后再生成报告。");
    }
    if (!selectedProjectIds.length) return setError("请至少选择一个项目。");
    if (!startDate || !endDate) return setError("请选择开始/结束日期。");
    if (!templatePrompt.trim()) return setError("请先填写报告模板提示词。");
    setLoading(true);
    try {
      const currentTemplateId = templateId || "custom_active";
      const currentTemplateName =
        reportTemplates.find((t) => t.id === currentTemplateId)?.name ?? "当前模板";
      const nextTemplates = (() => {
        const idx = reportTemplates.findIndex((t) => t.id === currentTemplateId);
        if (idx >= 0) {
          return reportTemplates.map((t, i) =>
            i === idx ? { ...t, prompt: templatePrompt } : t
          );
        }
        return [
          ...reportTemplates,
          { id: currentTemplateId, name: currentTemplateName, prompt: templatePrompt },
        ];
      })();
      setReportTemplates(nextTemplates);
      setTemplateId(currentTemplateId);

      // 生成前将当前模板提示词保存为用户配置
      await persistTemplates(nextTemplates);

      const res = await fetch("/api/ai/generate-report", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_ids: selectedProjectIds,
          start_date: startDate,
          end_date: endDate,
          template_name: nextTemplates.find((t) => t.id === currentTemplateId)?.name ?? "自定义模板",
          template_prompt: templatePrompt,
        }),
      });
      const data = (await res.json()) as { error?: string; report?: string };
      if (!res.ok) throw new Error(data.error ?? "生成失败");
      setResult(data.report ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-xl border border-zinc-200 bg-white/80 p-3">
          <div className="text-sm font-semibold text-zinc-900">项目选择（仅末级，可多选）</div>
          <div className="mt-2 text-xs text-zinc-600">已选 {selectedCount} / {leafProjects.length}</div>
          <div className="mt-2 max-h-[300px] space-y-1 overflow-auto rounded-lg border border-zinc-200 bg-white p-2">
            {leafProjects.map((p) => {
              const checked = selectedProjectIds.includes(p.id);
              return (
                <label key={p.id} className="flex items-center gap-2 text-sm text-zinc-800">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setSelectedProjectIds((prev) =>
                        e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                      )
                    }
                  />
                  <span className="truncate" title={projectPathById.get(p.id) ?? p.name}>
                    {projectPathById.get(p.id) ?? p.name}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-3 text-sm font-semibold text-zinc-900">时间跨度</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["this_year", "本年"],
                ["last_year", "去年"],
                ["this_quarter", "本季度"],
                ["last_quarter", "上季度"],
                ["this_month", "本月"],
                ["last_month", "上月"],
                ["this_week", "本周"],
                ["last_week", "上周"],
              ] as Array<[QuickRangeKey, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  const r = quickRange(k);
                  setStartDate(r.start);
                  setEndDate(r.end);
                }}
                className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm" />
          </div>
        </aside>

        <main className="rounded-xl border border-zinc-200 bg-white/80 p-3">
          <div className="text-sm font-semibold text-zinc-900">报告模板（提示词）</div>
          <select
            value={templateId}
            onChange={(e) => {
              const id = e.target.value;
              if (hasUnsavedTemplateChanges) {
                setPendingTemplateId(id);
                return;
              }
              setTemplateId(id);
              const hit = reportTemplates.find((t) => t.id === id);
              if (hit) setTemplatePrompt(hit.prompt);
            }}
            className="mt-2 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
          >
            {reportTemplates.length === 0 ? <option value="">暂无模板（可先新增后保存）</option> : null}
            {reportTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <textarea
            value={templatePrompt}
            onChange={(e) => setTemplatePrompt(e.target.value)}
            rows={8}
            className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
          {pendingTemplateId ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              当前模板提示词有未保存修改，是否保存后再切换？
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPendingTemplateId(null)}
                  className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = pendingTemplateId;
                    setPendingTemplateId(null);
                    setTemplateId(id);
                    const hit = reportTemplates.find((t) => t.id === id);
                    setTemplatePrompt(hit?.prompt ?? "");
                  }}
                  className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  直接切换
                </button>
                <button
                  type="button"
                  onClick={() => void saveCurrentTemplateAndSwitch(pendingTemplateId)}
                  className="h-8 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  保存并切换
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-2">
            <button
              type="button"
              onClick={resetCurrentTemplateToDefault}
              disabled={!templateId}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              重置当前模板为系统默认
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={loading || !canUseAi || !hasTestedModel}
              className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "生成中..." : "生成报告"}
            </button>
            {result ? (
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(result)}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                复制结果
              </button>
            ) : null}
          </div>
          {!hasTestedModel ? (
            <div className="mt-2 text-xs text-amber-700">
              当前 AI 模型未测试通过，已禁用报告生成。请前往「设置 / AI」先执行并通过“测试连接”。
            </div>
          ) : null}

          <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-zinc-900">生成结果</div>
            <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
              {result || "点击“生成报告”后在此显示。"}
            </pre>
          </div>
        </main>
      </div>
    </div>
  );
}
