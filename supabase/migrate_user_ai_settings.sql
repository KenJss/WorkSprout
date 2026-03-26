-- 已有库增量：用户 AI 大模型配置
-- 在 Supabase SQL Editor 以 postgres 执行一次。

create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  api_base_url text not null default 'https://api.openai.com/v1',
  model text not null default 'gpt-4o-mini',
  api_key text not null default '',
  global_prompt text not null,
  report_templates jsonb not null,
  enabled boolean not null default true,
  last_test_ok boolean not null default false,
  last_tested_api_base_url text not null default '',
  last_tested_model text not null default '',
  last_tested_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_ai_settings_report_templates_is_array check (jsonb_typeof(report_templates) = 'array')
);

alter table public.user_ai_settings add column if not exists last_test_ok boolean not null default false;
alter table public.user_ai_settings add column if not exists last_tested_api_base_url text not null default '';
alter table public.user_ai_settings add column if not exists last_tested_model text not null default '';
alter table public.user_ai_settings add column if not exists last_tested_at timestamptz;

create table if not exists public.ai_prompt_defaults (
  singleton text primary key default 'global' check (singleton = 'global'),
  global_prompt text not null,
  report_templates jsonb not null,
  updated_at timestamptz not null default now(),
  constraint ai_prompt_defaults_report_templates_is_array check (jsonb_typeof(report_templates) = 'array')
);

drop trigger if exists user_ai_settings_set_updated_at on public.user_ai_settings;
create trigger user_ai_settings_set_updated_at
  before update on public.user_ai_settings
  for each row execute procedure public.set_updated_at();

alter table public.user_ai_settings enable row level security;

create policy "user_ai_settings_select_own"
  on public.user_ai_settings for select to authenticated
  using (user_id = auth.uid());
create policy "user_ai_settings_insert_own"
  on public.user_ai_settings for insert to authenticated
  with check (user_id = auth.uid());
create policy "user_ai_settings_update_own"
  on public.user_ai_settings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "user_ai_settings_delete_own"
  on public.user_ai_settings for delete to authenticated
  using (user_id = auth.uid());

alter table public.ai_prompt_defaults enable row level security;

create policy "ai_prompt_defaults_select_auth"
  on public.ai_prompt_defaults for select to authenticated
  using (true);
