import { NextResponse } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route-client";
import type { ReportTemplate } from "@/types";

function normalizeReportTemplates(raw: unknown): ReportTemplate[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw
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
  return rows;
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

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user } = await createSupabaseRouteClient();
  if (!supabase || !user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_ai_settings")
    .select(
      "api_base_url, model, global_prompt, report_templates, enabled, updated_at, api_key, last_test_ok, last_tested_api_base_url, last_tested_model, last_tested_at"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const api_key_set = !!(data?.api_key && String(data.api_key).trim().length > 0);
  const can_use_ai = !!(data?.enabled && api_key_set);
  const can_generate_report =
    can_use_ai &&
    !!data?.last_test_ok &&
    ((data?.last_tested_api_base_url || "").trim().replace(/\/$/, "") ===
      (data?.api_base_url || "").trim().replace(/\/$/, "")) &&
    ((data?.last_tested_model || "").trim() === (data?.model || "").trim());
  const defaults = await getPromptDefaults(supabase);

  if (!data) {
    const { data: created, error: cErr } = await supabase
      .from("user_ai_settings")
      .insert({
        user_id: user.id,
        global_prompt: defaults.global_prompt,
        report_templates: defaults.report_templates,
      })
      .select(
        "api_base_url, model, global_prompt, report_templates, enabled, updated_at, api_key, last_test_ok, last_tested_api_base_url, last_tested_model, last_tested_at"
      )
      .single();
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }
    const createdKeySet = !!(created?.api_key && String(created.api_key).trim().length > 0);
    return NextResponse.json({
      settings: {
        api_base_url: created.api_base_url,
        model: created.model,
        global_prompt: created.global_prompt,
        report_templates: normalizeReportTemplates(created.report_templates),
        enabled: created.enabled,
        updated_at: created.updated_at,
        api_key_set: createdKeySet,
        last_test_ok: !!created.last_test_ok,
        last_tested_api_base_url: created.last_tested_api_base_url || "",
        last_tested_model: created.last_tested_model || "",
        last_tested_at: created.last_tested_at ?? null,
      },
      defaults,
      can_use_ai: !!(created?.enabled && createdKeySet),
      can_generate_report:
        !!(created?.enabled && createdKeySet) &&
        !!created.last_test_ok &&
        ((created.last_tested_api_base_url || "").trim().replace(/\/$/, "") ===
          (created.api_base_url || "").trim().replace(/\/$/, "")) &&
        ((created.last_tested_model || "").trim() === (created.model || "").trim()),
    });
  }

  return NextResponse.json({
    settings: {
      api_base_url: data.api_base_url,
      model: data.model,
      global_prompt: (data.global_prompt || "").trim() || defaults.global_prompt,
      report_templates:
        normalizeReportTemplates(data.report_templates).length > 0
          ? normalizeReportTemplates(data.report_templates)
          : defaults.report_templates,
      enabled: data.enabled,
      updated_at: data.updated_at,
      api_key_set,
      last_test_ok: !!data.last_test_ok,
      last_tested_api_base_url: data.last_tested_api_base_url || "",
      last_tested_model: data.last_tested_model || "",
      last_tested_at: data.last_tested_at ?? null,
    },
    defaults,
    can_use_ai,
    can_generate_report,
  });
}

type SaveBody = {
  api_base_url?: string;
  model?: string;
  api_key?: string;
  /** 为 true 时清空已保存的 Key */
  clear_api_key?: boolean;
  global_prompt?: string;
  report_templates?: ReportTemplate[];
  enabled?: boolean;
};

export async function POST(request: Request) {
  const { supabase, user } = await createSupabaseRouteClient();
  if (!supabase || !user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("user_ai_settings")
    .select("api_key, api_base_url, model, global_prompt, report_templates, enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  let apiKey = typeof existing?.api_key === "string" ? existing.api_key : "";
  if (typeof body.api_key === "string") {
    if (body.api_key.trim().length > 0) {
      apiKey = body.api_key.trim();
    } else if (body.clear_api_key === true) {
      apiKey = "";
    }
  }

  const existingBaseUrl =
    typeof existing?.api_base_url === "string" && existing.api_base_url.trim()
      ? existing.api_base_url.trim()
      : "";
  const api_base_url =
    typeof body.api_base_url === "string" && body.api_base_url.trim()
      ? body.api_base_url.trim().replace(/\/$/, "")
      : existingBaseUrl || "https://api.openai.com/v1";

  const existingModel =
    typeof existing?.model === "string" && existing.model.trim() ? existing.model.trim() : "";
  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : existingModel || "gpt-4o-mini";

  const defaults = await getPromptDefaults(supabase);
  const incomingPrompt = typeof body.global_prompt === "string" ? body.global_prompt : "";
  const existingPrompt = typeof existing?.global_prompt === "string" ? existing.global_prompt : "";
  const global_prompt = incomingPrompt.trim() ? incomingPrompt : existingPrompt || defaults.global_prompt;
  const normalizedTemplates = normalizeReportTemplates(
    Array.isArray(body.report_templates) ? body.report_templates : existing?.report_templates
  );
  const existingTemplates = normalizeReportTemplates(existing?.report_templates);
  const report_templates =
    normalizedTemplates.length > 0
      ? normalizedTemplates
      : existingTemplates.length > 0
        ? existingTemplates
        : defaults.report_templates;
  const enabled =
    typeof body.enabled === "boolean"
      ? body.enabled
      : typeof existing?.enabled === "boolean"
        ? existing.enabled
        : true;

  const { error } = await supabase.from("user_ai_settings").upsert(
    {
      user_id: user.id,
      api_base_url,
      model,
      api_key: apiKey,
      global_prompt,
      report_templates,
      enabled,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
