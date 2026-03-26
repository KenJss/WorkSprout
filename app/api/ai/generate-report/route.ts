import { NextResponse } from "next/server";

import { postChatCompletions } from "@/lib/ai/openai-compatible";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";

export const dynamic = "force-dynamic";

type ReqBody = {
  project_ids?: string[];
  start_date?: string;
  end_date?: string;
  template_name?: string;
  template_prompt?: string;
};

function inRangeByDate(dateText: string | null | undefined, startMs: number, endMs: number) {
  if (!dateText) return false;
  const ms = new Date(dateText).getTime();
  if (Number.isNaN(ms)) return false;
  return ms >= startMs && ms <= endMs;
}

export async function POST(request: Request) {
  const { supabase, user } = await createSupabaseRouteClient();
  if (!supabase || !user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 });
  }

  const projectIds = Array.isArray(body.project_ids) ? body.project_ids.map(String).filter(Boolean) : [];
  const start = String(body.start_date ?? "");
  const end = String(body.end_date ?? "");
  const templateName = String(body.template_name ?? "报告模板");
  const templatePrompt = String(body.template_prompt ?? "").trim();

  if (!projectIds.length) return NextResponse.json({ error: "请至少选择一个项目" }, { status: 400 });
  if (!start || !end) return NextResponse.json({ error: "请提供开始/结束日期" }, { status: 400 });
  if (!templatePrompt) return NextResponse.json({ error: "模板提示词不能为空" }, { status: 400 });

  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T23:59:59`).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs) {
    return NextResponse.json({ error: "日期范围不合法" }, { status: 400 });
  }

  const [{ data: settings, error: settingsErr }, { data: projects, error: pErr }, { data: tasks, error: tErr }] =
    await Promise.all([
      supabase
        .from("user_ai_settings")
        .select("api_base_url, model, api_key, global_prompt, enabled")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("projects").select("id,name").in("id", projectIds),
      supabase
        .from("tasks")
        .select(
          "id,project_id,title,description,handling_notes,submitter,remark,status,start_at,end_at,created_at"
        )
        .in("project_id", projectIds),
    ]);

  if (settingsErr) return NextResponse.json({ error: settingsErr.message }, { status: 500 });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!settings?.enabled || !settings.api_key) {
    return NextResponse.json({ error: "请先启用并配置 AI API Key" }, { status: 400 });
  }

  const projectName = new Map((projects ?? []).map((p) => [String(p.id), String(p.name ?? "")]));
  const scopedTasks = (tasks ?? []).filter((t) => {
    const startHit = inRangeByDate((t.start_at as string | null) ?? null, startMs, endMs);
    const createdHit = inRangeByDate((t.created_at as string | null) ?? null, startMs, endMs);
    const endHit = inRangeByDate((t.end_at as string | null) ?? null, startMs, endMs);
    return startHit || createdHit || endHit;
  });

  const statusCount: Record<string, number> = {};
  for (const t of scopedTasks) {
    const s = String(t.status ?? "未知");
    statusCount[s] = (statusCount[s] ?? 0) + 1;
  }

  const taskLines = scopedTasks.slice(0, 500).map((t, idx) => {
    return [
      `${idx + 1}. [${projectName.get(String(t.project_id)) ?? "未知项目"}] ${String(t.title ?? "")}`,
      `状态=${String(t.status ?? "")} 开始=${String(t.start_at ?? "")} 结束=${String(t.end_at ?? "")}`,
      `提交人=${String(t.submitter ?? "")} 备注=${String(t.remark ?? "")}`,
      `问题=${String(t.description ?? "").slice(0, 300)}`,
      `处理=${String(t.handling_notes ?? "").slice(0, 300)}`,
    ].join(" | ");
  });

  const globalPrompt = typeof settings.global_prompt === "string" ? settings.global_prompt.trim() : "";
  const systemPrompt = [
    globalPrompt,
    "",
    "你是企业报告撰写助手。请严格按用户给出的“模板提示词”生成中文报告。",
    "要求：",
    "1) 输出为可直接粘贴的报告正文（Markdown 结构化格式）。",
    "2) 不要杜撰数据，基于输入统计与任务样本。",
    "3) 结尾给出风险与建议行动项（可执行）。",
  ].join("\n");

  const userPrompt = [
    `时间范围：${start} ~ ${end}`,
    `模板名称：${templateName}`,
    `模板提示词：${templatePrompt}`,
    "",
    `项目数：${projectIds.length}`,
    `任务数（范围内）：${scopedTasks.length}`,
    `状态统计：${JSON.stringify(statusCount)}`,
    "",
    "任务样本（最多500条）：",
    taskLines.join("\n"),
  ].join("\n");

  try {
    const { content } = await postChatCompletions({
      baseUrl: String(settings.api_base_url || "https://api.openai.com/v1"),
      apiKey: String(settings.api_key),
      model: String(settings.model || "gpt-4o-mini"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return NextResponse.json({ report: content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "生成失败";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
