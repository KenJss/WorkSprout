-- 已有库增量：AI 测试通过状态持久化到 user_ai_settings
-- 在 Supabase SQL Editor 以 postgres 执行一次。

alter table public.user_ai_settings
  add column if not exists last_test_ok boolean not null default false;

alter table public.user_ai_settings
  add column if not exists last_tested_api_base_url text not null default '';

alter table public.user_ai_settings
  add column if not exists last_tested_model text not null default '';

alter table public.user_ai_settings
  add column if not exists last_tested_at timestamptz;
