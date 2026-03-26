import type { SupabaseClient } from "@supabase/supabase-js";

export type ConfigTableName = "project_categories" | "task_categories" | "task_domains";

/** 拉取全局 + 当前用户的配置项，先按 value 再按 name 排序（用于下拉） */
export async function fetchMergedConfigRows<T extends { id: string; name: string; value: string }>(
  supabase: SupabaseClient,
  table: ConfigTableName,
  userId: string
): Promise<T[]> {
  const order = { ascending: true } as const;
  const [globalRes, userRes] = await Promise.all([
    supabase.from(table).select("id,name,value").eq("scope", "global").order("value", order).order("name", order),
    supabase
      .from(table)
      .select("id,name,value")
      .eq("scope", "user")
      .eq("user_id", userId)
      .order("value", order)
      .order("name", order),
  ]);

  if (globalRes.error) throw globalRes.error;
  if (userRes.error) throw userRes.error;

  const g = (globalRes.data ?? []) as T[];
  const u = (userRes.data ?? []) as T[];
  return [...g, ...u];
}

/** 将历史 display_fields 中的 title 映射为 description */
export function normalizeDisplayFieldKeys(keys: string[]): string[] {
  return keys.map((k) => (k === "title" ? "description" : k));
}
