import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GLOBAL_CONFIG_UNLOCK_COOKIE } from "@/lib/global-config-auth";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type { ReportTemplate } from "@/types";

export const dynamic = "force-dynamic";

type ConfigRow = { id: string; name: string; value: string };
type SaveBody = {
  project_categories?: ConfigRow[];
  task_categories?: ConfigRow[];
  task_domains?: ConfigRow[];
  global_prompt?: string;
  report_templates?: ReportTemplate[];
};

function normalizeRows(raw: unknown): ConfigRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x): ConfigRow | null => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : crypto.randomUUID();
      const name = typeof r.name === "string" ? r.name.trim() : "";
      const value = typeof r.value === "string" ? r.value : "";
      if (!name) return null;
      return { id, name, value };
    })
    .filter((x): x is ConfigRow => !!x);
}

function normalizeTemplates(raw: unknown): ReportTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x): ReportTemplate | null => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : `tpl_${crypto.randomUUID()}`;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      const prompt = typeof r.prompt === "string" ? r.prompt : "";
      if (!name) return null;
      return { id, name, prompt };
    })
    .filter((x): x is ReportTemplate => !!x);
}

async function isGlobalConfigUnlocked() {
  const jar = await cookies();
  return jar.get(GLOBAL_CONFIG_UNLOCK_COOKIE)?.value === "1";
}

async function replaceGlobalRows(
  table: "project_categories" | "task_categories" | "task_domains",
  rows: ConfigRow[]
) {
  const supabase = createSupabaseServiceClient();
  if (!supabase) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法保存全局分类/领域。");

  const { data: existing, error: qErr } = await supabase
    .from(table)
    .select("id")
    .eq("scope", "global");
  if (qErr) throw qErr;
  const keep = new Set(rows.map((x) => x.id));
  const deleteIds = (existing ?? [])
    .map((x) => String((x as Record<string, unknown>).id ?? ""))
    .filter((id) => id && !keep.has(id));
  if (deleteIds.length > 0) {
    const { error: dErr } = await supabase.from(table).delete().in("id", deleteIds).eq("scope", "global");
    if (dErr) throw dErr;
  }
  if (rows.length > 0) {
    const payload = rows.map((x) => ({
      id: x.id,
      scope: "global",
      user_id: null,
      name: x.name,
      value: x.value || "",
    }));
    const { error: uErr } = await supabase.from(table).upsert(payload, { onConflict: "id" });
    if (uErr) throw uErr;
  }
}

export async function GET() {
  const route = await createSupabaseRouteClient();
  if (!route.supabase || !route.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await isGlobalConfigUnlocked())) {
    return NextResponse.json(
      { error: "请先验证管理员密码", code: "UNLOCK_REQUIRED" },
      { status: 403 }
    );
  }

  const supabase = route.supabase;
  const [pc, tc, td, defaults] = await Promise.all([
    supabase.from("project_categories").select("id,name,value").eq("scope", "global").order("value"),
    supabase.from("task_categories").select("id,name,value").eq("scope", "global").order("value"),
    supabase.from("task_domains").select("id,name,value").eq("scope", "global").order("value"),
    supabase
      .from("ai_prompt_defaults")
      .select("global_prompt,report_templates")
      .eq("singleton", "global")
      .maybeSingle(),
  ]);
  if (pc.error || tc.error || td.error || defaults.error) {
    return NextResponse.json(
      { error: pc.error?.message || tc.error?.message || td.error?.message || defaults.error?.message || "加载失败" },
      { status: 500 }
    );
  }
  return NextResponse.json({
    project_categories: normalizeRows(pc.data),
    task_categories: normalizeRows(tc.data),
    task_domains: normalizeRows(td.data),
    global_prompt: typeof defaults.data?.global_prompt === "string" ? defaults.data.global_prompt : "",
    report_templates: normalizeTemplates(defaults.data?.report_templates),
  });
}

export async function POST(request: Request) {
  const route = await createSupabaseRouteClient();
  if (!route.supabase || !route.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await isGlobalConfigUnlocked())) {
    return NextResponse.json({ error: "请先验证管理员密码" }, { status: 403 });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "保存需要服务端配置 SUPABASE_SERVICE_ROLE_KEY（勿加 NEXT_PUBLIC），写入全局数据后请重启 dev。",
      },
      { status: 500 }
    );
  }

  let body: SaveBody = {};
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 });
  }

  try {
    const projectCategories = normalizeRows(body.project_categories);
    const taskCategories = normalizeRows(body.task_categories);
    const taskDomains = normalizeRows(body.task_domains);
    const reportTemplates = normalizeTemplates(body.report_templates);
    const globalPrompt = typeof body.global_prompt === "string" ? body.global_prompt : "";

    await replaceGlobalRows("project_categories", projectCategories);
    await replaceGlobalRows("task_categories", taskCategories);
    await replaceGlobalRows("task_domains", taskDomains);

    const { error: defaultsErr } = await supabase.from("ai_prompt_defaults").upsert(
      {
        singleton: "global",
        global_prompt: globalPrompt,
        report_templates: reportTemplates,
      },
      { onConflict: "singleton" }
    );
    if (defaultsErr) throw defaultsErr;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存失败" },
      { status: 500 }
    );
  }
}
