-- =============================================================================
-- WorkSprout — 完整建表脚本
-- - 任务：问题描述 description、处理说明 handling_notes、领域 domain_id
-- - 项目/任务分类、领域：scope = global（仅 SQL 维护，应用内只读）| user（用户自建可改删）
-- 在 Supabase：SQL Editor → 执行
-- ⚠️ 会删除同名表。仅建议在「空库 / 可清空」时使用。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. 清理
-- -----------------------------------------------------------------------------
drop table if exists public.tasks cascade;
drop table if exists public.projects cascade;
drop table if exists public.task_domains cascade;
drop table if exists public.task_categories cascade;
drop table if exists public.project_categories cascade;
drop table if exists public.task_field_definitions cascade;
drop table if exists public.task_display_fields cascade;
drop table if exists public.project_status_options cascade;
drop table if exists public.task_status_options cascade;
drop table if exists public.user_task_field_definitions cascade;
drop table if exists public.user_task_display_fields cascade;
drop table if exists public.ai_prompt_defaults cascade;
drop table if exists public.user_ai_settings cascade;

drop type if exists public.project_status cascade;
drop type if exists public.task_status cascade;

-- -----------------------------------------------------------------------------
-- 1. 枚举
-- -----------------------------------------------------------------------------
create type public.project_status as enum (
  '待开始',
  '进行中',
  '暂停',
  '已结束',
  '已取消'
);

create type public.task_status as enum (
  '待办',
  '进行中',
  '已完成'
);

-- -----------------------------------------------------------------------------
-- 2. 状态目录
-- -----------------------------------------------------------------------------
create table public.project_status_options (
  code public.project_status primary key,
  sort_order int not null,
  label text not null
);

create table public.task_status_options (
  code public.task_status primary key,
  sort_order int not null,
  label text not null
);

create index project_status_options_sort_idx on public.project_status_options (sort_order);
create index task_status_options_sort_idx on public.task_status_options (sort_order);

-- -----------------------------------------------------------------------------
-- 3. 分类与领域（global / user）
-- -----------------------------------------------------------------------------
create table public.project_categories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'user')),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  value text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_categories_scope_user_ok check (
    (scope = 'global' and user_id is null) or
    (scope = 'user' and user_id is not null)
  )
);

create unique index project_categories_global_name_uidx
  on public.project_categories (lower(trim(name)))
  where scope = 'global';
create unique index project_categories_user_name_uidx
  on public.project_categories (user_id, lower(trim(name)))
  where scope = 'user';
create index project_categories_scope_user_idx on public.project_categories (scope, user_id);

create table public.task_categories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'user')),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  value text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_categories_scope_user_ok check (
    (scope = 'global' and user_id is null) or
    (scope = 'user' and user_id is not null)
  )
);

create unique index task_categories_global_name_uidx
  on public.task_categories (lower(trim(name)))
  where scope = 'global';
create unique index task_categories_user_name_uidx
  on public.task_categories (user_id, lower(trim(name)))
  where scope = 'user';
create index task_categories_scope_user_idx on public.task_categories (scope, user_id);

create table public.task_domains (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'user')),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  value text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_domains_scope_user_ok check (
    (scope = 'global' and user_id is null) or
    (scope = 'user' and user_id is not null)
  )
);

create unique index task_domains_global_name_uidx
  on public.task_domains (lower(trim(name)))
  where scope = 'global';
create unique index task_domains_user_name_uidx
  on public.task_domains (user_id, lower(trim(name)))
  where scope = 'user';
create index task_domains_scope_user_idx on public.task_domains (scope, user_id);

-- -----------------------------------------------------------------------------
-- 4. 项目
-- -----------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.projects (id) on delete cascade,
  name text not null,
  category_id uuid not null references public.project_categories (id) on delete restrict,
  start_at date,
  end_at date,
  status public.project_status not null default '待开始',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_dates_ok check (
    start_at is null or end_at is null or start_at <= end_at
  )
);

create index projects_parent_id_idx on public.projects (parent_id);

-- -----------------------------------------------------------------------------
-- 5. 任务
-- -----------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text not null,
  handling_notes text,
  submitter text,
  remark text,
  domain_id uuid not null references public.task_domains (id) on delete restrict,
  category_id uuid not null references public.task_categories (id) on delete restrict,
  status public.task_status not null default '待办',
  start_at date,
  end_at date,
  custom_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_dates_ok check (
    start_at is null or end_at is null or start_at <= end_at
  ),
  constraint tasks_custom_attributes_object check (jsonb_typeof(custom_attributes) = 'object')
);

create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_status_idx on public.tasks (status);
create index tasks_domain_id_idx on public.tasks (domain_id);

-- -----------------------------------------------------------------------------
-- 6. 自定义字段、展示列
-- -----------------------------------------------------------------------------
create table public.task_field_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  label text not null,
  input_type text not null default 'text',
  placeholder text,
  pattern text,
  min text,
  max text,
  step text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_field_definitions_key unique (key)
);

create index task_field_definitions_sort_idx on public.task_field_definitions (sort_order);

create table public.task_display_fields (
  singleton text primary key default 'global' check (singleton = 'global'),
  display_fields jsonb not null default '["title","description","status","domain_id","start_at","end_at","category_id"]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint task_display_fields_is_array check (jsonb_typeof(display_fields) = 'array')
);

-- -----------------------------------------------------------------------------
-- 6b. 用户 AI 大模型配置（API Key 仅存库，仅本人可读写）
-- -----------------------------------------------------------------------------
create table public.user_ai_settings (
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

create table public.ai_prompt_defaults (
  singleton text primary key default 'global' check (singleton = 'global'),
  global_prompt text not null,
  report_templates jsonb not null,
  updated_at timestamptz not null default now(),
  constraint ai_prompt_defaults_report_templates_is_array check (jsonb_typeof(report_templates) = 'array')
);

-- -----------------------------------------------------------------------------
-- 7. updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_categories_set_updated_at
  before update on public.project_categories
  for each row execute procedure public.set_updated_at();

create trigger task_categories_set_updated_at
  before update on public.task_categories
  for each row execute procedure public.set_updated_at();

create trigger task_domains_set_updated_at
  before update on public.task_domains
  for each row execute procedure public.set_updated_at();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute procedure public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

create trigger task_field_definitions_set_updated_at
  before update on public.task_field_definitions
  for each row execute procedure public.set_updated_at();

create trigger task_display_fields_set_updated_at
  before update on public.task_display_fields
  for each row execute procedure public.set_updated_at();

create trigger user_ai_settings_set_updated_at
  before update on public.user_ai_settings
  for each row execute procedure public.set_updated_at();

create trigger ai_prompt_defaults_set_updated_at
  before update on public.ai_prompt_defaults
  for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. RLS
-- -----------------------------------------------------------------------------
alter table public.project_status_options enable row level security;
alter table public.task_status_options enable row level security;
alter table public.project_categories enable row level security;
alter table public.task_categories enable row level security;
alter table public.task_domains enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_field_definitions enable row level security;
alter table public.task_display_fields enable row level security;
alter table public.user_ai_settings enable row level security;
alter table public.ai_prompt_defaults enable row level security;

create policy "project_status_options_select_auth"
  on public.project_status_options for select to authenticated using (true);
create policy "task_status_options_select_auth"
  on public.task_status_options for select to authenticated using (true);

-- 全局配置：仅可查（增删改只在 SQL Editor 以 postgres 执行）
create policy "project_categories_select_global"
  on public.project_categories for select to authenticated using (scope = 'global');
create policy "project_categories_select_user_own"
  on public.project_categories for select to authenticated
  using (scope = 'user' and user_id = auth.uid());
create policy "project_categories_insert_user_own"
  on public.project_categories for insert to authenticated
  with check (scope = 'user' and user_id = auth.uid());
create policy "project_categories_update_user_own"
  on public.project_categories for update to authenticated
  using (scope = 'user' and user_id = auth.uid())
  with check (scope = 'user' and user_id = auth.uid());
create policy "project_categories_delete_user_own"
  on public.project_categories for delete to authenticated
  using (scope = 'user' and user_id = auth.uid());

create policy "task_categories_select_global"
  on public.task_categories for select to authenticated using (scope = 'global');
create policy "task_categories_select_user_own"
  on public.task_categories for select to authenticated
  using (scope = 'user' and user_id = auth.uid());
create policy "task_categories_insert_user_own"
  on public.task_categories for insert to authenticated
  with check (scope = 'user' and user_id = auth.uid());
create policy "task_categories_update_user_own"
  on public.task_categories for update to authenticated
  using (scope = 'user' and user_id = auth.uid())
  with check (scope = 'user' and user_id = auth.uid());
create policy "task_categories_delete_user_own"
  on public.task_categories for delete to authenticated
  using (scope = 'user' and user_id = auth.uid());

create policy "task_domains_select_global"
  on public.task_domains for select to authenticated using (scope = 'global');
create policy "task_domains_select_user_own"
  on public.task_domains for select to authenticated
  using (scope = 'user' and user_id = auth.uid());
create policy "task_domains_insert_user_own"
  on public.task_domains for insert to authenticated
  with check (scope = 'user' and user_id = auth.uid());
create policy "task_domains_update_user_own"
  on public.task_domains for update to authenticated
  using (scope = 'user' and user_id = auth.uid())
  with check (scope = 'user' and user_id = auth.uid());
create policy "task_domains_delete_user_own"
  on public.task_domains for delete to authenticated
  using (scope = 'user' and user_id = auth.uid());

create policy "projects_all_auth"
  on public.projects for all to authenticated using (true) with check (true);
create policy "tasks_all_auth"
  on public.tasks for all to authenticated using (true) with check (true);
create policy "task_field_definitions_all_auth"
  on public.task_field_definitions for all to authenticated using (true) with check (true);
create policy "task_display_fields_all_auth"
  on public.task_display_fields for all to authenticated using (true) with check (true);

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

create policy "ai_prompt_defaults_select_auth"
  on public.ai_prompt_defaults for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- 9. 默认数据
-- -----------------------------------------------------------------------------
insert into public.task_display_fields (singleton, display_fields) values (
  'global',
  '["description","status","domain_id","handling_notes","start_at","end_at","category_id"]'::jsonb
);

insert into public.ai_prompt_defaults (singleton, global_prompt, report_templates) values (
  'global',
  $$你是 WorkSprout 工作台里的「任务录入与报告助手」。用户会粘贴一段口语化、邮件或聊天记录式的非结构化文字，你需要协助整理成可录入系统的任务信息；在报告场景下，你需要基于任务事实生成结构化汇报。
【通用原则】
读懂事实与诉求，不要编造用户没说的内容；不确定就写进 remark 并注明「待确认」。
输出风格专业、简洁，默认使用简体中文。
【任务录入字段建议】
title：一句话概括，尽量 8～20 个字，不用句号；突出「什么事」。
description：结构化写清：当前现象或问题，不要与 title 简单重复。
handling_notes：可执行的后续项：建议排查方向、需要对接的角色、风险或依赖、若有的时间节点；没有可执行项则填空字符串 ""。
submitter：任务的提交人，若无法判断则填空字符串 ""。
【任务类型与领域】
task_category_name 与 domain_name 必须与本次消息中给出的枚举列表中的某一条名称完全一致（逐字复制，含标点与空格），禁止自造、禁止同义词替换。
若信息不足无法判断，两个字段都填各自枚举列表中的第 1 条名称（系统会兜底，你仍应优先选最贴近原文的一项）。
【报告生成补充】
当用于报告生成时，请严格基于提供的任务样本与统计数据进行总结，不得杜撰；输出需分层清晰（概览、成果、风险、计划、待协同事项），并给出可执行建议。
【禁止】
不要在输出里解释你的推理过程；除 JSON（任务识别）或报告正文（报告生成）外不要输出其它无关内容。$$,
  $$[
    {"id":"work_summary","name":"工作汇报（管理视角）","prompt":"请输出结构化工作汇报，包含：一、总体概览；二、重点成果（按项目）；三、风险与阻塞；四、下阶段计划；五、需协同事项。语言简洁，适合周会/复盘会。"},
    {"id":"service_report","name":"服务报告（客户视角）","prompt":"请输出服务报告，包含：一、服务范围与时间窗口；二、事项处理明细与结果；三、SLA/时效观察；四、遗留问题与改进建议；五、下周期服务计划。语气专业、可对外发送。"}
  ]$$::jsonb
)
on conflict (singleton) do update set
  global_prompt = excluded.global_prompt,
  report_templates = excluded.report_templates;

insert into public.project_status_options (code, sort_order, label) values
  ('待开始', 1, '待开始'),
  ('进行中', 2, '进行中'),
  ('暂停', 3, '暂停'),
  ('已结束', 4, '已结束'),
  ('已取消', 5, '已取消')
on conflict (code) do update set sort_order = excluded.sort_order, label = excluded.label;

insert into public.task_status_options (code, sort_order, label) values
  ('待办', 1, '待办'),
  ('进行中', 2, '进行中'),
  ('已完成', 3, '已完成')
on conflict (code) do update set sort_order = excluded.sort_order, label = excluded.label;

-- 可选：全局示例（应用内不可改，仅可 SQL 删除/改）
insert into public.project_categories (scope, user_id, name, value) values
  ('global', null, '默认项目分类', '0');
insert into public.task_categories (scope, user_id, name, value) values
  ('global', null, '默认任务分类', '0');
insert into public.task_domains (scope, user_id, name, value) values
  ('global', null, '通用领域', '0');

-- -----------------------------------------------------------------------------
-- 10. 末级项目任务约束
-- -----------------------------------------------------------------------------
create or replace function public.tasks_only_under_leaf_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  child_count int;
begin
  select count(*)::int into child_count
  from public.projects c
  where c.parent_id = new.project_id;

  if child_count > 0 then
    raise exception 'tasks can only be created under leaf projects (no child rows)';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_leaf_project_only on public.tasks;
create trigger tasks_leaf_project_only
  before insert or update of project_id on public.tasks
  for each row execute procedure public.tasks_only_under_leaf_project();

-- =============================================================================
-- 全局配置请在 Supabase SQL Editor 以 postgres 角色执行 INSERT/UPDATE/DELETE；
-- 应用（anon key + 已登录）对 scope=global 行仅有 SELECT。
-- =============================================================================
