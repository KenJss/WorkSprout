import { NextResponse } from "next/server";

import {
  extractJsonObject,
  pickStr,
  postChatCompletions,
} from "@/lib/ai/openai-compatible";
import { fetchMergedConfigRows } from "@/lib/supabase/merged-config";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";

export const dynamic = "force-dynamic";

type Opt = { id: string; name: string };

function matchOption(items: Opt[], nameRaw: string | undefined, fallback: Opt | undefined): Opt | undefined {
  const name = nameRaw?.trim();
  if (!name) return fallback;
  const lower = name.toLowerCase();
  const exact = items.find((i) => i.name.trim().toLowerCase() === lower);
  if (exact) return exact;
  const partial = items.find(
    (i) =>
      i.name.trim().toLowerCase().includes(lower) || lower.includes(i.name.trim().toLowerCase())
  );
  return partial ?? fallback;
}

export async function POST(request: Request) {
  const { supabase, user } = await createSupabaseRouteClient();
  if (!supabase || !user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: { problemText?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 });
  }

  const problemText = typeof body.problemText === "string" ? body.problemText.trim() : "";
  if (!problemText) {
    return NextResponse.json({ error: "请提供 problemText" }, { status: 400 });
  }

  let categories: Opt[];
  let domains: Opt[];
  try {
    const [cats, doms] = await Promise.all([
      fetchMergedConfigRows<{ id: string; name: string; value: string }>(
        supabase,
        "task_categories",
        user.id
      ),
      fetchMergedConfigRows<{ id: string; name: string; value: string }>(
        supabase,
        "task_domains",
        user.id
      ),
    ]);
    categories = cats.map((c) => ({ id: String(c.id), name: String(c.name ?? "") }));
    domains = doms.map((d) => ({ id: String(d.id), name: String(d.name ?? "") }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "读取分类与领域失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (!categories.length || !domains.length) {
    return NextResponse.json(
      { error: "请先在「分类与领域」中配置至少一项任务类型与领域。" },
      { status: 400 }
    );
  }

  const { data: settings, error: setErr } = await supabase
    .from("user_ai_settings")
    .select("api_base_url, model, api_key, global_prompt, enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (setErr) {
    return NextResponse.json({ error: setErr.message }, { status: 500 });
  }

  if (!settings?.enabled || !settings.api_key || !String(settings.api_key).trim()) {
    return NextResponse.json({ error: "未配置大模型或已关闭，请先在设置中配置并保存 API Key。" }, { status: 400 });
  }

  const catNumbered = categories.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
  const domNumbered = domains.map((d, i) => `${i + 1}. ${d.name}`).join("\n");

  const global = typeof settings.global_prompt === "string" ? settings.global_prompt.trim() : "";

  const systemParts = [
    global,
    "",
    "你是任务信息抽取助手。用户会提供一段非结构化文字和两份「枚举名称」列表。你的工作是整理为结构化 JSON。",
    "",
    "【输出格式】只输出一个 JSON 对象，不要 Markdown 代码块，不要其它文字。字段均为字符串，键名必须英文：",
    "- title：10～40 字以内的标题，概括核心事项",
    "- description：把背景、现象、需求写清楚，可分段落语气",
    "- handling_notes：建议排查步骤、对接人、截止时间等；没有则 \"\"",
    "- submitter：提交人姓名/称呼；无法识别则 \"\"",
    "- task_category_name：字符串，必须与下方「任务类型枚举」中某一项的名称完全一致（逐字相同，含空格与标点，不要翻译或改写）",
    "- domain_name：字符串，必须与下方「领域枚举」中某一项的名称完全一致（同上）",
    "",
    "【枚举硬约束】task_category_name 和 domain_name 禁止自造名称、禁止同义词、禁止缩写；只能从用户消息里列出的枚举中复制一条。若无法判断，分别填该列表第 1 条的确切名称。",
    "",
    "【语言】title/description/handling_notes 使用与用户原文一致的语言（一般为中文），枚举字段必须与列表中的文字完全一致（列表是什么字就输出什么字）。",
  ];

  const userContent = [
    "### 原始问题（非结构化）\n" + problemText,
    "",
    "### 任务类型枚举（task_category_name 必须等于以下某一行「去掉序号后的整段文字」）\n" + catNumbered,
    "",
    "### 领域枚举（domain_name 必须等于以下某一行「去掉序号后的整段文字」）\n" + domNumbered,
  ].join("\n");

  let rawContent: string;
  try {
    const { content } = await postChatCompletions({
      baseUrl: String(settings.api_base_url || "https://api.openai.com/v1"),
      apiKey: String(settings.api_key),
      model: String(settings.model || "gpt-4o-mini"),
      messages: [
        { role: "system", content: systemParts.join("\n") },
        { role: "user", content: userContent },
      ],
      preferJsonObject: true,
    });
    rawContent = content;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let obj: Record<string, unknown>;
  try {
    obj = extractJsonObject(rawContent);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `解析模型输出失败：${msg}`, raw: rawContent.slice(0, 800) },
      { status: 502 }
    );
  }

  const title = pickStr(obj, "title", "标题") || problemText.slice(0, 80);
  const description = pickStr(obj, "description", "问题描述", "desc") || problemText;
  const handling_notes = pickStr(obj, "handling_notes", "handlingNotes", "处理说明");
  const submitter = pickStr(obj, "submitter", "reporter", "提交人", "提出人");

  const catName = pickStr(obj, "task_category_name", "category_name", "task_type", "类型");
  const domName = pickStr(obj, "domain_name", "领域");

  const catPick = matchOption(categories, catName, categories[0]);
  const domPick = matchOption(domains, domName, domains[0]);

  return NextResponse.json({
    title,
    description,
    handling_notes,
    submitter,
    category_id: catPick?.id ?? categories[0]!.id,
    domain_id: domPick?.id ?? domains[0]!.id,
  });
}
