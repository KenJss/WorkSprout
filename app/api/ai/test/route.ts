import { NextResponse } from "next/server";

import { postChatCompletions } from "@/lib/ai/openai-compatible";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";
import type { ReportTemplate } from "@/types";

export const dynamic = "force-dynamic";

type TestBody = {
  api_base_url?: string;
  model?: string;
  api_key?: string;
};

function normalizeReportTemplates(raw: unknown): ReportTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): ReportTemplate | null => {
      if (!r || typeof r !== "object") return null;
      const x = r as Record<string, unknown>;
      const id = typeof x.id === "string" ? x.id.trim() : "";
      const name = typeof x.name === "string" ? x.name.trim() : "";
      const prompt = typeof x.prompt === "string" ? x.prompt : "";
      if (!id || !name) return null;
      return { id, name, prompt };
    })
    .filter((x): x is ReportTemplate => !!x);
}

async function getPromptDefaults(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseRouteClient>>["supabase"]>
) {
  const { data } = await supabase
    .from("ai_prompt_defaults")
    .select("global_prompt, report_templates")
    .eq("singleton", "global")
    .maybeSingle();
  return {
    global_prompt: typeof data?.global_prompt === "string" ? data.global_prompt : "",
    report_templates: normalizeReportTemplates(data?.report_templates),
  };
}

export async function POST(request: Request) {
  const { supabase, user } = await createSupabaseRouteClient();
  if (!supabase || !user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: TestBody = {};
  try {
    const j = await request.json();
    if (j && typeof j === "object") body = j as TestBody;
  } catch {
    body = {};
  }

  let baseUrl = typeof body.api_base_url === "string" ? body.api_base_url.trim() : "";
  let model = typeof body.model === "string" ? body.model.trim() : "";
  let apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";

  const { data: existingSettings, error: existingErr } = await supabase
    .from("user_ai_settings")
    .select("api_base_url, model, api_key, global_prompt, report_templates, enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (!baseUrl || !model || !apiKey) {
    const data = existingSettings;
    if (!data?.api_key || !String(data.api_key).trim()) {
      return NextResponse.json(
        { error: "请填写 API Key 并在请求中传入，或先在设置中保存 Key。" },
        { status: 400 }
      );
    }
    baseUrl = baseUrl || String(data.api_base_url || "").replace(/\/$/, "");
    model = model || String(data.model || "");
    apiKey = apiKey || String(data.api_key || "");
  }

  const defaults = await getPromptDefaults(supabase);
  const persistedGlobalPrompt =
    typeof existingSettings?.global_prompt === "string" && existingSettings.global_prompt.trim()
      ? existingSettings.global_prompt
      : defaults.global_prompt;
  const persistedTemplates = (() => {
    const fromExisting = normalizeReportTemplates(existingSettings?.report_templates);
    if (fromExisting.length > 0) return fromExisting;
    return defaults.report_templates;
  })();
  const persistedEnabled =
    typeof existingSettings?.enabled === "boolean" ? existingSettings.enabled : true;

  if (!baseUrl || !model || !apiKey) {
    return NextResponse.json({ error: "缺少 API 地址、模型或 Key。" }, { status: 400 });
  }

  try {
    const { content } = await postChatCompletions({
      baseUrl,
      apiKey,
      model,
      messages: [
        { role: "system", content: "You are a connectivity test. Reply with exactly: OK" },
        { role: "user", content: "test" },
      ],
      preferJsonObject: false,
    });
    if (!content.trim()) {
      return NextResponse.json({ error: "模型返回为空" }, { status: 502 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("user_ai_settings")
      .upsert(
        {
          user_id: user.id,
          api_base_url: baseUrl,
          model,
          api_key: apiKey,
          global_prompt: persistedGlobalPrompt,
          report_templates: persistedTemplates,
          enabled: persistedEnabled,
          last_test_ok: false,
          last_tested_api_base_url: baseUrl,
          last_tested_model: model,
          last_tested_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const { error: updateErr } = await supabase
    .from("user_ai_settings")
    .upsert(
      {
        user_id: user.id,
        api_base_url: baseUrl,
        model,
        api_key: apiKey,
        global_prompt: persistedGlobalPrompt,
        report_templates: persistedTemplates,
        enabled: persistedEnabled,
        last_test_ok: true,
        last_tested_api_base_url: baseUrl,
        last_tested_model: model,
        last_tested_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "连接成功" });
}
